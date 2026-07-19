import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * PrismaService is provided by PrismaModule, which is @Global() (see
 * prisma/prisma.module.ts) — no explicit import needed here, matching the
 * pattern already used by ImagesModulePublic/ImagesModuleLocal.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
