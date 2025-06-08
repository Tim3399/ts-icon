import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { ImagesModuleLocal } from './images/images.module.local'

@Module({
  imports: [PrismaModule, ImagesModuleLocal],
})
export class AppModule {}
