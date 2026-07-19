import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Exposes `/metrics` in the Prometheus text exposition format. Registered
 * only by MetricsAdminModule (the `local` app) -- deliberately not marked
 * `@Public()`, so it inherits the same global JWT guard as every other
 * route in that app rather than needing any special-casing of its own. A
 * Prometheus scrape job authenticates like any other client, via a static
 * bearer token configured in its own scrape config.
 */
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.getMetricsText());
  }
}
