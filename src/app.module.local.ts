
import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { ImagesModuleLocal } from './images/images.module.local'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [AuthModule, PrismaModule, ImagesModuleLocal],
})
export class AppModule {}
