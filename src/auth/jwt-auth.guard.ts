import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JWKS_KEY_GETTER, OIDC_CONFIG } from './auth.tokens';
import { toRequestUser } from './request-user';
import type { OidcConfig } from '../../config';
import { MetricsService } from '../metrics/metrics.service';

const BEARER_PREFIX = 'Bearer ';

/**
 * Only RS256 is accepted, matching Keycloak's default signing algorithm.
 * Verification must pin this explicitly rather than trusting whatever `alg`
 * a presented token's header claims — otherwise a token signed with a weak
 * or unintended algorithm (or, classically, `alg: none`) could be accepted
 * just because the attacker asked for it.
 */
const ALLOWED_ALGORITHMS = ['RS256'];

function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Verifies the `Authorization: Bearer <token>` header on every request
 * against the configured Keycloak issuer's JWKS, applied globally to the
 * `local` app (see AuthModule). Verification checks:
 *  - signature, against the issuer's live JWKS (fetched/cached by
 *    `createRemoteJWKSet`, see jwks.ts), via `jose`'s `jwtVerify`
 *  - `iss` matches the configured issuer exactly, via `jwtVerify`
 *  - `exp`/`nbf`, automatically as part of `jwtVerify` — expired or
 *    not-yet-valid tokens are rejected before this guard sees a payload at
 *    all
 *  - signature algorithm restricted to RS256 only, via `jwtVerify`
 *  - `azp` (authorized party) matches the configured audience, checked
 *    manually after `jwtVerify` succeeds — *not* the `aud` claim. Keycloak
 *    does not reliably include the requesting client's own id in `aud`
 *    without a dedicated audience mapper (see `agents/keycloak.md`), but it
 *    always sets `azp` to the client the token was issued to, so that's the
 *    claim actually being relied on here to confirm this token was meant
 *    for this API.
 *
 * Any failure (missing header, malformed header, bad signature, wrong
 * issuer/authorized party, expired/not-yet-valid) results in a generic 401
 * to the client — the specific reason is logged server-side only, never
 * returned in the response, so a caller probing the endpoint can't
 * distinguish "your token expired" from "your token is for the wrong
 * client" from "that signature is forged".
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(JWKS_KEY_GETTER) private readonly getKey: JWTVerifyGetKey,
    @Inject(OIDC_CONFIG) private readonly oidcConfig: OidcConfig,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      this.logger.warn(
        'Rejected request with a missing or malformed Authorization header',
      );
      this.metrics.authFailuresTotal.inc();
      throw new UnauthorizedException();
    }

    try {
      const { payload } = await jwtVerify(token, this.getKey, {
        issuer: this.oidcConfig.issuerUrl,
        algorithms: ALLOWED_ALGORITHMS,
      });
      if (payload.azp !== this.oidcConfig.audience) {
        throw new Error(
          `Token azp (authorized party) does not match the configured audience`,
        );
      }
      request.user = toRequestUser(payload);
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Rejected request with an invalid token: ${reason}`);
      this.metrics.authFailuresTotal.inc();
      throw new UnauthorizedException();
    }
  }
}
