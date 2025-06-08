import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { ImagesModulePublic } from './images/images.module.public'

@Module({
  imports: [PrismaModule, ImagesModulePublic],
})
export class AppModule {}
