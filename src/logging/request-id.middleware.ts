import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

const REQUEST_ID_HEADER = 'x-request-id';
const RESPONSE_HEADER_NAME = 'X-Request-Id';

function readIncomingRequestId(req: Request): string | undefined {
  const header = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.trim().length > 0 ? value : undefined;
}

/**
 * Correlates every log line produced while handling a single request with
 * that request, without requiring any handler/service in the call chain to
 * accept or forward a request id explicitly.
 *
 * Reuses the incoming `X-Request-Id` header when a caller (e.g. a reverse
 * proxy, or another service) already supplied one, otherwise generates a
 * fresh one. Echoes the id back on the response so a client can correlate
 * its own logs with ours, then runs the rest of the request inside an
 * `AsyncLocalStorage` context (see `request-context.ts`) so `AppLogger` can
 * read it back out while formatting any log line emitted during this
 * request's handling.
 *
 * Registered as plain Express middleware directly in each app's bootstrap
 * (`app.use(requestIdMiddleware)`), rather than as a Nest module-level
 * middleware, so it runs ahead of Nest's own routing/guards/interceptors —
 * the request id is available to all of them, not just to controller code.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = readIncomingRequestId(req) ?? randomUUID();

  res.setHeader(RESPONSE_HEADER_NAME, requestId);

  runWithRequestContext({ requestId }, next);
}
