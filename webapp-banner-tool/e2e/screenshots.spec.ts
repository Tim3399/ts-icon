// T-142 item 22: screenshots for the user's look acceptance. Runs only in
// the opt-in "screenshots" project (npm run test:screenshots) and writes to
// SCREENSHOT_DIR; playwright.config.ts refuses to start without it.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bannerPng, mockApi, screenshotChannels, type ApiState } from "./fixtures/api";
import { SCREEN_ROUTES, SHELL_ROUTES } from "./fixtures/routes";

const dir = process.env.SCREENSHOT_DIR ?? "";
const THEMES = ["dark", "light"] as const;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 667 },
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
  const images = new Map<string, Buffer>();
  for (const [i, cid] of banners.entries()) images.set(cid, await bannerPng(page, 90 + i * 70));
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

    test(`sidebar open (${suffix})`, async ({ page }) => {
      test.skip(viewport === "desktop", "The sidebar is always open on desktop.");
      await prepare(page, theme, viewport);
      await page.goto("/channels");
      await page.getByRole("button", { name: "Show sidebar" }).click();
      await expect(page.getByRole("link", { name: "Banner editor" })).toBeVisible();
      // The drawer is fixed to the viewport, so a full-page shot would cut it.
      await page.screenshot({ path: join(dir, `sidebar-open-${suffix}.png`) });
    });

    test(`toast (${suffix})`, async ({ page }) => {
      await prepare(page, theme, viewport, "error");
      await page.goto("/banner-urls");
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
