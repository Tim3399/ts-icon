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
  // TS6 client geometry (src/components/teamspeakGeometry.ts; TS6 reference,
  // estimated, calibrate): 456 x 30 depth-0 pill, 10 px indent with aligned
  // right edges, 44 px row pitch.
  const TS6 = { width: 456, height: 30, indent: 10, pitch: 44 };

  test("draws the crop with the TS6 geometry next to the channel's neighbour and follows the crop", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    // "General" (#42, depth 0) with its sub-channel "General" (#43, depth 1) below.
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("42");
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    const preview = page.getByRole("figure", { name: "Preview in TeamSpeak" });
    const banner = preview.getByAltText("Cropped banner for General");
    await expect(banner).toBeVisible();
    await expect(preview.locator(".channel-tree-row")).toHaveCount(2);
    await expect(preview.locator(".ts-preview-selected .channel-tree-name")).toHaveText("General");
    // The banner is the exact 500 x 44 export, drawn with cover into the pill.
    expect(
      await banner.evaluate((img: HTMLImageElement) => [
        img.naturalWidth,
        img.naturalHeight,
        getComputedStyle(img).objectFit,
      ]),
    ).toEqual([500, 44, "cover"]);
    // No fade overlay and no dimmed context rows.
    const looks = await preview.locator(".channel-tree-pill").evaluateAll((pills) =>
      pills.map((pill) => ({
        after: getComputedStyle(pill, "::after").backgroundImage,
        opacity: getComputedStyle(pill.closest("li")!).opacity,
      })),
    );
    for (const look of looks) expect(look).toEqual({ after: "none", opacity: "1" });

    const pills = preview.locator(".channel-tree-pill");
    const [selected, child] = [
      (await pills.nth(0).boundingBox())!,
      (await pills.nth(1).boundingBox())!,
    ];
    const scaled = page.getByText("Scaled down to fit this screen");
    if (page.viewportSize()!.width >= 600) {
      expect(Math.abs(selected.width - TS6.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(selected.height - TS6.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(selected.width - child.width - TS6.indent)).toBeLessThanOrEqual(1);
      expect(Math.abs(child.y - selected.y - TS6.pitch)).toBeLessThanOrEqual(1);
      await expect(scaled).toBeHidden();
    } else {
      expect(selected.width).toBeLessThan(TS6.width);
      expect(selected.width / selected.height).toBeCloseTo(TS6.width / TS6.height, 0);
      await expect(scaled).toBeVisible();
    }
    // Right edges aligned.
    expect(Math.abs(selected.x + selected.width - (child.x + child.width))).toBeLessThanOrEqual(1);

    // The exact saved pixels at 1:1 below the preview.
    await expect(page.getByText("Saved image (500 × 44)")).toBeVisible();
    const saved = page.getByAltText(/^Saved image for General/);
    expect(await saved.getAttribute("src")).toBe(await banner.getAttribute("src"));

    // The preview follows a zoom within a frame or two.
    const before = await banner.getAttribute("src");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => banner.getAttribute("src")).not.toBe(before);
    await expectNoHorizontalOverflow(page);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`stays TeamSpeak dark in the ${theme} app theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await mockApi(page);
      await page.goto("/");
      await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
      const preview = page.getByRole("figure", { name: "Preview in TeamSpeak" });
      await expect(preview).toBeVisible();
      const colours = await preview.evaluate((figure) => {
        const resolve = (token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.appendChild(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const pill = figure.querySelector(".ts-preview-selected .channel-tree-pill")!;
        const name = figure.querySelector(".ts-preview-selected .channel-tree-name")!;
        return {
          tree: getComputedStyle(figure).backgroundColor,
          row: getComputedStyle(pill).backgroundColor,
          label: getComputedStyle(name).color,
          expected: {
            tree: resolve("--color-ts-tree-bg"),
            row: resolve("--color-ts-row-bg"),
            label: resolve("--color-ts-label"),
          },
        };
      });
      expect({ tree: colours.tree, row: colours.row, label: colours.label }).toEqual(
        colours.expected,
      );
      // The measured TS6 pill colour #191f32, not the app theme's row surface.
      expect(colours.row).toBe("rgb(25, 31, 50)");
    });
  }
});
