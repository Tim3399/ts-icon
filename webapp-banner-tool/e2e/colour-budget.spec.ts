// T-142-F1 items 1, 2 and 3: accent, destructive red and status colours appear
// only where the colour budget allows. Runs in both themes and all four
// projects. The walk is in helpers/colourBudget.ts; the focus ring is checked
// separately below because it is a global `:focus-visible` rule.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { ALL_ROUTES } from "./fixtures/routes";
import { colourBudgetViolations, resolveToken } from "./helpers/colourBudget";
import { layersAreDrawer, openLayersByKeyboard } from "./helpers/assertions";

const THEMES = ["dark", "light"] as const;

const accountMenu = (page: Page) => page.locator('button[aria-haspopup="menu"]');

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await mockApi(page);
    });

    test("the shell stays within the colour budget", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
      // The current mode carries the accent through data-accent="selection".
      await expect(page.locator('.ds-studio-bar [data-accent="selection"]')).toHaveCount(1);
      expect(await colourBudgetViolations(page)).toEqual([]);
    });

    test("the open layer drawer and the open account menu stay within the colour budget", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
      if (await layersAreDrawer(page)) {
        await openLayersByKeyboard(page);
        expect(await colourBudgetViolations(page)).toEqual([]);
        // Escape closes the drawer and returns focus to the toggle.
        await page.keyboard.press("Escape");
      }
      await accountMenu(page).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(await colourBudgetViolations(page)).toEqual([]);
    });

    for (const route of ALL_ROUTES) {
      test(`${route.name} stays within the colour budget`, async ({ page }) => {
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        expect(await colourBudgetViolations(page)).toEqual([]);
      });
    }
  });
}

test("the focus ring is 2 px solid in the focus colour", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
  const focus = await resolveToken(page, "--color-focus");
  await page.keyboard.press("Tab"); // the skip link
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
  });
  expect(ring).toEqual({ style: "solid", width: "2px", color: focus });
});
