// T-142 item 8: 44 x 44 px hit targets on every route, in all four projects.
// Exemptions: HIT_TARGET_EXEMPTIONS in helpers/assertions.ts (and the README).
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { PENDING_SCREEN_ROUTES, SCREEN_ROUTES, SHELL_ROUTES } from "./fixtures/routes";
import {
  expectHitTargets,
  openSidebarByKeyboard,
  sidebarIsCollapsible,
} from "./helpers/assertions";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("shell controls (sidebar, toolbar, live panel) meet the hit target", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
  // The screen inside <main> is pending its restyle; the shell around it is not.
  await expectHitTargets(page, { exclude: "#main-content" });
  if (await sidebarIsCollapsible(page)) {
    await openSidebarByKeyboard(page);
    await expectHitTargets(page, { within: "#app-sidebar" });
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
  const title = `${route.name} meets the hit target`;
  const check = async ({ page }: { page: Page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expectHitTargets(page);
  };
  if (PENDING_SCREEN_ROUTES.includes(route.path))
    test.fixme(title, check); // enabled in D-142-7
  else test(title, check);
}
