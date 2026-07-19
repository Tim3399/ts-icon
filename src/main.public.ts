import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.public';
import { IMG_WEB_PORT, LOG_LEVEL, validateDatabaseConfig } from '../config';
import { AppLogger } from './logging/app-logger';
import { requestIdMiddleware } from './logging/request-id.middleware';

async function bootstrap() {
  // Fail fast on missing DATABASE_URL in production rather than silently
  // falling back to the local dev.db default.
  validateDatabaseConfig();

  // Custom logger passed via NestFactory.create's `logger` option so every
  // existing `new Logger('SomeContext')` call site in this app automatically
  // gets JSON output in production, the configured LOG_LEVEL, and the
  // current request id, without changing any of those call sites.
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

  await app.listen(IMG_WEB_PORT);
}
bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
