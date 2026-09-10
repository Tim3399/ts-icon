// @vitest-environment node
//
// Pure request/response logic — no DOM needed, so this file runs under the
// Node environment (faster, and avoids any jsdom fetch-polyfill ambiguity)
// rather than the project's default jsdom environment.
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error("Expected apiFetch to throw an ApiError, but it resolved.");
}

describe("apiFetch error categorization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('categorizes a 401 response as "unauthorized"', async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("unauthorized");
    expect(error.status).toBe(401);
  });

  it('categorizes a 403 response as "forbidden"', async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("forbidden");
    expect(error.status).toBe(403);
  });

  it('categorizes a 429 response as "rate-limited" and surfaces Retry-After', async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "30" } })),
    );

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("rate-limited");
    expect(error.retryAfter).toBe("30");
    expect(error.message).toContain("30");
  });

  it("finds a name-suffixed Retry-After header (e.g. Retry-After-burst), as the backend actually sends", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 429, headers: { "Retry-After-burst": "1" } }),
        ),
    );

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("rate-limited");
    expect(error.retryAfter).toBe("1");
    expect(error.message).toContain("1");
  });

  it('categorizes a 429 response without Retry-After as "rate-limited" with a generic message', async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("rate-limited");
    // `ApiError` normalizes a missing header (`null` from `Headers.get`) to
    // `undefined` via `retryAfter ?? undefined`.
    expect(error.retryAfter).toBeUndefined();
  });

  it('categorizes a 500 response as "server-error"', async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("server-error");
    expect(error.status).toBe(503);
  });

  it('categorizes an aborted request (timeout) as "timeout"', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );

    // A very short timeout so the abort fires almost immediately rather than
    // waiting out the real default (10s).
    const error = await expectApiError(apiFetch("https://example.test/x", { timeoutMs: 5 }));
    expect(error.category).toBe("timeout");
  });

  it('categorizes an unrelated fetch rejection as "network"', async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await expectApiError(apiFetch("https://example.test/x"));
    expect(error.category).toBe("network");
  });

  it("does not throw for a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));

    const response = await apiFetch("https://example.test/x");
    expect(response.ok).toBe(true);
  });
});

describe("whole-request deadline and error details", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("normalizes Headers instances and tuple lists without losing authorization", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetch);
    for (const headers of [
      new Headers({ "X-Test": "yes" }),
      [["X-Test", "yes"]] as [string, string][],
    ]) {
      await apiFetch("https://example.test", { headers, token: "current" });
      const sent = fetch.mock.lastCall![1].headers as Headers;
      expect(sent.get("X-Test")).toBe("yes");
      expect(sent.get("Authorization")).toBe("Bearer current");
    }
  });
  it("times out during token refresh before any request starts", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const error = await expectApiError(
      apiFetch("https://example.test", { timeoutMs: 5, getToken: () => new Promise(() => {}) }),
    );
    expect(error.category).toBe("timeout");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("times out after headers while the response body never finishes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"));
            },
          }),
        ),
      ),
    );
    const error = await expectApiError(apiFetch("https://example.test", { timeoutMs: 5 }));
    expect(error.category).toBe("timeout");
  });
  it("distinguishes caller cancellation from timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    const controller = new AbortController();
    const request = apiFetch("https://example.test", { signal: controller.signal });
    controller.abort();
    expect((await expectApiError(request)).category).toBe("cancelled");
  });
  it("surfaces field validation and support reference while hiding server internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Use a hex color.",
            fieldErrors: { backgroundColor: ["Use #RRGGBBAA."] },
            requestId: "req-123",
          }),
          { status: 400 },
        ),
      ),
    );
    const error = await expectApiError(apiFetch("https://example.test"));
    expect(error.message).toBe("Use a hex color.");
    expect(error.fieldErrors?.backgroundColor).toEqual(["Use #RRGGBBAA."]);
    expect(error.requestId).toBe("req-123");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "internal database password" }), { status: 500 }),
        ),
    );
    expect((await expectApiError(apiFetch("https://example.test"))).message).not.toContain(
      "password",
    );
  });
});
