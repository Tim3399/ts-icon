// T-142 item 18: at most one prominent button per route, never on a
// destructive action (screen table in docs/design/DESIGN.md).
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import {
  DESTRUCTIVE_VERBS,
  PENDING_SCREEN_ROUTES,
  SCREEN_ROUTES,
  SHELL_ROUTES,
} from "./fixtures/routes";
import { expectProminentRule } from "./helpers/assertions";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("the shell itself adds no prominent button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
  await expect(page.locator('#app-sidebar [data-variant="prominent"]')).toHaveCount(0);
  await expect(page.locator('header [data-variant="prominent"]')).toHaveCount(0);
  await expect(page.locator('#live-tree-panel [data-variant="prominent"]')).toHaveCount(0);
});

for (const route of SHELL_ROUTES) {
  test(`${route.name} has at most one prominent, non-destructive button`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await expectProminentRule(page, [...DESTRUCTIVE_VERBS, ...route.destructiveVerbs]);
  });
}

for (const route of SCREEN_ROUTES) {
  const title = `${route.name} has at most one prominent, non-destructive button`;
  const check = async ({ page }: { page: Page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expectProminentRule(page, [...DESTRUCTIVE_VERBS, ...route.destructiveVerbs]);
  };
  if (PENDING_SCREEN_ROUTES.includes(route.path))
    test.fixme(title, check); // enabled in D-142-7
  else test(title, check);
}
