import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics.module';
import { PublicMetricsController } from './public-metrics.controller';
import { PrivateNetworkGuard } from './private-network.guard';

/**
 * Wires MetricsModule's shared plumbing plus the `/metrics` endpoint for the
 * `public` app, gated by PrivateNetworkGuard since that app has no
 * authentication at all by design.
 */
@Module({
  imports: [MetricsModule],
  controllers: [PublicMetricsController],
  providers: [PrivateNetworkGuard],
})
export class MetricsPublicModule {}
