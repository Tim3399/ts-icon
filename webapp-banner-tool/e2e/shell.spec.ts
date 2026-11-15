// App shell: sidebar (T-142 items 14, 15), live panel (item 16), the
// Not-found page and the keyboard-only workflow across screens.
import { expect, test } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import {
  expectNoHorizontalOverflow,
  openSidebarByKeyboard,
  sidebarIsCollapsible,
  tabTo,
} from "./helpers/assertions";

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

  // Below 1024 px the sidebar is collapsed; it opens by keyboard first (item 15).
  if (await sidebarIsCollapsible(page)) await openSidebarByKeyboard(page);
  await tabTo(page, page.getByRole("link", { name: "Manage channel images" }));
  await page.keyboard.press("Enter");
  await expect(page.locator(".channel-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Manage channel images" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const status = page.getByLabel("Image status");
  await tabTo(page, status);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(status).toHaveValue("own");
  await expect(page.locator(".channel-card")).toHaveCount(1);
  const remove = page.locator(".channel-card").getByRole("button", { name: "Delete image" });
  await tabTo(page, remove);
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(page.locator(".channel-card")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("sidebar lists the destinations and marks the current one", async ({ page }) => {
  await mockApi(page);
  await page.goto("/banner-urls");
  if (await sidebarIsCollapsible(page)) await openSidebarByKeyboard(page);
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText([
    "Banner editor",
    "Manage channel images",
    "Banner URLs",
    "Channel Wallpaper",
  ]);
  await expect(nav.getByRole("link", { name: "Banner URLs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
  // At most two levels (HIG): one list, no nested lists.
  await expect(nav.locator("ul ul")).toHaveCount(0);
});

test.describe("sidebar on narrow viewports", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !["mobile", "zoom-layout"].includes(testInfo.project.name),
      "Item 15 covers the collapsed sidebar in the mobile and zoom-layout projects.",
    );
    await mockApi(page);
    await page.goto("/");
  });

  test("starts collapsed, opens and closes by keyboard, Escape returns focus", async ({ page }) => {
    const sidebar = page.locator("#app-sidebar");
    const toggle = page.getByRole("button", { name: "Show sidebar" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "app-sidebar");
    await expect(sidebar).toHaveAttribute("inert", "");
    // Collapsed links are neither focusable nor exposed to assistive technology.
    await expect(page.getByRole("link", { name: "Banner editor" })).toHaveCount(0);

    await openSidebarByKeyboard(page);
    await expect(sidebar).not.toHaveAttribute("inert");
    await expect(page.getByRole("link", { name: "Banner editor" })).toBeFocused();

    await page.keyboard.press("Escape");
    const closed = page.getByRole("button", { name: "Show sidebar" });
    await expect(closed).toHaveAttribute("aria-expanded", "false");
    await expect(closed).toBeFocused();
    await expect(sidebar).toHaveAttribute("inert", "");

    // Enter on the toggle opens it again; Enter on the toggle inside the open
    // state is covered by the click path below.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Hide sidebar" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByRole("button", { name: "Hide sidebar" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("closes after a navigation", async ({ page }) => {
    await openSidebarByKeyboard(page);
    await tabTo(page, page.getByRole("link", { name: "Manage channel images" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/channels$/);
    await expect(page.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.locator("#app-sidebar")).toHaveAttribute("inert", "");
    await expectNoHorizontalOverflow(page);
  });
});

test("sidebar is a visible column from 1024 px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Wide layout is checked in the desktop project.");
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Banner editor" })).toBeVisible();
  await expect(page.locator("#app-sidebar")).not.toHaveAttribute("inert");
  await expect(page.getByRole("button", { name: /sidebar/ })).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 720 });
  await expect(page.getByRole("link", { name: "Banner editor" })).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 720 });
  await expect(page.getByRole("button", { name: "Show sidebar" })).toBeVisible();
});

test.describe("live panel", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Item 16 runs in the desktop project.");
    await mockApi(page);
  });

  test("toggle hides and shows the panel and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByRole("complementary", { name: "Live channel tree" });
    const hide = page.getByRole("button", { name: "Hide the live channel tree" });
    await expect(panel).toBeVisible();
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await hide.click();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("ts-icon-rail-open"))).toBe("closed");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
    await expect(panel).toBeHidden();
    const show = page.getByRole("button", { name: "Show the live channel tree" });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await show.click();
    await expect(panel).toBeVisible();
    await page.reload();
    await expect(panel).toBeVisible();
  });

  test("sits beside the content from 1200 px and below it under 1200 px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const panel = page.getByRole("complementary", { name: "Live channel tree" });
    const main = page.locator("#main-content");
    await expect(panel).toBeVisible();
    let [p, m] = [(await panel.boundingBox())!, (await main.boundingBox())!];
    expect(p.x).toBeGreaterThanOrEqual(m.x + m.width - 1);
    expect(p.y).toBeLessThan(m.y + m.height);

    await page.setViewportSize({ width: 1199, height: 800 });
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(m.y);
    [p, m] = [(await panel.boundingBox())!, (await main.boundingBox())!];
    expect(p.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
    await expectNoHorizontalOverflow(page);
  });
});
