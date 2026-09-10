import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "../metrics/metrics.service";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /** Checks each required table without loading image data. */
  async checkDatabase(): Promise<boolean> {
    try {
      await Promise.all([
        this.prisma.channelImage.findFirst({ select: { id: true } }),
        this.prisma.channelImageAlias.findFirst({ select: { imageId: true } }),
        this.prisma.channelReference.findFirst({ select: { cid: true } }),
        this.prisma.wallpaperRun.findFirst({ select: { id: true } }),
        this.prisma.wallpaperRunRow.findFirst({ select: { runId: true } }),
      ]);
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database readiness check failed: ${reason}`);
      this.metrics.databaseErrorsTotal.inc({ operation: "readiness-check" });
      return false;
    }
  }
}
