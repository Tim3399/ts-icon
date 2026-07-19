import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ImagesModuleLocal } from './images/images.module.local';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MetricsAdminModule } from './metrics/metrics-admin.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ImagesModuleLocal,
    HealthModule,
    MetricsAdminModule,
  ],
})
export class AppModule {}
