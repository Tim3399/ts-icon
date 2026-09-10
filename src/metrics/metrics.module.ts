import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { MetricsService } from "./metrics.service";
import { HttpMetricsMiddleware } from "./http-metrics.middleware";
import { ApiExceptionFilter } from "../http/api-exception.filter";

@Module({
  providers: [
    MetricsService,
    HttpMetricsMiddleware,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [MetricsService, HttpMetricsMiddleware],
})
export class MetricsModule {}
