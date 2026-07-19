import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ImagesModulePublic } from './images/images.module.public';
import { HealthModule } from './health/health.module';
import { MetricsPublicModule } from './metrics/metrics-public.module';

@Module({
  imports: [
    PrismaModule,
    ImagesModulePublic,
    HealthModule,
    MetricsPublicModule,
  ],
})
export class AppModule {}
