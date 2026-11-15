// T-142 item 9: with Reduce Motion the layer panel transition (the drawer
// slide of T-142-F3 R2) is at most 0.01 s; without it the same element
// animates.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";

async function longestTransition(page: Page) {
  const layers = page.locator("#studio-layers");
  await expect(layers).toHaveCount(1);
  return layers.evaluate((el) =>
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

test("the layer panel animates without Reduce Motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  expect(await longestTransition(page)).toBeGreaterThan(0);
});

test("the layer panel does not animate with Reduce Motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await longestTransition(page)).toBeLessThanOrEqual(0.01);
});
