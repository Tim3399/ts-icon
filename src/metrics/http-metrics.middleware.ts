import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { MetricsService } from "./metrics.service";

function routeLabel(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  const path = typeof route?.path === "string" ? route.path : undefined;
  return path && !path.includes("*path") ? path : "unmatched";
}

/** Installed before guards so rejections and unmatched requests are counted too. */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    let recorded = false;
    const record = (aborted: boolean) => {
      if (recorded) return;
      recorded = true;
      const labels = {
        method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(
          request.method,
        )
          ? request.method
          : "OTHER",
        route: routeLabel(request),
        status: aborted ? "499" : String(response.statusCode),
      };
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDurationSeconds.observe(
        labels,
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    };
    response.once("finish", () => record(false));
    response.once("close", () => record(!response.writableFinished));
    next();
  }
}
