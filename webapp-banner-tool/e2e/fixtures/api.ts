// Shared route fixtures: every e2e spec runs against the Vite dev server with
// these mocked API responses and needs no backend. Parts of T-142 extend their
// own fixtures here; the defaults stay what the original workflows spec used.
import { expect, type Page } from "@playwright/test";

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
}

/** The two equally named channels of the original workflow tests. */
export function basicChannels(): MockChannel[] {
  return [
    { cid: "42", name: "General", pid: null, depth: 0, hasImage: false, managed: true },
    { cid: "43", name: "General", pid: "42", depth: 1, hasImage: false, managed: true },
  ];
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
    },
    { cid: "11", name: "Gaming Area", pid: null, depth: 0, hasImage: true, managed: true },
    { cid: "12", name: "Counter-Strike", pid: "11", depth: 1, hasImage: true, managed: true },
    { cid: "13", name: "Hytale", pid: "11", depth: 1, hasImage: true, managed: true },
    { cid: "14", name: "Squad 1", pid: "13", depth: 2, hasImage: false, managed: true },
    { cid: "15", name: "Squad 2", pid: "13", depth: 2, hasImage: false, managed: false },
    { cid: "16", name: "Lobby", pid: null, depth: 0, hasImage: false, managed: false },
  ];
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
      items.find((item) => item.cid === cid)!.hasImage = true;
      return route.fulfill({ json: { message: "Image saved successfully" } });
    }
    if (cid && request.method() === "DELETE") {
      images.delete(cid);
      deleted.push(cid);
      items.find((item) => item.cid === cid)!.hasImage = false;
      return route.fulfill({ json: { message: "Image deleted" } });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked request: ${pathname}` } });
  });
  return { uploads, deleted };
}

/** A 1000 x 400 gradient PNG with a white block, drawn in the page. */
export async function sourcePng(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 400;
      const context = canvas.getContext("2d")!;
      const gradient = context.createLinearGradient(0, 0, 1000, 400);
      gradient.addColorStop(0, "#eb4034");
      gradient.addColorStop(1, "#346eeb");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1000, 400);
      context.fillStyle = "#ffffff";
      context.fillRect(300, 80, 200, 100);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
}

/** A 500 x 44 banner PNG in the given hue, drawn in the page. */
export async function bannerPng(page: Page, hue: number): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate((h) => {
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 44;
      const context = canvas.getContext("2d")!;
      const gradient = context.createLinearGradient(0, 0, 500, 44);
      gradient.addColorStop(0, `hsl(${h} 70% 35%)`);
      gradient.addColorStop(1, `hsl(${(h + 60) % 360} 80% 55%)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 500, 44);
      for (let x = 0; x < 500; x += 25) {
        context.fillStyle = `hsl(${(h + x) % 360} 90% 70% / 0.35)`;
        context.beginPath();
        context.arc(x, 22 + 14 * Math.sin(x / 40), 9, 0, Math.PI * 2);
        context.fill();
      }
      return canvas.toDataURL("image/png").split(",")[1];
    }, hue),
    "base64",
  );
}
