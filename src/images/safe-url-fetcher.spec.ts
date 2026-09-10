import axios from "axios";
import * as guard from "./ssrf-guard";
import { fetchImageSafely, FetchFailedError } from "./safe-url-fetcher";

jest.mock("axios");
const get = jest.spyOn(axios, "get");
const imageResponse = {
  status: 200,
  data: Buffer.from("image"),
  headers: { "content-type": "image/png" },
};

describe("safe download transport", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    get.mockReset().mockResolvedValue(imageResponse);
    jest
      .spyOn(guard, "resolveSafeAddresses")
      .mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("disables environment proxies and pins the validated connection", async () => {
    const response = await fetchImageSafely("https://example.test/image.png");
    expect(response.buffer).toEqual(Buffer.from("image"));
    expect(get).toHaveBeenCalledWith(
      "https://example.test/image.png",
      expect.objectContaining({
        proxy: false,
        maxRedirects: 0,
        maxContentLength: 10 * 1024 * 1024,
        signal: expect.any(AbortSignal) as AbortSignal,
        httpsAgent: expect.any(Object) as object,
      }),
    );
  });

  it("stops waiting for DNS when the operation deadline expires", async () => {
    jest.mocked(guard.resolveSafeAddresses).mockImplementation(() => new Promise(() => {}));
    const outcome = expect(
      fetchImageSafely("https://example.test/image.png", { timeoutMs: 50 }),
    ).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(50);
    await outcome;
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps one deadline across redirects and aborts a body that still transfers", async () => {
    get.mockImplementation(
      (_url, options) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ status: 302, headers: { location: "/next" } }),
            40,
          );
          (options?.signal as AbortSignal).addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    );
    const outcome = expect(
      fetchImageSafely("https://example.test/image.png", { timeoutMs: 100 }),
    ).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(100);
    await outcome;
    expect(get).toHaveBeenCalledTimes(3);
    const calls = get.mock.calls as Array<[string, { signal: AbortSignal }]>;
    expect(calls.every((call) => call[1].signal === calls[0][1].signal)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("validates every redirect and does not expose axios config in errors", async () => {
    get.mockResolvedValueOnce({ status: 302, headers: { location: "http://127.0.0.1/private" } });
    await expect(fetchImageSafely("https://example.test/image.png")).rejects.toBeInstanceOf(
      guard.SsrfValidationError,
    );
    get.mockRejectedValueOnce(new Error("secret URL or proxy credential"));
    await expect(fetchImageSafely("https://example.test/image.png")).rejects.toEqual(
      new FetchFailedError("Image could not be loaded"),
    );
  });

  it("honors cancellation before opening a connection", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchImageSafely("https://example.test/image.png", { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(get).not.toHaveBeenCalled();
  });

  it("does not relay active SVG documents through the image proxy", async () => {
    get.mockResolvedValueOnce({ ...imageResponse, headers: { "content-type": "image/svg+xml" } });
    await expect(fetchImageSafely("https://example.test/image.svg")).rejects.toThrow(
      "PNG, JPEG, WebP or GIF",
    );
  });
});
