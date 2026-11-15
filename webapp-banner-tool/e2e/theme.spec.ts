// T-142 item 13: the theme follows the system, a stored choice wins before
// the first paint, and the account menu offers system, light and dark.
// Assertions read the computed window background. Desktop project.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";

const DARK_WINDOW = "rgb(19, 26, 44)"; // --color-bg-window, dark (#131a2c)
const LIGHT_WINDOW = "rgb(255, 255, 255)"; // --color-bg-window, light (#ffffff, Primer canvas)

const windowBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Theme behaviour runs in the desktop project.");
  await mockApi(page);
});

test("without a stored choice the app follows the system scheme both ways", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => windowBackground(page)).toBe(LIGHT_WINDOW);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
});

for (const [stored, system, expected] of [
  ["light", "dark", LIGHT_WINDOW],
  ["dark", "light", DARK_WINDOW],
] as const) {
  test(`a stored "${stored}" overrides a ${system} system scheme with no flash`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("ts-icon-theme", value), stored);
    // Record the theme as soon as <body> exists, before the module bundle
    // runs: only the index.html bootstrap can have applied it by then.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        observer.disconnect();
        document.documentElement.dataset.firstPaintTheme =
          document.documentElement.getAttribute("data-theme") ?? "none";
      }).observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.firstPaintTheme)).toBe(
      stored,
    );
    await expect.poll(() => windowBackground(page)).toBe(expected);
  });
}

test("the account menu offers system, light and dark and stores the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const account = page.locator('button[aria-haspopup="menu"]');
  const choose = async (name: "System" | "Light" | "Dark") => {
    await account.click();
    await page.getByRole("menuitemradio", { name }).click();
    // The menu closes and focus returns to the account button.
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(account).toBeFocused();
  };
  await account.click();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await choose("Light");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("light");
  await expect.poll(() => windowBackground(page)).toBe(LIGHT_WINDOW);
  await choose("Dark");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("dark");
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
  await choose("System");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("system");
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
  await account.click();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("the account menu shows the user name and logs out", async ({ page }) => {
  await page.goto("/");
  await page.locator('button[aria-haspopup="menu"]').click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Signed in as local");
  await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();
});
