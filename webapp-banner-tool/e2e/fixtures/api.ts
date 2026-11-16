// Shared route fixtures: every e2e spec runs against the Vite dev server with
// these mocked API responses and needs no backend. Parts of T-142 extend their
// own fixtures here; the defaults stay what the original workflows spec used.
import { expect, type Page } from "@playwright/test";
import { BANNER_CYCLE, fixtureBanner, fixtureSource } from "./banners";

const PUBLIC_API = "http://127.0.0.1:3000";
const ADMIN_API = "http://127.0.0.1:3001";

export interface MockChannel {
  cid: string;
  name: string;
  pid: string | null;
  depth: number;
  hasImage: boolean;
  managed: boolean;
  isSpacer?: boolean;
  bannerGfxUrl?: string | null;
  /** Byte size and last change of the channel's own image (R1, D-142F-34). */
  size?: number;
  updatedAt?: string;
}

/** The two equally named channels of the original workflow tests. */
export function basicChannels(): MockChannel[] {
  return [
    { cid: "42", name: "General", pid: null, depth: 0, hasImage: false, managed: true },
    { cid: "43", name: "General", pid: "42", depth: 1, hasImage: false, managed: true },
  ];
}

/** `size` and `updatedAt` of a channel's own image, as GET channels returns them (R1). */
function imageMeta(size: number, updatedAt: string) {
  return { size, updatedAt };
}

/**
 * The screenshot tree (T-142 item 22): a spacer row, a group row with a
 * banner, two channels with banners, nested sub-channels and one channel
 * without a banner. `banner` names the channels that get a generated image.
 */
export function screenshotChannels(): { channels: MockChannel[]; banners: string[] } {
  const channels: MockChannel[] = [
    {
      cid: "10",
      name: "[spacer]Top",
      pid: null,
      depth: 0,
      hasImage: true,
      managed: true,
      isSpacer: true,
      ...imageMeta(12_288, "2026-11-12T08:30:00Z"),
    },
    {
      cid: "11",
      name: "Gaming Area",
      pid: null,
      depth: 0,
      hasImage: true,
      managed: true,
      ...imageMeta(18_432, "2026-11-13T19:05:00Z"),
    },
    {
      cid: "12",
      name: "Counter-Strike",
      pid: "11",
      depth: 1,
      hasImage: true,
      managed: true,
      ...imageMeta(21_504, "2026-11-14T21:47:00Z"),
    },
    {
      cid: "13",
      name: "Hytale",
      pid: "11",
      depth: 1,
      hasImage: true,
      managed: true,
      ...imageMeta(19_456, "2026-11-15T14:02:00Z"),
    },
    { cid: "14", name: "Squad 1", pid: "13", depth: 2, hasImage: false, managed: true },
    { cid: "15", name: "Squad 2", pid: "13", depth: 2, hasImage: false, managed: false },
    { cid: "16", name: "Lobby", pid: null, depth: 0, hasImage: false, managed: false },
  ];
  // A managed channel's TeamSpeak banner URL points at ts-icon (Banner URLs screen).
  for (const channel of channels)
    if (channel.managed)
      channel.bannerGfxUrl = `https://icons.example.net/banner/${channel.cid}.png`;
  return { channels, banners: ["10", "11", "12", "13"] };
}

export type ApiState = "ready" | "empty" | "loading" | "error";

export interface MockApiOptions {
  channels?: MockChannel[];
  /** cid -> PNG served as that channel's banner. */
  images?: Map<string, Buffer>;
  /** How the channel endpoints answer; "loading" never answers. */
  state?: ApiState;
}

export async function mockApi(page: Page, options: MockApiOptions = {}) {
  const uploads: { cid: string; png: Buffer }[] = [];
  const deleted: string[] = [];
  const images = options.images ?? new Map<string, Buffer>();
  const state = options.state ?? "ready";
  const items = state === "empty" ? [] : (options.channels ?? basicChannels());
  await page.route(`${PUBLIC_API}/images/**`, async (route) => {
    const cid = new URL(route.request().url()).pathname.match(/by-id\/(\d+)\.png/)?.[1];
    const png = images.get(cid || "");
    await route.fulfill(
      png ? { status: 200, contentType: "image/png", body: png } : { status: 404 },
    );
  });
  await page.route(`${ADMIN_API}/images-local/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const isChannelList =
      pathname.endsWith("/channels/banner-urls") || pathname.endsWith("/channels");
    if (isChannelList && state === "loading") return; // never answered: loading state
    if (isChannelList && state === "error")
      return route.fulfill({ status: 500, json: { message: "The channel list is unavailable." } });
    if (pathname.endsWith("/channels/banner-urls"))
      return route.fulfill({ json: { channels: items } });
    if (pathname.endsWith("/channels"))
      return route.fulfill({ json: { channels: items.map((item) => item.name), items } });
    if (pathname.endsWith("/spacer-base-image")) return route.fulfill({ status: 404 });
    if (pathname.endsWith("/channel-wallpaper/runs")) return route.fulfill({ json: { runs: [] } });
    const cid = pathname.match(/channels\/(\d+)\/image/)?.[1];
    if (cid && request.method() === "POST") {
      const payload = request.postDataBuffer()!;
      const start = payload.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const end = payload.indexOf(Buffer.from("IEND"), start) + 8;
      expect(start).toBeGreaterThanOrEqual(0);
      const png = payload.subarray(start, end);
      images.set(cid, png);
      uploads.push({ cid, png });
      Object.assign(items.find((item) => item.cid === cid)!, {
        hasImage: true,
        ...imageMeta(png.length, new Date().toISOString()),
      });
      return route.fulfill({ json: { message: "Image saved successfully" } });
    }
    if (cid && request.method() === "DELETE") {
      images.delete(cid);
      deleted.push(cid);
      Object.assign(items.find((item) => item.cid === cid)!, {
        hasImage: false,
        size: undefined,
        updatedAt: undefined,
      });
      return route.fulfill({ json: { message: "Image deleted" } });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked request: ${pathname}` } });
  });
  return { uploads, deleted };
}

/** The 1000 x 400 photo-like source image of the crop workflows (fixtures/banners.ts). */
export const sourcePng = fixtureSource;

/** A 500 x 44 banner PNG (dark artwork) in the given hue with a short title. */
export function bannerPng(page: Page, hue: number, title = "Banner"): Promise<Buffer> {
  return fixtureBanner(page, { kind: "artwork", title, hue });
}

/**
 * cid -> realistic fixture banner for the channels that get an image. With
 * `textFree` the banners carry no title, so the channel name is not doubled
 * in previews, thumbnails and pills (the screenshots project, D-142F-36).
 */
export async function fixtureImages(
  page: Page,
  cids: string[],
  { textFree = false }: { textFree?: boolean } = {},
): Promise<Map<string, Buffer>> {
  const images = new Map<string, Buffer>();
  for (const [i, cid] of cids.entries()) {
    const spec = BANNER_CYCLE[i % BANNER_CYCLE.length];
    images.set(cid, await fixtureBanner(page, textFree ? { ...spec, title: "" } : spec));
  }
  return images;
}
