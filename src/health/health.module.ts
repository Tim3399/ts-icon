import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * PrismaService is provided by PrismaModule, which is @Global() (see
 * prisma/prisma.module.ts) — no explicit import needed here, matching the
 * pattern already used by ImagesModulePublic/ImagesModuleLocal.
 *
 * MetricsModule is imported explicitly (it isn't global) so HealthService
 * can have MetricsService injected to record database errors surfaced by
 * its own readiness check.
 */
@Module({
  imports: [MetricsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
