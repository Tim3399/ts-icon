// Banner editor (route "/"). Owned by T-142 part (a).
import { expect, test, type Page } from "@playwright/test";
import {
  bannerPng,
  edgeCaseChannels,
  fixtureImages,
  longTreeChannels,
  mockApi,
  sourcePng,
} from "./fixtures/api";
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
  // Keyboard movement: the Y field nudges the crop (the move buttons became the
  // X / Y / W / H fields of the D2 inspector, D-142F-33).
  await page.getByRole("textbox", { name: "Y", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  expect(api.uploads[0].png.readUInt32BE(16)).toBe(500);
  expect(api.uploads[0].png.readUInt32BE(20)).toBe(44);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();
  // A resize of the stage re-initializes the cropper (the "Enlarge view" button
  // is gone in the D2 editor, D-142F-33); the selection must survive it.
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width - 40, height: viewport.height - 40 });
  await expect(page.locator(".preview-box .cropper-crop-box")).toBeVisible();
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
  await expect(page.getByText("Drop an image here, or click to browse")).toBeVisible();
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await expect(page.locator('[data-variant="prominent"]:visible')).toHaveText("Crop & send image");
  await expectNoHorizontalOverflow(page);
});

test("error state keeps hit targets and the prominent rule", async ({ page }) => {
  await mockApi(page, { state: "error" });
  await page.goto("/");
  // The channel list error sits in the layer panel since D-142F-33.
  await expect(page.locator("#studio-layers").getByRole("alert")).toContainText(
    "The server could not finish this action.",
  );
  await expectHitTargets(page);
  await expectProminentRule(page, SCREEN_VERBS);
  await page.getByRole("textbox", { name: "Image URL" }).fill("http://example.com/banner.png");
  await page.getByRole("button", { name: "Load URL", exact: true }).click();
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

// T-142-F2 item 4: focus after "Crop & send image" (src/design/README.md,
// "Focus after the main action").
test.describe("focus after save", () => {
  async function loadAndSave(page: Page) {
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    const save = page.getByRole("button", { name: "Crop & send image" });
    await expect(save).toBeEnabled();
    await save.focus();
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    return scrollY;
  }
  const active = (page: Page) =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}` : "none";
    });

  test("moves to the channel select after a successful save", async ({ page }) => {
    const api = await mockApi(page);
    await page.goto("/");
    const before = await loadAndSave(page);
    await expect.poll(() => api.uploads.length).toBe(1);
    await expect.poll(() => active(page)).toBe("select#banner-channel");
    // R6: the page does not jump away from the dock.
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  test("moves to the error message after a failed save", async ({ page }) => {
    await mockApi(page);
    // Registered after mockApi, so it answers the upload first.
    await page.route("**/channels/43/image", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, json: { message: "The disk is full." } })
        : route.fallback(),
    );
    await page.goto("/");
    await loadAndSave(page);
    const message = page.locator(".editor-error");
    await expect(message).toContainText("The server could not finish this action.");
    await expect(message).toBeFocused();
    expect(await active(page)).not.toBe("body");
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
    // Never scaled (T-142-F3 item 12): the TS6 size in every project; a column
    // narrower than the tree scrolls it sideways and says so.
    expect(Math.abs(selected.width - TS6.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(selected.height - TS6.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(selected.width - child.width - TS6.indent)).toBeLessThanOrEqual(1);
    expect(Math.abs(child.y - selected.y - TS6.pitch)).toBeLessThanOrEqual(1);
    const fontSize = await preview
      .locator(".channel-tree-name")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(11);
    const note = page.getByText("scroll sideways to see them whole");
    if (page.viewportSize()!.width < 560) await expect(note).toBeVisible();
    else await expect(note).toBeHidden();
    // Right edges aligned.
    expect(Math.abs(selected.x + selected.width - (child.x + child.width))).toBeLessThanOrEqual(1);

    // The exact saved pixels at 1:1 below the preview.
    await expect(page.getByText("Saved image · 500 × 44 · 1:1")).toBeVisible();
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

// T-142-F3 items 4–6 and R4 (D-142F-33): every visible control of the D2
// Studio editor works.
test.describe("Studio editor", () => {
  async function loadSource(page: Page, cid = "43") {
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption(cid);
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled();
  }
  const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: false });
  const after = (page: Page) => page.getByAltText("New banner of General");

  test("X and Y set the crop in source pixels and the preview follows", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loadSource(page);
    // The fitted crop spans the full 1000 px source width; halve it first so X can move.
    await field(page, "Width").fill("500");
    await field(page, "Width").blur();
    await expect(field(page, "Width")).toHaveValue("500");
    const x = field(page, "X");
    await expect(x).not.toHaveValue("");
    const before = await after(page).getAttribute("src");
    await x.fill("100");
    await expect.poll(() => field(page, "X").inputValue()).toBe("100");
    await expect.poll(() => after(page).getAttribute("src")).not.toBe(before);
    const moved = await after(page).getAttribute("src");
    await field(page, "Y").fill("120");
    await field(page, "Y").blur();
    await expect(field(page, "Y")).toHaveValue("120");
    await expect.poll(() => after(page).getAttribute("src")).not.toBe(moved);
    // The preview row and the saved strip show the same export.
    const preview = page.getByRole("figure", { name: "Preview in TeamSpeak" });
    expect(await preview.getByAltText("Cropped banner for General").getAttribute("src")).toBe(
      await after(page).getAttribute("src"),
    );
  });

  test("W and H keep 500 : 44", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await loadSource(page);
    await field(page, "Width").fill("500");
    await field(page, "Width").blur();
    await expect(field(page, "Width")).toHaveValue("500");
    await expect(field(page, "Height")).toHaveValue("44");
    await field(page, "Height").fill("66");
    await field(page, "Height").blur();
    await expect(field(page, "Width")).toHaveValue("750");
    await expect(field(page, "Height")).toHaveValue("66");
  });

  test("Fit and zoom act on the cropper and the readout shows the real zoom", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const readout = page.getByLabel("Zoom level");
    await expect(readout).toHaveText("– %");
    await loadSource(page);
    await expect(readout).toHaveText(/^\d+ %$/);
    const fitted = await readout.textContent();
    const imageWidth = () =>
      page
        .locator(".preview-box .cropper-canvas")
        .evaluate((el) => el.getBoundingClientRect().width);
    const width = await imageWidth();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(readout).not.toHaveText(fitted!);
    expect(await imageWidth()).toBeGreaterThan(width);
    // The readout is the canvas width over the natural width (1000 px source).
    const shown = parseInt((await readout.textContent())!, 10);
    expect(Math.abs(shown - Math.round(((await imageWidth()) / 1000) * 100))).toBeLessThanOrEqual(
      1,
    );
    // One step back is the fitted size; zoom-out stops there (F-142-29, the
    // minimum disables it), so a second click is not possible any more.
    const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
    await zoomOut.click();
    if (await zoomOut.isEnabled()) await zoomOut.click();
    expect(await imageWidth()).toBeLessThan(width + 1);
    await page.getByRole("button", { name: "Fit to screen", exact: true }).click();
    await expect(readout).toHaveText(fitted!);
  });

  test("a layer row selects its channel, the same state as the select", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const layers = page.getByRole("list", { name: "Channels" });
    const rows = layers.getByRole("button");
    expect(await rows.count()).toBeGreaterThan(0);
    const second = rows.nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("combobox", { name: "Channel", exact: true })).toHaveValue("43");
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("42");
    await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
    await expect(second).not.toHaveAttribute("aria-current");
  });

  test("the deep link /?channel=<cid> preselects the channel", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?channel=43");
    await expect(page.getByRole("combobox", { name: "Channel", exact: true })).toHaveValue("43");
    await expect(
      page.getByRole("list", { name: "Channels" }).getByRole("button").nth(1),
    ).toHaveAttribute("aria-current", "true");
  });

  test("Before shows the empty tile without a current banner, the banner with one", async ({
    page,
  }) => {
    const api = await mockApi(page);
    await page.goto("/");
    await loadSource(page);
    await expect(page.getByText("No banner yet")).toBeVisible();
    await expect(after(page)).toBeVisible();
    // 250 x 22 (R8) wherever the dock has the room; a phone column narrows them.
    const roomy = page.viewportSize()!.width >= 600;
    for (const strip of roomy ? [page.getByText("No banner yet"), after(page)] : []) {
      const box = (await strip.boundingBox())!;
      expect(Math.abs(box.width - 250)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - 22)).toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "Crop & send image" }).click();
    await expect.poll(() => api.uploads.length).toBe(1);
    const current = page.getByAltText("Saved banner for General");
    await expect(current).toBeVisible();
    await expect
      .poll(() => current.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(500);
    const box = (await current.boundingBox())!;
    if (roomy) {
      expect(Math.abs(box.width - 250)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - 22)).toBeLessThanOrEqual(1);
    } else expect(box.width / box.height).toBeCloseTo(500 / 44, 0);
  });

  test("the editor never reads the admin-only banner URLs (R4)", async ({ page }) => {
    await mockApi(page);
    const adminCalls: string[] = [];
    await page.route("**/channels/banner-urls", (route) => {
      adminCalls.push(route.request().url());
      return route.fulfill({ status: 403, json: { message: "Admins only." } });
    });
    await page.goto("/");
    const rows = page.getByRole("list", { name: "Channels" }).getByRole("button");
    await expect(rows).toHaveCount(2);
    await expect(page.locator("#studio-layers").getByRole("alert")).toHaveCount(0);
    await loadSource(page);
    await expect(after(page)).toBeVisible();
    expect(adminCalls).toEqual([]);
  });
});

// T-142-F4 (Critic r4): the editor's edge cases, each reproducing the Critic's case.
test.describe("edge cases (T-142-F4)", () => {
  const combobox = (page: Page) => page.getByRole("combobox", { name: "Channel", exact: true });
  async function loadImage(page: Page) {
    await page.locator("#file-upload").setInputFiles({
      name: "source.png",
      mimeType: "image/png",
      buffer: await sourcePng(page),
    });
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeEnabled();
  }
  async function edgeCases(page: Page, spacerBase = false) {
    await page.goto("about:blank");
    const { channels, banners } = edgeCaseChannels();
    await mockApi(page, {
      channels,
      images: await fixtureImages(page, banners),
      spacerBase: spacerBase ? await bannerPng(page, 210, "") : undefined,
    });
  }

  test("F-142-28: a banner that fails to load is the quiet empty tile, never a broken image", async ({
    page,
  }) => {
    await edgeCases(page);
    await page.goto("/?channel=20");
    const row = page.getByRole("list", { name: "Channels" }).getByRole("button", {
      name: "Broken banner",
    });
    await expect(row).toHaveAttribute("aria-current", "true");
    await expect(row.locator(".layer-thumb[data-empty]")).toBeVisible();
    await expect(row.locator("img")).toHaveCount(0);
    await expect(page.getByText("No banner yet")).toBeVisible();
    // No broken image anywhere in the editor.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Array.from(document.images).filter(
              (img) => img.checkVisibility() && img.complete && img.naturalWidth === 0,
            ).length,
        ),
      )
      .toBe(0);
  });

  test("F-142-29: the zoom readout is the real zoom, also at the minimum", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await combobox(page).selectOption("43");
    await loadImage(page);
    const readout = page.getByLabel("Zoom level");
    const real = () =>
      page.evaluate(() => {
        const canvas = document.querySelector(".preview-box .cropper-canvas")!;
        const image = document.querySelector<HTMLImageElement>("#preview")!;
        return Math.round((canvas.getBoundingClientRect().width / image.naturalWidth) * 100);
      });
    const expectReal = async () =>
      expect.poll(async () => parseInt((await readout.textContent())!, 10)).toBe(await real());
    await expectReal();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expectReal();
    await page.getByRole("button", { name: "Fit to screen", exact: true }).click();
    await expectReal();
    const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
    for (let i = 0; i < 6 && (await zoomOut.isEnabled()); i++) {
      await zoomOut.click();
      await expectReal();
    }
    // At the minimum the image cannot shrink any further: zoom-out is disabled.
    await expect(zoomOut).toBeDisabled();
    await expectReal();
  });

  test("F-142-30: New marks the channel with the unsaved crop, also after save and a switch", async ({
    page,
  }) => {
    const api = await mockApi(page);
    await page.goto("/");
    await combobox(page).selectOption("42");
    await loadImage(page);
    const marker = page.locator(".ts-preview-selected .channel-tree-marker");
    await expect(marker).toHaveText("New");
    await page.getByRole("button", { name: "Crop & send image" }).click();
    await expect.poll(() => api.uploads.length).toBe(1);
    await expect(marker).toHaveCount(0);
    await combobox(page).selectOption("43");
    await expect(marker).toHaveText("New");
    await expect(page.locator(".ts-preview-selected .channel-tree-name")).toHaveText("General");
    await expect(page.getByRole("combobox", { name: "Channel", exact: true })).toHaveValue("43");
  });

  test("F-142-31: a spacer on the spacer base image keeps it when selected", async ({ page }) => {
    await edgeCases(page, true);
    await page.goto("/?channel=21");
    const before = page.getByAltText("Current banner of [spacer]Base");
    await expect(before).toBeVisible();
    await expect.poll(() => before.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(500);
    const selected = page.locator(".ts-preview-selected .channel-tree-pill");
    await expect(selected).toHaveAttribute("data-kind", "spacer");
    await expect(
      page
        .getByRole("list", { name: "Channels" })
        .getByRole("button", { name: "[spacer]Base" })
        .locator("img.layer-thumb"),
    ).toBeVisible();
    await expect(page.getByText("Spacer base image", { exact: true })).toBeVisible();
    await expect(page.getByText("The spacer base image")).toBeVisible();
  });

  test("F-142-32: with 40 channels the crop, the edited preview row and the layer row are on screen together", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Measured at 1440 x 900 in the desktop project.",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("about:blank");
    const { channels, banners } = longTreeChannels(40);
    await mockApi(page, { channels, images: await fixtureImages(page, banners) });
    await page.goto("/?channel=135");
    await loadImage(page);
    const inView = (box: { y: number; height: number } | null) =>
      box !== null && box.y >= 0 && box.y + box.height <= 900;
    const stage = page.locator(".preview-box");
    const row = page.locator(".ts-preview-selected .channel-tree-pill");
    const layer = page
      .getByRole("list", { name: "Channels" })
      .getByRole("button", { name: "Channel 36" });
    await expect(layer).toHaveAttribute("aria-current", "true");
    await expect.poll(async () => inView(await row.boundingBox())).toBe(true);
    await expect.poll(async () => inView(await layer.boundingBox())).toBe(true);
    expect(inView(await stage.boundingBox())).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // The preview keeps the whole tree in its own bounded scroll area.
    await expect(page.locator(".ts-preview-selected")).toHaveCount(1);
    expect(await page.locator(".ts-preview .channel-tree-row").count()).toBe(40);
    const scroller = (await page.locator(".ts-preview-scroll").boundingBox())!;
    expect(scroller.height).toBeLessThanOrEqual(360);
  });

  test("F-142-34: W = 5 is not applied, Save waits, and leaving the field clamps it", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    await combobox(page).selectOption("43");
    await loadImage(page);
    const width = page.getByRole("textbox", { name: "Width" });
    const save = page.getByRole("button", { name: "Crop & send image" });
    await width.fill("5");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    await width.blur();
    await expect(width).toHaveValue("500");
    await expect(page.getByRole("textbox", { name: "Height" })).toHaveValue("44");
    await expect(save).toBeEnabled();
    // The frame on screen is real (not 0 px high).
    const frame = (await page.locator(".preview-box .cropper-crop-box").boundingBox())!;
    expect(frame.height).toBeGreaterThan(5);
  });

  test("F-142-35: Before and After are 250 x 22 at every desktop width", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Desktop widths in the desktop project.");
    await mockApi(page);
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await combobox(page).selectOption("43");
      await loadImage(page);
      const strips = [page.getByText("No banner yet"), page.getByAltText("New banner of General")];
      for (const strip of strips) {
        const box = (await strip.boundingBox())!;
        expect(Math.abs(box.width - 250), `width at ${width} px`).toBeLessThanOrEqual(1);
        expect(Math.abs(box.height - 22), `height at ${width} px`).toBeLessThanOrEqual(1);
      }
    }
  });
});

// T-142-F5 (Critic r5, F-142-36): zooming in past the minimum frame never starts
// a crop-correction loop; the readout, the numbers and the preview stay true.
test.describe("zoom limit (T-142-F5)", () => {
  async function source(page: Page, width: number, height: number) {
    return Buffer.from(
      await page.evaluate(
        ({ width, height }) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const c = canvas.getContext("2d")!;
          const g = c.createLinearGradient(0, 0, width, height);
          g.addColorStop(0, "hsl(250 30% 20%)");
          g.addColorStop(1, "hsl(30 40% 60%)");
          c.fillStyle = g;
          c.fillRect(0, 0, width, height);
          for (let x = 0; x < width; x += 50) {
            c.fillStyle = `hsl(${x % 360} 40% 50%)`;
            c.fillRect(x, height / 3, 20, height / 3);
          }
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { width, height },
      ),
      "base64",
    );
  }

  async function load(page: Page, width: number, height: number) {
    const api = await mockApi(page);
    await page.goto("/");
    await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
    await page.locator("#file-upload").setInputFiles({
      name: `source-${width}.png`,
      mimeType: "image/png",
      buffer: await source(page, width, height),
    });
    await expect(page.getByRole("button", { name: "Fit to screen", exact: true })).toBeEnabled();
    // Count Cropper's crop events on the image from now on.
    await page.evaluate(() => {
      const w = window as unknown as { cropEvents: number };
      w.cropEvents = 0;
      document.querySelector("#preview")!.addEventListener("crop", () => w.cropEvents++);
    });
    return api;
  }

  /** Idle for 2 s: no crop events, the readout is the real zoom, preview bytes = sent bytes. */
  async function expectSettled(page: Page, api: Awaited<ReturnType<typeof mockApi>>) {
    await page.waitForTimeout(300);
    await page.evaluate(() => ((window as unknown as { cropEvents: number }).cropEvents = 0));
    await page.waitForTimeout(2000);
    expect(
      await page.evaluate(() => (window as unknown as { cropEvents: number }).cropEvents),
      "crop events while idle",
    ).toBe(0);
    const real = await page.evaluate(() => {
      const canvas = document.querySelector(".preview-box .cropper-canvas")!;
      const image = document.querySelector<HTMLImageElement>("#preview")!;
      return Math.round((canvas.getBoundingClientRect().width / image.naturalWidth) * 100);
    });
    expect(parseInt((await page.getByLabel("Zoom level").textContent())!, 10)).toBe(real);
    // The frame covers at least 500 source px (or the whole narrower image).
    const width = Number(await page.getByRole("textbox", { name: "Width" }).inputValue());
    const natural = await page.evaluate(
      () => document.querySelector<HTMLImageElement>("#preview")!.naturalWidth,
    );
    expect(width).toBeGreaterThanOrEqual(Math.min(500, natural));
    const preview = (await page.getByAltText("New banner of General").getAttribute("src"))!;
    await page.getByRole("button", { name: "Crop & send image" }).click();
    await expect.poll(() => api.uploads.length).toBe(1);
    expect(api.uploads[0].png.equals(Buffer.from(preview.split(",")[1], "base64"))).toBe(true);
  }

  test("a 500 x 44 source and one Zoom in: no loop, the preview is what is sent", async ({
    page,
  }) => {
    const api = await load(page, 500, 44);
    const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
    // The fitted 500 px image is already at the limit: Zoom in is refused.
    if (await zoomIn.isEnabled()) await zoomIn.click();
    await expectSettled(page, api);
    await expect(zoomIn).toBeDisabled();
  });

  test("a 1600 px source zoomed to the limit by the button", async ({ page }) => {
    const api = await load(page, 1600, 600);
    const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
    for (let i = 0; i < 30 && (await zoomIn.isEnabled()); i++) await zoomIn.click();
    await expectSettled(page, api);
    await expect(zoomIn).toBeDisabled();
  });

  test("a 1600 px source zoomed past the limit by the wheel", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "No wheel on the touch project.");
    const api = await load(page, 1600, 600);
    const box = (await page.locator(".preview-box").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(30);
    }
    await expectSettled(page, api);
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
  });
});
