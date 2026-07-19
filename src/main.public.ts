import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.public';
import { IMG_WEB_PORT, validateDatabaseConfig } from '../config';

async function bootstrap() {
  // Fail fast on missing DATABASE_URL in production rather than silently
  // falling back to the local dev.db default.
  validateDatabaseConfig();

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  await app.listen(IMG_WEB_PORT);
}
bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
