// T-142 item 22: screenshots for the user's look acceptance. Runs only in
// the opt-in "screenshots" project (npm run test:screenshots) and writes to
// SCREENSHOT_DIR; playwright.config.ts refuses to start without it.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fixtureImages, mockApi, screenshotChannels, type ApiState } from "./fixtures/api";
import { fixtureSource } from "./fixtures/banners";
import { SCREEN_ROUTES, SHELL_ROUTES } from "./fixtures/routes";

const dir = process.env.SCREENSHOT_DIR ?? "";
const THEMES = ["dark", "light"] as const;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  // 1280 and 1024 px: the Studio breakpoints of T-142-F3 R2 (item 14).
  laptop: { width: 1280, height: 800 },
  "1024": { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
} as const;

test.beforeAll(() => {
  if (!dir) throw new Error("SCREENSHOT_DIR is required for the screenshots project.");
  mkdirSync(dir, { recursive: true });
});

async function prepare(
  page: Page,
  theme: (typeof THEMES)[number],
  viewport: keyof typeof VIEWPORTS,
  state: ApiState = "ready",
) {
  await page.setViewportSize(VIEWPORTS[viewport]);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.goto("about:blank");
  const { channels, banners } = screenshotChannels();
  // Text-free banners: channel names appear once, drawn on the pill (D-142F-36).
  const images = await fixtureImages(page, banners, { textFree: true });
  await mockApi(page, { channels, images, state });
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

for (const theme of THEMES) {
  for (const viewport of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    const suffix = `${theme}-${viewport}`;

    for (const route of [...SCREEN_ROUTES, ...SHELL_ROUTES]) {
      test(`${route.name} (${suffix})`, async ({ page }) => {
        await prepare(page, theme, viewport);
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: /Loading/ })).toHaveCount(0);
        const slug = route.path === "/" ? "banner-editor" : route.path.slice(1);
        await shoot(page, `route-${slug}-${suffix}`);
      });
    }

    // The Banner editor with an image loaded (T-142-F1 gate, T-142-F2 item 7):
    // Hytale between its neighbours, the live tree in the layer panel. The
    // source is the 1000 x 400 photo-like image, so the canvas shows the crop
    // frame inside a larger image (D-142F-36); it has no text, so the preview
    // shows the channel name once.
    test(`Banner editor with an image loaded (${suffix})`, async ({ page }) => {
      await prepare(page, theme, viewport);
      const source = await fixtureSource(page);
      await page.goto("/?channel=13");
      await page
        .locator("#file-upload")
        .setInputFiles({ name: "source.png", mimeType: "image/png", buffer: source });
      await expect(page.getByAltText("Cropped banner for Hytale")).toBeVisible();
      await shoot(page, `route-banner-editor-loaded-${suffix}`);
    });

    // The layer drawer of 1024-1239 px (T-142-F3 R2), shot at 1100 px.
    test(`layer drawer open at 1100 px (${suffix})`, async ({ page }) => {
      test.skip(viewport !== "desktop", "One drawer shot per theme.");
      await prepare(page, theme, viewport);
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.goto("/");
      await page.getByRole("button", { name: "Show layers" }).click();
      await expect(page.getByRole("region", { name: "Channels" })).toBeVisible();
      // The drawer is fixed to the viewport, so a full-page shot would cut it.
      await page.screenshot({ path: join(dir, `layers-drawer-open-1100-${theme}.png`) });
    });

    test(`account menu open (${suffix})`, async ({ page }) => {
      await prepare(page, theme, viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.locator('button[aria-haspopup="menu"]').click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.screenshot({ path: join(dir, `account-menu-${suffix}.png`) });
    });

    test(`toast (${suffix})`, async ({ page }) => {
      await prepare(page, theme, viewport, "error");
      // The Wallpaper parent picker (ChannelTreePreview) raises the load-error toast.
      await page.goto("/wallpaper");
      await expect(page.locator(".ds-toast").first()).toBeVisible();
      await page.screenshot({ path: join(dir, `toast-${suffix}.png`) });
    });

    for (const state of ["empty", "loading", "error"] as const) {
      test(`${state} state (${suffix})`, async ({ page }) => {
        await prepare(page, theme, viewport, state);
        await page.goto("/channels");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (state === "loading") await page.waitForTimeout(300);
        else if (state === "error") await expect(page.getByRole("alert").first()).toBeVisible();
        else await expect(page.getByText(/No channels/).first()).toBeVisible();
        await shoot(page, `state-${state}-${suffix}`);
      });
    }
  }
}
