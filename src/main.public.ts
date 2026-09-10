import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.public";
import { IMG_WEB_PORT, LOG_LEVEL, validateDatabaseConfig, getTrustedProxies } from "../config";
import { AppLogger } from "./logging/app-logger";
import { configureHttp } from "./http/configure-http";
import { inputValidation } from "./http/input-validation";

async function bootstrap() {
  validateDatabaseConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new AppLogger({ json: process.env.NODE_ENV === "production", logLevel: LOG_LEVEL }),
  });
  configureHttp(app);
  app.enableShutdownHooks();
  const trustedProxies = getTrustedProxies();
  app.set("trust proxy", trustedProxies.length ? trustedProxies : false);
  app.useGlobalPipes(inputValidation());
  await app.listen(IMG_WEB_PORT);
}
void bootstrap().catch((error: unknown) => {
  console.error("Fatal error during bootstrap:", error);
  process.exit(1);
});
