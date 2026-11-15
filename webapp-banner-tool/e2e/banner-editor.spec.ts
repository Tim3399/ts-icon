// Banner editor (route "/"). Owned by T-142 part (a).
import { expect, test, type Page } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import { DESTRUCTIVE_VERBS } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

test("real Cropper exports 500×44 PNG and preserves selected content after resize", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
  await page
    .locator("#file-upload")
    .setInputFiles({ name: "gradient.png", mimeType: "image/png", buffer: await sourcePng(page) });
  const save = page.getByRole("button", { name: "Crop & send image" });
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const down = page.getByRole("button", { name: "Move down", exact: true });
  await down.focus();
  await page.keyboard.press("Space");
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  expect(api.uploads[0].png.readUInt32BE(16)).toBe(500);
  expect(api.uploads[0].png.readUInt32BE(20)).toBe(44);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();
  await page.getByRole("button", { name: "Enlarge view" }).click();
  await expect(page.locator(".preview-box")).toHaveClass(/preview-box-enlarged/);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(2);
  expect(api.uploads[1].png.equals(api.uploads[0].png)).toBe(true);
  await expectNoHorizontalOverflow(page);
});

// T-142 items 8 and 18 for this route: every state keeps the 44 x 44 px hit
// targets and at most one prominent, non-destructive button ("Crop & send image").
// The screen table lists no destructive action for this route.
const SCREEN_VERBS = DESTRUCTIVE_VERBS;

test("empty state keeps hit targets and the prominent rule", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("Add an image above, or paste one")).toBeVisible();
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await expect(page.locator('[data-variant="prominent"]:visible')).toHaveText("Crop & send image");
  await expectNoHorizontalOverflow(page);
});

test("error state keeps hit targets and the prominent rule", async ({ page }) => {
  await mockApi(page, { state: "error" });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The server could not finish this action.",
  );
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await page.getByRole("textbox", { name: "Image URL" }).fill("http://example.com/banner.png");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByText("Enter a complete HTTPS image URL.")).toBeVisible();
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
});

test("loaded state keeps hit targets and the prominent rule", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
  await page
    .locator("#file-upload")
    .setInputFiles({ name: "gradient.png", mimeType: "image/png", buffer: await sourcePng(page) });
  const save = page.getByRole("button", { name: "Crop & send image" });
  await expect(save).toBeEnabled();
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(1);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await expectNoHorizontalOverflow(page);
});

// T-142-F1 item 13: file, drop and paste each load the image into the cropper.
// The URL path is covered by the tests above and the unit tests.

/** Builds a DataTransfer holding the PNG in the page. */
async function transferWith(page: Page, png: Buffer, name = "source.png") {
  return page.evaluateHandle(
    ({ base64, name }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: "image/png" }));
      return transfer;
    },
    { base64: png.toString("base64"), name },
  );
}

async function expectCropperReady(page: Page) {
  await expect(page.locator(".preview-box .cropper-crop-box")).toHaveAttribute(
    "data-accent",
    "crop",
  );
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled();
}

test.describe("image sources", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
  });

  test("file picker", async ({ page }) => {
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    await expectCropperReady(page);
  });

  test("drop onto the editor", async ({ page }) => {
    const transfer = await transferWith(page, await sourcePng(page));
    // Outside the drop zone: the crop stage is part of the editor too.
    const stage = page.getByTestId("crop-stage");
    await stage.dispatchEvent("dragenter", { dataTransfer: transfer });
    await stage.dispatchEvent("dragover", { dataTransfer: transfer });
    await stage.dispatchEvent("drop", { dataTransfer: transfer });
    await expectCropperReady(page);
  });

  test("drop onto the drop zone", async ({ page }) => {
    const transfer = await transferWith(page, await sourcePng(page));
    const zone = page.locator("label[for='file-upload']");
    await zone.dispatchEvent("dragover", { dataTransfer: transfer });
    await zone.dispatchEvent("drop", { dataTransfer: transfer });
    await expectCropperReady(page);
  });

  test("paste with Ctrl/Cmd+V anywhere on the page", async ({ page }) => {
    const transfer = await transferWith(page, await sourcePng(page), "clipboard.png");
    await page.evaluate((clipboardData) => {
      document.body.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
      );
    }, transfer);
    await expectCropperReady(page);
  });
});

// T-142-F1 items 14, 15 and 17: the TeamSpeak preview.
test.describe("TeamSpeak preview", () => {
  test("shows the exact crop at 1:1 with the channel's neighbour and follows the crop", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    const preview = page.getByRole("figure", { name: "Preview in TeamSpeak" });
    const banner = preview.getByAltText("Cropped banner for General");
    await expect(banner).toBeVisible();
    // Two rows: the parent "General" above the selected sub-channel "General".
    await expect(preview.locator(".channel-tree-row")).toHaveCount(2);
    await expect(preview.locator(".ts-preview-selected .channel-tree-name")).toHaveText("General");
    // Exactly the 500 x 44 export.
    expect(
      await banner.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
    ).toEqual([500, 44]);
    const pill = preview.locator(".ts-preview-selected .channel-tree-pill");
    const box = (await pill.boundingBox())!;
    const width = page.viewportSize()!.width;
    if (width >= 600) {
      expect(box.width).toBeCloseTo(500, 0);
      expect(box.height).toBeCloseTo(44, 0);
      await expect(page.getByText("Scaled to fit this screen.")).toBeHidden();
    } else {
      expect(box.width).toBeLessThan(500);
      expect(box.width / box.height).toBeCloseTo(500 / 44, 1);
      await expect(page.getByText("Scaled to fit this screen.")).toBeVisible();
    }
    // The preview follows a nudge within a frame or two.
    const before = await banner.getAttribute("src");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => banner.getAttribute("src")).not.toBe(before);
    await expectNoHorizontalOverflow(page);
  });
});
