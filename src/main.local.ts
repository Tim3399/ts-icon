import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.local';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IMG_API_PORT, CORS_ORIGINS } from '../config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : '*',
  });

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('TS Channel Icon API (Local)')
    .setDescription('Stellt Channel-Bilder bereit (POST, nur lokal)')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(IMG_API_PORT);
}
bootstrap();