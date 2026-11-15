// Studio shell (T-142-F3 items 1 and 3; replaces the sidebar and live panel of
// T-142 items 14-16, R3): the mode switcher, the Not-found page and the
// keyboard-only workflow across screens. The layer panel breakpoints are in
// studio-layout.spec.ts.
import { expect, test } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import { tabTo } from "./helpers/assertions";

test("unknown route offers a usable recovery path", async ({ page }) => {
  await mockApi(page);
  await page.goto("/missing-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Create a banner" }).click();
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
});

test("banner creation, gallery navigation and deletion work using Tab and keyboard activation", async ({
  page,
}, testInfo) => {
  const api = await mockApi(page);
  await page.goto("/");
  const channel = page.getByRole("combobox", { name: "Channel", exact: true });
  await expect(channel).toBeEnabled();
  await tabTo(page, channel);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(channel).toHaveValue("43");

  await tabTo(page, page.locator("#file-upload"));
  const picker = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  // Supply only the OS picker result; opening it and all web controls use the keyboard.
  await (await picker).setFiles({
    name: "gradient.png",
    mimeType: "image/png",
    buffer: await sourcePng(page),
  });
  const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
  await expect(zoom).toBeEnabled();
  await tabTo(page, zoom);
  await page.keyboard.press("Space");
  const save = page.getByRole("button", { name: "Crop & send image" });
  await tabTo(page, save);
  await page.keyboard.press("Enter");
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  expect(api.uploads[0].png.readUInt32BE(16)).toBe(500);
  expect(api.uploads[0].png.readUInt32BE(20)).toBe(44);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("saved-banner.png"), fullPage: true });

  // The mode switcher is in the top bar at every width (icons only below 1240 px).
  const modes = page.getByRole("navigation", { name: "Primary" });
  const channelsLink = modes.getByRole("link", { name: "Manage channel images" });
  await tabTo(page, channelsLink);
  await page.keyboard.press("Enter");
  await expect(page.locator(".channel-row")).toHaveCount(2);
  await expect(channelsLink).toHaveAttribute("aria-current", "page");
  // D2 (D-142F-34): the image filter is a segmented radio group; the arrow keys move the choice.
  const status = page.getByRole("radiogroup", { name: "Image status" });
  await tabTo(page, status.getByRole("radio", { checked: true }));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(status.getByRole("radio", { name: "With image" })).toBeChecked();
  await expect(page.locator(".channel-row")).toHaveCount(1);
  // Remove… sits in the inspector of the selected (only visible) row.
  const remove = page
    .getByRole("complementary", { name: "Inspector" })
    .getByRole("button", { name: "Remove…" });
  await tabTo(page, remove);
  await page.keyboard.press("Enter");
  // The confirmation dialog starts on Cancel; Tab reaches the destructive confirm button.
  await tabTo(page, page.getByRole("alertdialog").getByRole("button", { name: "Remove" }));
  await page.keyboard.press("Enter");
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(page.locator(".channel-row")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("the mode switcher lists the destinations and marks the current one", async ({ page }) => {
  await mockApi(page);
  await page.goto("/banner-urls");
  const nav = page.getByRole("navigation", { name: "Primary" });
  const links = nav.getByRole("link");
  expect(await links.count()).toBeGreaterThan(0);
  // The labels are the accessible names at every width (visible text from 1240 px).
  for (const [i, name] of [
    "Banner editor",
    "Manage channel images",
    "Banner URLs",
    "Channel Wallpaper",
  ].entries())
    await expect(links.nth(i)).toHaveAccessibleName(name);
  await expect(links).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Banner URLs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
  // One level only: one list, no nested lists.
  await expect(nav.locator("ul ul")).toHaveCount(0);
});

test("the top bar shows the Studio mark and one account button", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const bar = page.locator(".ds-studio-bar");
  await expect(bar).toContainText("ts-icon");
  await expect(bar).toContainText("Studio");
  await expect(bar.locator('button[aria-haspopup="menu"]')).toHaveCount(1);
});

test("the live tree is the editor's layer panel and is absent elsewhere", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The wide layout runs in the desktop project.");
  await mockApi(page);
  await page.goto("/");
  const layers = page.getByRole("complementary", { name: "Layers" });
  await expect(layers.getByRole("region", { name: "Live channel tree" })).toBeVisible();
  await page.goto("/channels");
  await expect(
    page.getByRole("heading", { level: 1, name: "Manage channel images" }),
  ).toBeVisible();
  await expect(layers).toBeHidden();
  await expect(page.getByRole("button", { name: /layers/ })).toHaveCount(0);
});
