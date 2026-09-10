import axios from "axios";
import {
  SsrfValidationError,
  assertSafeUrlShape,
  resolveSafeAddresses,
  createPinnedHttpsAgent,
} from "./ssrf-guard";

export { SsrfValidationError };

export class FetchFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchFailedError";
  }
}

export interface SafeImageFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}
export interface SafeImageFetchResult {
  buffer: Buffer;
  contentType: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Stops waiting for non-abortable DNS too; late resolution/rejection is consumed. */
export function waitForResolution<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new FetchFailedError("Image download timed out or was cancelled"));
    if (signal.aborted) {
      void pending.catch(() => undefined);
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort))
      .catch(() => undefined);
  });
}

function getHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/** One deadline covers DNS, all redirect hops and the complete response body. */
export async function fetchImageSafely(
  rawUrl: string,
  options: SafeImageFetchOptions = {},
): Promise<SafeImageFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  ) {
    throw new FetchFailedError("Invalid download limits");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const deadline = Date.now() + timeoutMs;

  try {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (controller.signal.aborted)
        throw new FetchFailedError("Image download timed out or was cancelled");
      const parsed = assertSafeUrlShape(currentUrl);
      const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
      const safeAddresses = await waitForResolution(
        resolveSafeAddresses(hostname),
        controller.signal,
      );
      const agent = createPinnedHttpsAgent(safeAddresses);
      try {
        const response = await axios.get<ArrayBuffer>(parsed.toString(), {
          responseType: "arraybuffer",
          proxy: false,
          signal: controller.signal,
          timeout: Math.max(1, deadline - Date.now()),
          maxContentLength: maxBytes,
          maxBodyLength: maxBytes,
          maxRedirects: 0,
          httpsAgent: agent,
          validateStatus: (status) => status >= 200 && status < 400,
        });
        if (response.status >= 300) {
          if (hop === MAX_REDIRECTS) throw new FetchFailedError("Too many redirects");
          const location = getHeader(response.headers, "location");
          if (!location)
            throw new FetchFailedError("Redirect response is missing a Location header");
          try {
            currentUrl = new URL(location, parsed).toString();
          } catch {
            throw new FetchFailedError("Invalid image redirect");
          }
          continue;
        }
        const contentType = getHeader(response.headers, "content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase();
        if (!contentType || !IMAGE_TYPES.has(contentType)) {
          throw new FetchFailedError("The given URL must return a PNG, JPEG, WebP or GIF image");
        }
        if (controller.signal.aborted)
          throw new FetchFailedError("Image download timed out or was cancelled");
        return { buffer: Buffer.from(response.data), contentType };
      } finally {
        agent.destroy();
      }
    }
    throw new FetchFailedError("Too many redirects");
  } catch (error) {
    if (error instanceof SsrfValidationError || error instanceof FetchFailedError) throw error;
    // Axios errors retain URLs, proxy configuration and headers. Never expose them to logs/callers.
    throw new FetchFailedError(
      controller.signal.aborted
        ? "Image download timed out or was cancelled"
        : "Image could not be loaded",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
