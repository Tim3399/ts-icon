// T-142-F1 items 6, 8 and 9: no shadow on in-flow content, only HIG button
// borders (none, or a 1 px neutral border on gray buttons) and at most one
// dashed drop zone per view. Runs in both themes and all four projects.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { ALL_ROUTES, SCREEN_OWNED_SCOPES, pendingReason } from "./fixtures/routes";
import { structureViolations } from "./helpers/colourBudget";
import { openSidebarByKeyboard, sidebarIsCollapsible } from "./helpers/assertions";

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
      if (await sidebarIsCollapsible(page)) await openSidebarByKeyboard(page);
      expect(await structureViolations(page, { exclude: SCREEN_OWNED_SCOPES })).toEqual([]);
      // The drawer covers the top bar; closing it returns focus to the toggle.
      if (await sidebarIsCollapsible(page)) await page.keyboard.press("Escape");
      await accountMenu(page).click();
      await expect(page.getByRole("menu")).toBeVisible();
      // The menu popover may have a shadow; everything else must not.
      expect(await structureViolations(page, { exclude: SCREEN_OWNED_SCOPES })).toEqual([]);
    });

    for (const route of ALL_ROUTES) {
      test(`${route.name} follows the structure rules`, async ({ page }) => {
        test.fixme(Boolean(pendingReason(route.path)), pendingReason(route.path));
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        expect(await structureViolations(page)).toEqual([]);
      });
    }
  });
}
