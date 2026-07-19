import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Confirms the database connection is actually alive by running a cheap
   * real query through it, rather than just checking that the injected
   * service instance exists. `findFirst()` with no arguments compiles down
   * to a single `LIMIT 1` lookup against the one table this app has — close
   * to a `SELECT 1` in cost, but exercised through the same Prisma
   * client/adapter real requests use, so it catches connection-level
   * failures a truthiness check never would.
   *
   * Returns a plain boolean rather than throwing: a failed readiness check
   * is an expected, regularly-polled outcome (e.g. during a database
   * restart), not an exceptional program state. The underlying error is
   * logged server-side for debugging but never propagated to the caller —
   * callers of this method only need to know "reachable or not".
   */
  async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.channelImage.findFirst();
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database readiness check failed: ${reason}`);
      this.metrics.databaseErrorsTotal.inc({ operation: 'readiness-check' });
      return false;
    }
  }
}
