import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request state that should be visible to any log line produced while
 * that request is being handled, no matter how deep in the call stack the
 * logging happens.
 */
export interface RequestContext {
  requestId: string;
}

/**
 * Node's built-in mechanism for propagating a value across an async call
 * chain without threading it through every function signature in between.
 * `AppLogger` (see `app-logger.ts`) reads `getRequestId()` when formatting
 * each log line, so any `new Logger('SomeContext').log(...)` call already
 * scattered throughout the codebase picks up the current request's id
 * automatically, with no changes needed at the call site.
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `callback` with `context` bound for the duration of its (possibly
 * async) execution. Everything invoked from within `callback` — including
 * code scheduled via promises, timers, or further async calls — sees the
 * same context via `getRequestId()`. Two calls to this function never see
 * each other's context, even when their executions interleave.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

/**
 * Returns the request id bound by the innermost enclosing
 * `runWithRequestContext` call, or `undefined` when called outside of any
 * request (e.g. during bootstrap, or in a background task never wrapped in
 * a request context).
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
