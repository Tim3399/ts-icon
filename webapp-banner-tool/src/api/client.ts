/** Buffered requests share one deadline across token refresh, headers and body. */
export type ApiErrorCategory =
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "server-error"
  | "timeout"
  | "network"
  | "cancelled"
  | "unknown";
export class ApiError extends Error {
  readonly name = "ApiError";
  readonly category: ApiErrorCategory;
  readonly status?: number;
  readonly retryAfter?: string | null;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId?: string;
  constructor(
    message: string,
    category: ApiErrorCategory,
    status?: number,
    retryAfter?: string | null,
    fieldErrors?: Record<string, string[]>,
    requestId?: string,
  ) {
    super(message);
    this.category = category;
    this.status = status;
    this.retryAfter = retryAfter ?? undefined;
    this.fieldErrors = fieldErrors;
    this.requestId = requestId;
  }
}
export interface ApiRequestOptions extends RequestInit {
  token?: string;
  getToken?: () => Promise<string | undefined>;
  timeoutMs?: number;
}
export const DEFAULT_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 30_000;
const safeText = (value: unknown): string | undefined =>
  typeof value === "string"
    ? Array.from(value)
        .map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char))
        .join("")
        .slice(0, 500)
    : undefined;
function responseError(response: Response, body: string): ApiError {
  const status = response.status;
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(body);
  } catch {
    /* Non-JSON errors retain a safe fallback. */
  }
  if (!payload || typeof payload !== "object") payload = {};
  const requestId = safeText(payload.requestId) ?? safeText(response.headers.get("x-request-id"));
  const fields: Record<string, string[]> = {};
  if (payload.fieldErrors && typeof payload.fieldErrors === "object") {
    for (const [key, value] of Object.entries(payload.fieldErrors)) {
      const values = Array.isArray(value) ? value : [value];
      fields[key] = values.map(safeText).filter((v): v is string => Boolean(v));
    }
  }
  let retryAfter: string | undefined;
  for (const [name, value] of response.headers.entries())
    if (name.startsWith("retry-after")) retryAfter = value;
  let category: ApiErrorCategory = "unknown";
  let message = `Request failed (status ${status}).`;
  if (status === 401) {
    category = "unauthorized";
    message = "Your session expired. Sign in again.";
  } else if (status === 403) {
    category = "forbidden";
    message = "You do not have permission for this action.";
  } else if (status === 429) {
    category = "rate-limited";
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? retryAfter : undefined;
    message = seconds
      ? `Too many requests. Try again in ${seconds} seconds.`
      : "Too many requests. Wait a moment and try again.";
  } else if (status >= 500) {
    category = "server-error";
    message =
      "The server could not finish this action. Check the operation status before retrying.";
  } else {
    const messages = Array.isArray(payload.message)
      ? payload.message.map(safeText).filter(Boolean).join(" ")
      : safeText(payload.message);
    message = messages || (status === 413 ? "This image is too large." : message);
  }
  return new ApiError(message, category, status, retryAfter, fields, requestId);
}
export async function apiFetch(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { token, getToken, timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, ...rest } = options;
  const controller = new AbortController();
  let timedOut = false;
  let rejectAbort: (error: ApiError) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectAbort(
      new ApiError(
        timedOut
          ? "The operation timed out. Check its status before retrying."
          : "Request cancelled.",
        timedOut ? "timeout" : "cancelled",
      ),
    );
  };
  const timer = setTimeout(() => {
    timedOut = true;
    onAbort();
  }, timeoutMs);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const request = async () => {
    const resolvedToken = token ?? (await getToken?.());
    if (controller.signal.aborted) throw new ApiError("Request cancelled.", "cancelled");
    const finalHeaders = new Headers(headers);
    if (resolvedToken) finalHeaders.set("Authorization", `Bearer ${resolvedToken}`);
    const response = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      signal: controller.signal,
    });
    const body = await response.arrayBuffer();
    if (!response.ok) throw responseError(response, new TextDecoder().decode(body));
    // Buffer upstream under the same cancellation/deadline before returning.
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  try {
    return await Promise.race([request(), aborted]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError("Request cancelled.", timedOut ? "timeout" : "cancelled");
    throw new ApiError("Network error. Check your connection and try again.", "network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
export async function apiFetchJson<T = unknown>(
  url: string,
  options?: ApiRequestOptions,
): Promise<T> {
  const response = await apiFetch(url, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "The server returned an invalid response.",
      "server-error",
      response.status,
      undefined,
      undefined,
      response.headers.get("x-request-id") ?? undefined,
    );
  }
}
export async function apiFetchBlob(url: string, options?: ApiRequestOptions): Promise<Blob> {
  return (await apiFetch(url, options)).blob();
}
export function isCancelled(error: unknown): boolean {
  return error instanceof ApiError && error.category === "cancelled";
}
export function describeApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return error.requestId ? `${error.message} Reference: ${error.requestId}` : error.message;
}
