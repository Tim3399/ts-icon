import axios from 'axios';
import { URL } from 'url';
import {
  SsrfValidationError,
  assertSafeUrlShape,
  resolveSafeAddresses,
  createPinnedHttpsAgent,
} from './ssrf-guard';

export { SsrfValidationError };

/**
 * A URL passed every SSRF check but the fetch itself still failed for an
 * ordinary reason (network error, timeout, non-2xx response, response body
 * too large, response wasn't actually an image, too many redirects). Kept
 * distinct from SsrfValidationError so callers can tell "this URL is not
 * allowed" apart from "this URL is allowed but couldn't be fetched right
 * now" without leaking fetch internals to the client.
 */
export class FetchFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchFailedError';
  }
}

export interface SafeImageFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SafeImageFetchResult {
  buffer: Buffer;
  contentType: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

// Many real-world image hosts/CDNs 301/302 at least once (e.g. bare domain
// -> CDN edge, HTTP -> HTTPS canonicalization on their side). Redirects are
// therefore followed, but manually and capped, so every hop goes through
// the exact same URL-shape + DNS + IP-range validation as the original
// request -- never Axios/Node's built-in redirect following, which would
// connect straight through without any of these checks.
const MAX_REDIRECTS = 3;

function getHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const value = (headers as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Fetches an image from an external, caller-supplied URL with SSRF
 * protections applied on every hop:
 *  - https:// only, no embedded credentials, default port only
 *  - hostname resolved and IP-filtered before connecting (loopback,
 *    private, link-local, multicast, reserved, and cloud metadata ranges
 *    rejected)
 *  - the connection is pinned to the already-validated address rather than
 *    letting the HTTP stack re-resolve DNS itself
 *  - redirects are not auto-followed; each hop is re-validated from
 *    scratch, up to a hard cap
 *  - a bounded total request timeout
 *  - a hard cutoff on response size enforced against actual bytes
 *    received, not a trusted Content-Length header
 */
export async function fetchImageSafely(
  rawUrl: string,
  options: SafeImageFetchOptions = {},
): Promise<SafeImageFetchResult> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxContentLength = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertSafeUrlShape(currentUrl);
    const safeAddresses = await resolveSafeAddresses(parsed.hostname);
    const agent = createPinnedHttpsAgent(safeAddresses);

    let response;
    try {
      response = await axios.get<ArrayBuffer>(parsed.toString(), {
        responseType: 'arraybuffer',
        timeout,
        maxContentLength,
        maxRedirects: 0,
        httpsAgent: agent,
        validateStatus: (status) =>
          (status >= 200 && status < 300) || (status >= 300 && status < 400),
      });
    } catch {
      throw new FetchFailedError('Image could not be loaded');
    }

    if (response.status >= 300 && response.status < 400) {
      if (hop === MAX_REDIRECTS) {
        throw new FetchFailedError('Too many redirects');
      }
      const location = getHeader(response.headers, 'location');
      if (!location) {
        throw new FetchFailedError(
          'Redirect response is missing a Location header',
        );
      }
      // Location headers may be relative; resolve against the current hop's URL.
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    const contentType = getHeader(response.headers, 'content-type');
    if (!contentType?.startsWith('image/')) {
      throw new FetchFailedError('The given URL does not return an image');
    }

    return { buffer: Buffer.from(response.data), contentType };
  }

  throw new FetchFailedError('Too many redirects');
}
