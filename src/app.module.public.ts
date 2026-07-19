import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ImagesModulePublic } from './images/images.module.public';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, ImagesModulePublic, HealthModule],
})
export class AppModule {}
