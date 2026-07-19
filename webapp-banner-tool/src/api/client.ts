/**
 * Small central fetch wrapper for the admin/local API.
 *
 * - Attaches `Authorization: Bearer <token>` only when a token is available
 *   (via a static `token` or a `getToken` callback, e.g. from `useAuth()`).
 * - Adds a request timeout via `AbortController` (default ~10s, longer for
 *   uploads since image uploads can legitimately take longer).
 * - Throws `ApiError` with a `category` so callers can show distinct
 *   messages for unauthenticated (401), forbidden (403), rate-limited (429,
 *   including `Retry-After` if present), server errors (5xx), a request
 *   timeout, and generic network failures — instead of one generic Error.
 *
 * Deliberately minimal: no interceptor chains, no retry logic.
 */

export type ApiErrorCategory =
  | 'unauthorized'
  | 'forbidden'
  | 'rate-limited'
  | 'server-error'
  | 'timeout'
  | 'network'
  | 'unknown';

export class ApiError extends Error {
  readonly category: ApiErrorCategory;
  readonly status?: number;
  /** Raw `Retry-After` header value (seconds or HTTP-date), if the server sent one. */
  readonly retryAfter?: string | null;

  constructor(message: string, category: ApiErrorCategory, status?: number, retryAfter?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.category = category;
    this.status = status;
    this.retryAfter = retryAfter ?? undefined;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'signal'> {
  /** A ready-to-use token. Takes precedence over `getToken` if both are given. */
  token?: string;
  /** Resolves the current (possibly refreshed) token, e.g. `useAuth().getToken`. */
  getToken?: () => Promise<string | undefined>;
  /** Request timeout in ms. Defaults to 10s (30s for uploads via `apiUpload`). */
  timeoutMs?: number;
}

/** Default timeout for regular requests (reads, small writes). */
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Longer timeout for uploads / server-side URL fetches, which can take longer. */
export const UPLOAD_TIMEOUT_MS = 30_000;

async function resolveToken(options: ApiRequestOptions): Promise<string | undefined> {
  if (options.token) return options.token;
  if (options.getToken) return options.getToken();
  return undefined;
}

/**
 * The backend enforces two named rate-limit windows (see the throttler
 * config on the public image endpoint), so a 429 response's Retry-After
 * header comes back name-suffixed (e.g. `Retry-After-burst`,
 * `Retry-After-per-minute`) rather than as a plain `Retry-After` — a single
 * exact-match `headers.get('Retry-After')` would never find it. Scan for any
 * header name starting with `retry-after` instead.
 */
function findRetryAfterHeader(headers: Headers): string | null {
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase().startsWith('retry-after')) {
      return value;
    }
  }
  return null;
}

function statusToApiError(response: Response): ApiError {
  const status = response.status;

  if (status === 401) {
    return new ApiError('Not signed in or session expired.', 'unauthorized', status);
  }
  if (status === 403) {
    return new ApiError('No permission for this action.', 'forbidden', status);
  }
  if (status === 429) {
    const retryAfter = findRetryAfterHeader(response.headers);
    const message = retryAfter
      ? `Too many requests – please try again in ${retryAfter}s.`
      : 'Too many requests – please wait a moment and try again.';
    return new ApiError(message, 'rate-limited', status, retryAfter);
  }
  if (status >= 500) {
    return new ApiError('Server error – please try again later.', 'server-error', status);
  }
  return new ApiError(`Request failed (status ${status}).`, 'unknown', status);
}

/**
 * Performs a fetch with an auth header (if a token is available) and a
 * timeout. Throws `ApiError` for non-2xx responses, timeouts, and network
 * failures. Returns the raw `Response` on success so callers decide how to
 * read the body (json/blob/text).
 */
export async function apiFetch(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { token, getToken, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;

  const resolvedToken = await resolveToken({ token, getToken });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const finalHeaders: HeadersInit = {
    ...(headers ?? {}),
    ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Timeout – server did not respond in time.', 'timeout');
    }
    throw new ApiError('Network error – server unreachable.', 'network');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw statusToApiError(response);
  }

  return response;
}

/** Convenience wrapper for JSON GET/POST/etc. responses. */
export async function apiFetchJson<T = unknown>(url: string, options?: ApiRequestOptions): Promise<T> {
  const response = await apiFetch(url, options);
  return (await response.json()) as T;
}

/** Convenience wrapper for endpoints returning binary payloads (e.g. images). */
export async function apiFetchBlob(url: string, options?: ApiRequestOptions): Promise<Blob> {
  const response = await apiFetch(url, options);
  return response.blob();
}

/**
 * Turns any error thrown by `apiFetch`/`apiFetchJson`/`apiFetchBlob` (or an
 * unrelated error) into a user-facing message. `ApiError` messages are
 * already user-facing (category-specific); anything else falls back to a
 * generic, caller-supplied message.
 */
export function describeApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error && err.message) {
    return `${fallback}: ${err.message}`;
  }
  return fallback;
}
