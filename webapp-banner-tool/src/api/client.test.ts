// @vitest-environment node
//
// Pure request/response logic — no DOM needed, so this file runs under the
// Node environment (faster, and avoids any jsdom fetch-polyfill ambiguity)
// rather than the project's default jsdom environment.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './client';

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('Expected apiFetch to throw an ApiError, but it resolved.');
}

describe('apiFetch error categorization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('categorizes a 401 response as "unauthorized"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('unauthorized');
    expect(error.status).toBe(401);
  });

  it('categorizes a 403 response as "forbidden"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('forbidden');
    expect(error.status).toBe(403);
  });

  it('categorizes a 429 response as "rate-limited" and surfaces Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
      )
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('rate-limited');
    expect(error.retryAfter).toBe('30');
    expect(error.message).toContain('30');
  });

  it('categorizes a 429 response without Retry-After as "rate-limited" with a generic message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('rate-limited');
    // `ApiError` normalizes a missing header (`null` from `Headers.get`) to
    // `undefined` via `retryAfter ?? undefined`.
    expect(error.retryAfter).toBeUndefined();
  });

  it('categorizes a 500 response as "server-error"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('server-error');
    expect(error.status).toBe(503);
  });

  it('categorizes an aborted request (timeout) as "timeout"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          })
      )
    );

    // A very short timeout so the abort fires almost immediately rather than
    // waiting out the real default (10s).
    const error = await expectApiError(apiFetch('https://example.test/x', { timeoutMs: 5 }));
    expect(error.category).toBe('timeout');
  });

  it('categorizes an unrelated fetch rejection as "network"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );

    const error = await expectApiError(apiFetch('https://example.test/x'));
    expect(error.category).toBe('network');
  });

  it('does not throw for a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    );

    const response = await apiFetch('https://example.test/x');
    expect(response.ok).toBe(true);
  });
});
