// src/app.module.ts
import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { ImagesModule } from './images/images.module'

@Module({
  imports: [PrismaModule, ImagesModule],
})
export class AppModule {}
