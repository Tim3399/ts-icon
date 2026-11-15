// T-142 item 22: screenshots for the user's look acceptance. Runs only in
// the opt-in "screenshots" project (npm run test:screenshots) and writes to
// SCREENSHOT_DIR; playwright.config.ts refuses to start without it.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fixtureImages, mockApi, screenshotChannels, type ApiState } from "./fixtures/api";
import { fixtureBanner } from "./fixtures/banners";
import { SCREEN_ROUTES, SHELL_ROUTES } from "./fixtures/routes";

const dir = process.env.SCREENSHOT_DIR ?? "";
const THEMES = ["dark", "light"] as const;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  // 1280 px: the live panel is beside the content here (T-142-F1 addendum 3).
  laptop: { width: 1280, height: 800 },
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
  const images = await fixtureImages(page, banners);
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
    // Hytale between its neighbours, the live panel open. The source artwork
    // has no text, so the preview shows the channel name once and no glyphs at
    // the banner's top edge.
    test(`Banner editor with an image loaded (${suffix})`, async ({ page }) => {
      await prepare(page, theme, viewport);
      const source = await fixtureBanner(page, { kind: "artwork", title: "", hue: 200 });
      await page.addInitScript(() => localStorage.setItem("ts-icon-rail-open", "open"));
      await page.goto("/?channel=13");
      await page
        .locator("#file-upload")
        .setInputFiles({ name: "artwork.png", mimeType: "image/png", buffer: source });
      await expect(page.getByAltText("Cropped banner for Hytale")).toBeVisible();
      await shoot(page, `route-banner-editor-loaded-${suffix}`);
    });

    test(`sidebar open (${suffix})`, async ({ page }) => {
      test.skip(viewport !== "mobile", "The sidebar is always open on desktop.");
      await prepare(page, theme, viewport);
      await page.goto("/channels");
      await page.getByRole("button", { name: "Show sidebar" }).click();
      await expect(page.getByRole("link", { name: "Banner editor" })).toBeVisible();
      // The drawer is fixed to the viewport, so a full-page shot would cut it.
      await page.screenshot({ path: join(dir, `sidebar-open-${suffix}.png`) });
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
