import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

const NANOSECONDS_PER_SECOND = 1e9;

/**
 * Express sets `req.route` once a request is matched to a registered
 * route -- its `.path` is the path *template* as registered (e.g.
 * "/images/:channelName"), including the controller's own path prefix,
 * since Nest's Express adapter registers each route's full combined path
 * directly rather than through a per-controller sub-router. A request that
 * never matched any route at all (a bare 404) has no `req.route`, so it's
 * labeled "unmatched" instead of being skipped -- that keeps it visible in
 * aggregate without creating one label value per arbitrary probing path.
 */
function getRouteLabel(req: Request): string {
  // Express types `Request.route` as `any` itself, so it has to be
  // asserted to something narrower before it's safe to read `.path` off
  // of it -- an intersection with `Request` wouldn't help here, since
  // `any` absorbs any type it's intersected with.
  const route = req.route as { path?: unknown } | undefined;
  return route && typeof route.path === 'string' ? route.path : 'unmatched';
}

/**
 * Records generic HTTP request count/duration for every route in whichever
 * app this is registered in (see MetricsModule, which applies it globally
 * via APP_INTERCEPTOR) -- new routes are covered automatically, with no
 * per-controller-method metrics wiring needed.
 *
 * Reads the final status code and timing off the Express response's
 * 'finish' event rather than from this interceptor's own `next.handle()`
 * pipeline: an error thrown by a handler is only mapped to its eventual
 * status code by Nest's exception filter *after* it leaves this
 * interceptor, so observing from inside the interceptor's own success/error
 * callbacks would either miss the real status or require duplicating that
 * mapping. 'finish' fires once, after the complete response (success or
 * error) has actually been sent, and sees the true final `res.statusCode`
 * either way.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();
    const start = process.hrtime.bigint();

    res.once('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / NANOSECONDS_PER_SECOND;
      const labels = {
        method: req.method,
        route: getRouteLabel(req),
        status: String(res.statusCode),
      };
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDurationSeconds.observe(labels, durationSeconds);
    });

    return next.handle();
  }
}
