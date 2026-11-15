// T-142 item 9: with Reduce Motion the sidebar transition is at most
// 0.01 s; without it the same element animates.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";

async function longestTransition(page: Page) {
  return page.locator("#app-sidebar").evaluate((el) =>
    Math.max(
      ...getComputedStyle(el)
        .transitionDuration.split(",")
        .map((value) => parseFloat(value) * (value.trim().endsWith("ms") ? 0.001 : 1)),
    ),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("the sidebar animates without Reduce Motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  expect(await longestTransition(page)).toBeGreaterThan(0);
});

test("the sidebar does not animate with Reduce Motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await longestTransition(page)).toBeLessThanOrEqual(0.01);
});
