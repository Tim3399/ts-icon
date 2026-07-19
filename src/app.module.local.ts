import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ImagesModuleLocal } from './images/images.module.local';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AuthModule, PrismaModule, ImagesModuleLocal, HealthModule],
})
export class AppModule {}
