// Loads a local .env file into process.env, if one exists. Must be the
// first thing this module does: config.ts reads process.env at import time,
// so anything imported before this line would see an incomplete
// environment. Docker/Compose deployments set real environment variables
// directly and don't rely on this at all — this only matters for running
// the app directly (e.g. `npm run start:local`) outside a container, where
// nothing else would ever load `.env` into the process.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.local';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  IMG_API_PORT,
  CORS_ORIGINS,
  LOG_LEVEL,
  validateDatabaseConfig,
  getTeamSpeakCredentials,
  getOidcConfig,
  isAuthDisabled,
} from '../config';
import type { OidcConfig } from '../config';
import { version } from '../package.json';
import { createJwksKeyGetter } from './auth/jwks';
import { jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import { AppLogger } from './logging/app-logger';
import { requestIdMiddleware } from './logging/request-id.middleware';

const logger = new Logger('Bootstrap');

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header || !header.startsWith(BEARER_PREFIX)) return undefined;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Verifies the same Bearer JWT the app-wide request guard checks, applied as
 * plain Express middleware in front of every Swagger-related path.
 *
 * Swagger is mounted directly on the underlying HTTP adapter (see below),
 * outside Nest's controller routing, so the `local` app's `APP_GUARD`
 * providers never see requests to it at all — this middleware is the only
 * thing standing in front of it. It reuses the exact same JWKS key getter
 * (`createJwksKeyGetter`), the same `jose` `jwtVerify` call, and the same
 * `OidcConfig` the real guard uses, rather than reimplementing token
 * verification — so there remains exactly one place that resolves signing
 * keys (`jwks.ts`) and one library call that actually checks a token's
 * signature/issuer/audience/expiry. This function only adds the thin
 * "extract the bearer token, call jwtVerify, translate a rejection into a
 * 401" wiring needed to sit in front of a plain Express router instead of a
 * Nest guard/controller.
 */
function createSwaggerAuthMiddleware(
  oidcConfig: OidcConfig,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const getKey = createJwksKeyGetter(oidcConfig.issuerUrl);

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
      return;
    }

    try {
      await jwtVerify(token, getKey, {
        issuer: oidcConfig.issuerUrl,
        audience: oidcConfig.audience,
        algorithms: ['RS256'],
      });
      next();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn(
        `Rejected Swagger UI request with an invalid token: ${reason}`,
      );
      res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    }
  };
}

async function bootstrap() {
  // Fail fast on missing/unsafe config before the app even starts listening.
  validateDatabaseConfig();
  getTeamSpeakCredentials();
  const authDisabled = isAuthDisabled();
  if (authDisabled) {
    logger.warn(
      'AUTH_DISABLED=true — this instance has NO authentication. Every /images-local ' +
        'endpoint is open to any loopback/private-network caller (see NoAuthGuard). ' +
        'Never set this on a network-reachable host.',
    );
  }
  const oidcConfig = authDisabled ? undefined : getOidcConfig();

  // Custom logger passed via NestFactory.create's `logger` option (not
  // app.useLogger(...) afterwards) so it's already in place for Nest's own
  // bootstrap-time log lines, not just ones emitted after this call
  // resolves. Every existing `new Logger('SomeContext')` call site
  // elsewhere in this app is unaffected by this change and automatically
  // gets JSON output in production, the configured LOG_LEVEL, and the
  // current request id, without any of those call sites changing.
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger({
      json: process.env.NODE_ENV === 'production',
      logLevel: LOG_LEVEL,
    }),
  });
  app.enableShutdownHooks();

  // Registered as plain Express middleware ahead of Nest's own routing, so
  // the request id it establishes is available to guards/interceptors/
  // controllers alike, not just to code reachable from a controller.
  app.use(requestIdMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (CORS_ORIGINS.length > 0) {
    app.enableCors({ origin: CORS_ORIGINS });
  } else {
    logger.warn(
      'CORS_ORIGINS is not set — no cross-origin browser access will be enabled (no wildcard fallback). ' +
        'Set CORS_ORIGINS to a comma-separated list of allowed origins if a browser-based frontend needs to call this API.',
    );
  }

  // Swagger is mounted directly on the underlying HTTP adapter rather than
  // as a routed controller, so the global JWT guard applied elsewhere in
  // this app never sees requests to it. It stays gated to non-production
  // (unauthenticated API docs should not ship to prod at all) — and, on top
  // of that gate rather than instead of it, every request under /swagger now
  // also has to present a valid Bearer token, verified below -- except in
  // AUTH_DISABLED mode, where there's no OidcConfig to verify against and
  // the rest of the app has no auth either, so gating just Swagger on its
  // own wouldn't mean anything.
  if (process.env.NODE_ENV !== 'production') {
    if (oidcConfig) {
      const swaggerAuth = createSwaggerAuthMiddleware(oidcConfig);
      // Registered as unscoped middleware rather than `app.use('/swagger',
      // ...)`: @nestjs/swagger also serves the raw document at `/swagger-json`
      // and `/swagger-yaml`, paths that do not sit under a `/swagger/` prefix,
      // so an Express path-prefix mount would miss them. Matching on
      // `req.path` here covers the UI, its static assets, and both document
      // endpoints with a single check.
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (!req.path.startsWith('/swagger')) {
          next();
          return;
        }
        void swaggerAuth(req, res, next);
      });
    } else {
      logger.warn(
        'AUTH_DISABLED=true — Swagger UI has no authentication in this mode.',
      );
    }

    const config = new DocumentBuilder()
      .setTitle('TS Channel Icon API (Local)')
      .setDescription(
        'Provides channel image editing endpoints (POST, local only)',
      )
      .setVersion(version)
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  } else {
    logger.warn(
      'NODE_ENV=production — Swagger UI is disabled (unauthenticated docs must not be exposed in production).',
    );
  }

  await app.listen(IMG_API_PORT);
}
bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
