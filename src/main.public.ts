import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { IMG_WEB_PORT } from '../config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const config = new DocumentBuilder()
    .setTitle('TS Channel Icon API')
    .setDescription('Stellt Channel-Bilder bereit (GET)')
    .setVersion('1.0')
    .build()
  await app.listen(IMG_WEB_PORT)
}
bootstrap()