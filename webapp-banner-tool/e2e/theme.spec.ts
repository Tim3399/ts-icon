// T-142 item 13: the theme follows the system, a stored choice wins before
// the first paint, and the control cycles system -> light -> dark.
// Assertions read the computed window background. Desktop project.
import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./fixtures/api";

const DARK_WINDOW = "rgb(19, 26, 44)"; // --color-bg-window, dark (#131a2c)
const LIGHT_WINDOW = "rgb(233, 237, 243)"; // --color-bg-window, light (#e9edf3)

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

test("the theme control cycles system, light, dark and stores the choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const control = page.getByRole("button", { name: /^Appearance:/ });
  await expect(control).toHaveAccessibleName("Appearance: System. Change appearance");
  await control.click();
  await expect(control).toHaveAccessibleName("Appearance: Light. Change appearance");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("light");
  await expect.poll(() => windowBackground(page)).toBe(LIGHT_WINDOW);
  await control.click();
  await expect(control).toHaveAccessibleName("Appearance: Dark. Change appearance");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("dark");
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
  await control.click();
  await expect(control).toHaveAccessibleName("Appearance: System. Change appearance");
  expect(await page.evaluate(() => localStorage.getItem("ts-icon-theme"))).toBe("system");
  await expect.poll(() => windowBackground(page)).toBe(DARK_WINDOW);
});
