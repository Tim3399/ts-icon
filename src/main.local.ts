import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.local';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IMG_API_PORT, CORS_ORIGINS, validateDatabaseConfig, getTeamSpeakCredentials } from '../config';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Fail fast on missing/unsafe config before the app even starts listening.
  validateDatabaseConfig();
  getTeamSpeakCredentials();

  const app = await NestFactory.create(AppModule);

  if (CORS_ORIGINS.length > 0) {
    app.enableCors({ origin: CORS_ORIGINS });
  } else {
    logger.warn(
      'CORS_ORIGINS is not set — no cross-origin browser access will be enabled (no wildcard fallback). ' +
      'Set CORS_ORIGINS to a comma-separated list of allowed origins if a browser-based frontend needs to call this API.',
    );
  }

  // Swagger is unauthenticated today (auth guard lands in a later priority),
  // so only mount it outside production as an interim safeguard.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('TS Channel Icon API (Local)')
      .setDescription('Stellt Channel-Bilder bereit (POST, nur lokal)')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  } else {
    logger.warn('NODE_ENV=production — Swagger UI is disabled (unauthenticated docs must not be exposed in production).');
  }

  await app.listen(IMG_API_PORT);
}
bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});