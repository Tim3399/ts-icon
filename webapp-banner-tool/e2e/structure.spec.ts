// T-142-F1 items 6, 8 and 9 in the D2 look (T-142-F3 R3): no shadow on in-flow
// content, button borders only as D2's 1 px neutral edge, and at most one
// dashed drop target per view. Runs in both themes and all four projects.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { ALL_ROUTES } from "./fixtures/routes";
import { structureViolations } from "./helpers/colourBudget";
import { layersAreDrawer, openLayersByKeyboard } from "./helpers/assertions";

const THEMES = ["dark", "light"] as const;

const accountMenu = (page: Page) => page.locator('button[aria-haspopup="menu"]');

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await mockApi(page);
    });

    test("the shell has no shadow, no stray button border and no drop zone", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
      expect(await page.locator(".ds-studio-bar button").count()).toBeGreaterThan(0);
      expect(await structureViolations(page, { exclude: "#main-content" })).toEqual([]);
      // The open drawer may cast a shadow, like a popover.
      if (await layersAreDrawer(page)) {
        await openLayersByKeyboard(page);
        expect(await structureViolations(page, { exclude: "#main-content" })).toEqual([]);
        await page.keyboard.press("Escape");
      }
      await accountMenu(page).click();
      await expect(page.getByRole("menu")).toBeVisible();
      // The menu popover may have a shadow; everything else must not.
      expect(await structureViolations(page)).toEqual([]);
    });

    for (const route of ALL_ROUTES) {
      test(`${route.name} follows the structure rules`, async ({ page }) => {
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        expect(await structureViolations(page)).toEqual([]);
      });
    }
  });
}
