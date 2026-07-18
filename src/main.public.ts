import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.public'
import { IMG_WEB_PORT } from '../config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  await app.listen(IMG_WEB_PORT)
}
bootstrap().catch((err: unknown) => {
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})