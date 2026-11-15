// T-142 item 8: hit targets on every route, in all four projects (28 px from
// 1024 px, 44 px below). Exemptions: HIT_TARGET_EXEMPTIONS in
// helpers/assertions.ts (and the README).
import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { SCREEN_ROUTES, SHELL_ROUTES } from "./fixtures/routes";
import { expectHitTargets, layersAreDrawer, openLayersByKeyboard } from "./helpers/assertions";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("shell controls (top bar, mode switcher, layer panel) meet the hit target", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
  const bar = page.locator(".ds-studio-bar");
  expect(await bar.locator("a[href], button").count()).toBeGreaterThan(0);
  await expectHitTargets(page);
  if (await layersAreDrawer(page)) {
    await openLayersByKeyboard(page);
    await expectHitTargets(page, { within: "#studio-layers" });
  }
});

for (const route of SHELL_ROUTES) {
  test(`${route.name} meets the hit target`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await expectHitTargets(page);
  });
}

for (const route of SCREEN_ROUTES) {
  test(`${route.name} meets the hit target`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expectHitTargets(page);
  });
}
