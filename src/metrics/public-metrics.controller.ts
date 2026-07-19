import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PrivateNetworkGuard } from './private-network.guard';

/**
 * Exposes `/metrics` in the Prometheus text exposition format, restricted
 * to callers whose source IP is loopback or a private range (see
 * PrivateNetworkGuard). The `public` app has no authentication anywhere
 * else by design (a world-readable image endpoint, rate-limited instead),
 * so an unrestricted `/metrics` here would leak internal operational data
 * (request counts, error rates, route shapes) to anyone on the internet --
 * this endpoint gets its own IP-based guard instead of the JWT requirement
 * the `local` app uses everywhere.
 */
@Controller()
export class PublicMetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @UseGuards(PrivateNetworkGuard)
  @Get('metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.getMetricsText());
  }
}
