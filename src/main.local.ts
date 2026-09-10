import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module.local";
import {
  IMG_API_PORT,
  CORS_ORIGINS,
  LOG_LEVEL,
  validateDatabaseConfig,
  getTeamSpeakCredentials,
  getOidcConfig,
  isAuthDisabled,
  getTrustedProxies,
} from "../config";
import { version } from "../package.json";
import { createJwksKeyGetter } from "./auth/jwks";
import { swaggerAccess } from "./auth/swagger-access";
import { AppLogger } from "./logging/app-logger";
import { configureHttp } from "./http/configure-http";
import { inputValidation } from "./http/input-validation";

async function bootstrap() {
  validateDatabaseConfig();
  getTeamSpeakCredentials();
  const authDisabled = isAuthDisabled();
  const oidc = authDisabled ? undefined : getOidcConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new AppLogger({ json: process.env.NODE_ENV === "production", logLevel: LOG_LEVEL }),
  });
  configureHttp(
    app,
    CORS_ORIGINS.length
      ? {
          origin: CORS_ORIGINS,
          exposedHeaders: ["X-Request-Id", "ETag", "Retry-After"],
        }
      : undefined,
  );
  app.enableShutdownHooks();
  const trustedProxies = getTrustedProxies();
  // The unauthenticated developer listener is direct, loopback-only and never trusts proxies.
  app.set("trust proxy", !authDisabled && trustedProxies.length ? trustedProxies : false);
  app.useGlobalPipes(inputValidation());

  if (process.env.NODE_ENV !== "production") {
    const getKey = oidc ? createJwksKeyGetter(oidc.issuerUrl) : undefined;
    app.use(swaggerAccess(oidc, getKey));
    const builder = new DocumentBuilder()
      .setTitle("TeamSpeak banner API")
      .setDescription("Manage channel banners and recoverable wallpaper operations")
      .setVersion(version)
      .addBearerAuth();
    if (oidc) {
      builder.addOAuth2({
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: `${oidc.issuerUrl}/protocol/openid-connect/auth`,
            tokenUrl: `${oidc.issuerUrl}/protocol/openid-connect/token`,
            scopes: { openid: "Sign in with Keycloak" },
          },
        },
      });
    }
    const document = SwaggerModule.createDocument(app, builder.build());
    document.security = [{ bearer: [] }, ...(oidc ? [{ oauth2: ["openid"] }] : [])];
    SwaggerModule.setup("swagger", app, document, {
      swaggerOptions: {
        persistAuthorization: false,
        initOAuth: oidc
          ? { clientId: oidc.audience, usePkceWithAuthorizationCodeGrant: true }
          : undefined,
      },
    });
  }
  if (authDisabled)
    Logger.warn(
      "Local development authentication is disabled; listening only on 127.0.0.1",
      "Bootstrap",
    );
  await app.listen(IMG_API_PORT, authDisabled ? "127.0.0.1" : "0.0.0.0");
}

void bootstrap().catch((error: unknown) => {
  console.error("Fatal error during bootstrap:", error);
  process.exit(1);
});
