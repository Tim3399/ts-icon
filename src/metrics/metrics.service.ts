import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

/**
 * Owns the Prometheus registry and every metric definition for whichever
 * app imports MetricsModule. Each app (`public`/`local`) runs as its own
 * Nest application with its own DI container (see main.public.ts/
 * main.local.ts), so each gets its own MetricsService instance and its own
 * Registry -- there is no cross-app metric mixing, the same per-app-
 * instance pattern already used by HealthService.
 *
 * Every counter/histogram is instantiated exactly once here and injected
 * wherever it needs incrementing, rather than each call site constructing
 * its own prom-client metric object -- prom-client throws if the same
 * metric name is registered twice against one Registry, so a single shared
 * owner is required regardless of how many places increment a given metric.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /**
   * Generic HTTP request count, labeled by method/route/status. Recorded
   * globally by HttpMetricsInterceptor so every route -- including ones
   * added later -- is covered automatically without per-controller wiring.
   * `route` is always the Express path template (e.g.
   * "/images/:channelName"), never the raw URL, so a caller-controlled path
   * segment (a channel name, a probing 404 path) never becomes its own
   * label value.
   *
   * This one metric is also the intended source for two things that could
   * have been separate counters: rate-limit rejections (slice on
   * status="429") and the public image-fetch route's traffic (slice on
   * route="/images/:channelName") -- a dedicated counter for either would
   * just be a redundant view of what this already provides via its labels.
   */
  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests, labeled by method, route, and status code.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, labeled by method, route, and status code.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  /** Upload attempts on the `local` app, labeled by upload method and outcome. */
  readonly imageUploadsTotal = new Counter({
    name: 'image_uploads_total',
    help: 'Total channel image upload attempts, labeled by upload method (upload/from-url) and result (success/failure).',
    labelNames: ['method', 'result'] as const,
    registers: [this.registry],
  });

  /** Incremented directly in JwtAuthGuard's rejection branches (401s). */
  readonly authFailuresTotal = new Counter({
    name: 'auth_failures_total',
    help: 'Total requests rejected for missing or invalid authentication (401).',
    registers: [this.registry],
  });

  /** Incremented directly in RolesGuard's rejection branches (403s). */
  readonly authorizationFailuresTotal = new Counter({
    name: 'authorization_failures_total',
    help: 'Total requests rejected for insufficient role authorization (403).',
    registers: [this.registry],
  });

  /** TeamSpeak operations that failed, labeled by which operation failed. */
  readonly teamspeakErrorsTotal = new Counter({
    name: 'teamspeak_errors_total',
    help: 'Total TeamSpeak operations that failed, labeled by operation.',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  /** Database operations that failed, labeled by which operation failed. */
  readonly databaseErrorsTotal = new Counter({
    name: 'database_errors_total',
    help: 'Total database operations that failed, labeled by operation.',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  /** Outbound image-fetch requests rejected by SSRF validation, labeled by route. */
  readonly ssrfBlockedTotal = new Counter({
    name: 'ssrf_blocked_requests_total',
    help: 'Total outbound image-fetch requests blocked by SSRF validation, labeled by route.',
    labelNames: ['route'] as const,
    registers: [this.registry],
  });

  /** The registry's every metric, rendered in the Prometheus text exposition format. */
  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
