// Banner URLs (route "/banner-urls"). Owned by T-142 part (c).
import { expect, test, type Page } from "@playwright/test";
import { mockApi, screenshotChannels, type ApiState } from "./fixtures/api";
import { SCREEN_ROUTES } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

const route = SCREEN_ROUTES.find((screen) => screen.path === "/banner-urls")!;

async function openRoute(page: Page, state: ApiState, ready: () => Promise<void>) {
  await mockApi(page, {
    state,
    channels: state === "ready" ? screenshotChannels().channels : undefined,
  });
  await page.goto(route.path);
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
  await ready();
}

async function expectRouteRules(page: Page) {
  await expectNoHorizontalOverflow(page);
  await expectHitTargets(page);
  await expectProminentRule(page, route.destructiveVerbs);
}

test("Banner URLs page renders without horizontal overflow", async ({ page }) => {
  await mockApi(page);
  await page.goto(route.path);
  await expect(page.getByRole("heading", { level: 1, name: "Channel banner URLs" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("loaded state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "ready", async () => {
    await expect(page.getByText("Channel #16")).toBeVisible();
  });
  await expect(page.locator('[data-variant="prominent"]:visible')).toHaveText(
    "Set for all channels",
  );
  await expectRouteRules(page);
});

test("empty state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "empty", async () => {
    await expect(page.locator("#main-content").getByText("No channels found.")).toBeVisible();
  });
  await expectRouteRules(page);
});

test("loading state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "loading", async () => {
    await expect(page.getByText("Loading channels…")).toBeVisible();
  });
  await expectRouteRules(page);
});

test("error state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "error", async () => {
    await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
  });
  await expectRouteRules(page);
});
