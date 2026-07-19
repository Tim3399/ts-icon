import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

/**
 * Shared Prometheus plumbing: the metric registry/definitions
 * (MetricsService) plus the generic HTTP request counter/histogram,
 * registered globally via APP_INTERCEPTOR so new routes are covered
 * automatically without per-controller wiring.
 *
 * Imported by whichever modules need to inject MetricsService directly
 * (AuthModule's guards, ImagesModuleLocal's controller, HealthService) as
 * well as by MetricsAdminModule/MetricsPublicModule, which additionally
 * expose the `/metrics` HTTP endpoint itself under each app's own access
 * rules. Nest treats a module as a single node regardless of how many other
 * modules import it, so importing this from several places within one
 * app's module graph does not register the interceptor more than once.
 */
@Module({
  providers: [
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
