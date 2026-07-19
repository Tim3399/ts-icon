import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics.module';
import { MetricsController } from './metrics.controller';

/**
 * Wires MetricsModule's shared plumbing plus the `/metrics` endpoint for the
 * `local` app. MetricsController is not marked `@Public()`, so it inherits
 * the app's global JWT guard like every other route there -- no dedicated
 * IP restriction is needed on this side (see MetricsPublicModule for the
 * `public` app, which has no such guard to inherit from).
 */
@Module({
  imports: [MetricsModule],
  controllers: [MetricsController],
})
export class MetricsAdminModule {}
