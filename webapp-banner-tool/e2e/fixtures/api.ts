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
  /** A spacer without its own image that shows the spacer base image (GET channels `hasFallback`). */
  hasFallback?: boolean;
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

/**
 * Real-world shapes the screenshot tree does not have (T-142-F4, Critic r4):
 * - "Broken banner" (cid 20): managed, `hasImage: true`, but its image is not
 *   served – leave cid 20 out of `images`, so GET by-id answers 404 (F-142-28);
 * - "[spacer]Base" (cid 21): a spacer without its own image that shows the
 *   spacer base image (`hasFallback: true`; pass `spacerBase` to mockApi, F-142-31);
 * - two channels named "Squad 1" (cid 22, 23), under different parents (F-142-33).
 * `banners` names the channels that do get a generated image.
 */
export function edgeCaseChannels(): { channels: MockChannel[]; banners: string[] } {
  const channels: MockChannel[] = [
    {
      cid: "11",
      name: "Gaming Area",
      pid: null,
      depth: 0,
      hasImage: true,
      managed: true,
      ...imageMeta(18_432, "2026-11-13T19:05:00Z"),
    },
    { cid: "22", name: "Squad 1", pid: "11", depth: 1, hasImage: false, managed: true },
    {
      cid: "20",
      name: "Broken banner",
      pid: null,
      depth: 0,
      hasImage: true,
      managed: true,
      ...imageMeta(9_216, "2026-11-10T10:00:00Z"),
    },
    { cid: "24", name: "Lounge", pid: null, depth: 0, hasImage: false, managed: true },
    { cid: "23", name: "Squad 1", pid: "24", depth: 1, hasImage: false, managed: true },
    {
      cid: "21",
      name: "[spacer]Base",
      pid: null,
      depth: 0,
      hasImage: false,
      hasFallback: true,
      isSpacer: true,
      managed: true,
    },
  ];
  for (const channel of channels)
    channel.bannerGfxUrl = `https://icons.example.net/banner/${channel.cid}.png`;
  return { channels, banners: ["11"] };
}

/**
 * A long tree (T-142-F4, F-142-32): `count` channels (default 40) with cids
 * 100…, in groups of eight – a parent with a banner followed by seven
 * sub-channels, every third of them with a banner. Channel 36 is
 * `longTreeChannels()[35]`, cid "135".
 */
export function longTreeChannels(count = 40): { channels: MockChannel[]; banners: string[] } {
  const channels: MockChannel[] = [];
  const banners: string[] = [];
  let parent: string | null = null;
  for (let i = 0; i < count; i++) {
    const cid = String(100 + i);
    const isParent = i % 8 === 0;
    const withBanner = isParent || i % 3 === 0;
    if (isParent) parent = cid;
    channels.push({
      cid,
      name: isParent ? `Area ${i / 8 + 1}` : `Channel ${String(i + 1).padStart(2, "0")}`,
      pid: isParent ? null : parent,
      depth: isParent ? 0 : 1,
      hasImage: withBanner,
      managed: true,
      ...(withBanner ? imageMeta(16_384 + i * 64, "2026-11-14T12:00:00Z") : {}),
    });
    if (withBanner) banners.push(cid);
  }
  return { channels, banners };
}

export type ApiState = "ready" | "empty" | "loading" | "error";

export interface MockApiOptions {
  channels?: MockChannel[];
  /** cid -> PNG served as that channel's banner. */
  images?: Map<string, Buffer>;
  /** How the channel endpoints answer; "loading" never answers. */
  state?: ApiState;
  /**
   * The spacer base image: GET spacer-base-image serves it, and GET by-id
   * serves it for every channel with `hasFallback` (as the public API does).
   */
  spacerBase?: Buffer;
}

export async function mockApi(page: Page, options: MockApiOptions = {}) {
  const uploads: { cid: string; png: Buffer }[] = [];
  const deleted: string[] = [];
  const images = options.images ?? new Map<string, Buffer>();
  const state = options.state ?? "ready";
  const items = state === "empty" ? [] : (options.channels ?? basicChannels());
  await page.route(`${PUBLIC_API}/images/**`, async (route) => {
    const cid = new URL(route.request().url()).pathname.match(/by-id\/(\d+)\.png/)?.[1];
    const fallback = items.find((item) => item.cid === cid)?.hasFallback
      ? options.spacerBase
      : undefined;
    const png = images.get(cid || "") ?? fallback;
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
    if (pathname.endsWith("/spacer-base-image"))
      return options.spacerBase && request.method() === "GET"
        ? route.fulfill({ status: 200, contentType: "image/png", body: options.spacerBase })
        : route.fulfill({ status: 404 });
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
