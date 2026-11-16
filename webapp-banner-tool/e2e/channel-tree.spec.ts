// Channel tree rows (the editor's TeamSpeak preview and the wallpaper parent picker; the
// editor's live tree is its layer panel since D-142F-33). Owned by T-142 part (e);
// covers the row look of item 17 with the TS6 geometry of T-142-F1 addendum 4 in
// both uses: 30 px pill rows, the banner covering the pill with no fade, spacer =
// banner-only pill, group = left bold label over the banner, indented
// sub-channels, no chevron.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixtureImages, mockApi, screenshotChannels, type ApiState } from "./fixtures/api";
import { DESTRUCTIVE_VERBS, SCREEN_ROUTES } from "./fixtures/routes";
import { expectHitTargets, expectProminentRule } from "./helpers/assertions";

const THEMES = ["dark", "light"] as const;

async function setUp(page: Page, theme: (typeof THEMES)[number] = "dark", state?: ApiState) {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto("about:blank");
  const { channels, banners } = screenshotChannels();
  const images = await fixtureImages(page, banners);
  await mockApi(page, { channels, images, state });
}

// D-142F-33: the editor's live tree is the layer panel (compact rows, GET channels, R4); the
// TS6 row look on "/" lives in the dock's TeamSpeak preview.
const previewTree = (page: Page) => page.getByRole("figure", { name: "Preview in TeamSpeak" });
const layerPanel = (page: Page) => page.getByRole("list", { name: "Channels" });
const picker = (page: Page) => page.getByRole("group", { name: "Parent channel" });

const pillOf = (tree: Locator, name: string) =>
  tree.locator(".channel-tree-pill").filter({ hasText: name });

/** The row look checks, shared by both uses of the component. */
async function expectRowLook(tree: Locator) {
  const pills = tree.locator(".channel-tree-pill");
  await expect(tree.locator(".channel-tree-banner").first()).toBeVisible();
  await expect
    .poll(() =>
      tree
        .locator(".channel-tree-banner")
        .evaluateAll(
          (images) => images.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length,
        ),
    )
    .toBe(4); // spacer, group and two channels have a banner; the 404 of "Squad 1" stays empty

  // A managed channel without an image answers 404: no broken-image box is shown.
  await expect(pillOf(tree, "Squad 1").locator(".channel-tree-banner")).toBeHidden();

  // Pill rows: rounded, on a surface that differs from the panel behind them.
  const look = await pills.first().evaluate((el) => {
    const style = getComputedStyle(el);
    const panel = getComputedStyle(el.closest(".channel-tree, .ts-preview")!);
    return {
      radius: parseFloat(style.borderTopLeftRadius),
      background: style.backgroundColor,
      panel: panel.backgroundColor,
    };
  });
  expect(look.radius).toBeGreaterThan(0);
  expect(look.background).not.toBe(look.panel);

  // Channel rows: the channel icon on the left, the name in medium weight.
  const channel = pillOf(tree, "Counter-Strike");
  await expect(channel).toHaveAttribute("data-kind", "channel");
  await expect(channel.locator(".channel-tree-icon svg")).toHaveCount(1);
  await expect(channel.locator(".channel-tree-name")).toHaveCSS("font-weight", "600");

  // TS6 look (D-142F-4): the banner covers the whole pill with no fade, the name sits on top.
  expect(await channel.evaluate((el) => getComputedStyle(el, "::after").backgroundImage)).toBe(
    "none",
  );
  const [channelBox, channelBanner] = await Promise.all([
    channel.boundingBox(),
    channel.locator(".channel-tree-banner").boundingBox(),
  ]);
  expect(channelBanner!.width).toBeGreaterThanOrEqual(channelBox!.width - 2);
  expect(Math.abs(channelBox!.height - 30)).toBeLessThanOrEqual(1); // TS6 pill height
  expect(
    await channel
      .locator(".channel-tree-content, .channel-tree-button")
      .evaluate((el) => getComputedStyle(el).zIndex),
  ).toBe("1");

  // Spacer: a banner-only pill with no visible label (the name stays for assistive technology).
  const spacer = tree.locator('.channel-tree-pill[data-kind="spacer"]');
  await expect(spacer).toHaveCount(1);
  await expect(spacer.locator(".channel-tree-icon, .channel-tree-badge")).toHaveCount(0);
  expect((await spacer.locator(".channel-tree-name").boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(spacer.locator(".channel-tree-name")).toHaveText("[spacer]Top");
  const [spacerBox, spacerBanner] = await Promise.all([
    spacer.boundingBox(),
    spacer.locator(".channel-tree-banner").boundingBox(),
  ]);
  expect(spacerBanner!.width).toBeGreaterThanOrEqual(spacerBox!.width * 0.95);

  // Group: a left-aligned bold label over the banner.
  // Banner channels with sub-channels are groups ("Gaming Area" and "Hytale").
  await expect(tree.locator('.channel-tree-pill[data-kind="group"]')).toHaveCount(2);
  const group = pillOf(tree, "Gaming Area");
  await expect(group).toHaveAttribute("data-kind", "group");
  const label = group.locator(".channel-tree-name");
  await expect(label).toHaveText("Gaming Area");
  await expect(label).toHaveCSS("font-weight", "700");
  const [groupBox, labelBox] = await Promise.all([group.boundingBox(), label.boundingBox()]);
  expect(labelBox!.x - groupBox!.x).toBeLessThan(groupBox!.width / 4);
  await expect(group.locator(".channel-tree-icon")).toHaveCount(0);

  // Sub-channels are indented by their depth.
  const left = async (name: string) => (await pillOf(tree, name).boundingBox())!.x;
  const [top, sub, nested] = await Promise.all([
    left("Gaming Area"),
    left("Hytale"),
    left("Squad 1"),
  ]);
  expect(sub).toBeGreaterThan(top);
  expect(nested).toBeGreaterThan(sub);

  // No chevron: nothing in the tree collapses or expands.
  await expect(tree.locator("[aria-expanded]")).toHaveCount(0);
  await expect(tree.locator("svg")).toHaveCount(await tree.locator(".channel-tree-icon").count());
}

for (const theme of THEMES) {
  test(`the editor's TeamSpeak preview shows the pill rows (${theme})`, async ({ page }) => {
    await setUp(page, theme);
    await page.goto("/");
    const tree = previewTree(page);
    await tree.scrollIntoViewIfNeeded();
    await expectRowLook(tree);
    await expect(tree.locator("button")).toHaveCount(0); // not selectable in the preview
  });

  test(`wallpaper parent picker shows the same rows and selects (${theme})`, async ({ page }) => {
    await setUp(page, theme);
    await page.goto("/wallpaper");
    const tree = picker(page);
    await tree.scrollIntoViewIfNeeded();
    await expectRowLook(tree);

    const topLevel = tree.getByRole("button", { name: "Top-level (no parent)" });
    const row = tree.getByRole("button", { name: /Counter-Strike/ });
    await expect(topLevel).toHaveAttribute("aria-pressed", "true");
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(topLevel).toHaveAttribute("aria-pressed", "false");
    await expect(pillOf(tree, "Counter-Strike")).toHaveAttribute("data-selected", "true");
    await expect(pillOf(tree, "Hytale")).toHaveAttribute("data-selected", "false");
  });
}

test("the layer panel lists the channel tree", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(layerPanel(page).getByRole("button")).toHaveCount(2);
});

test("pill rows are not wider than the picker and do not overflow", async ({ page }) => {
  await setUp(page);
  await page.goto("/wallpaper");
  const tree = picker(page).locator(".channel-tree");
  await expect(tree.locator(".channel-tree-pill").first()).toBeVisible();
  const overflow = await tree
    .locator(".channel-tree-scroll")
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Items 8 and 18 for the tree on the routes that show it: every state that is
// reachable (loaded, empty, error). The scope is the tree itself; the rest of
// each page is checked by its own part.
for (const state of ["ready", "empty", "error"] as const) {
  for (const path of ["/", "/wallpaper"]) {
    test(`hit targets and prominent rule with the tree ${state} on ${path}`, async ({ page }) => {
      await setUp(page, "dark", state);
      await page.goto(path);
      const route = SCREEN_ROUTES.find((r) => r.path === path)!;
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      // On "/" the live tree is the layer panel (#studio-layers, D-142F-33).
      const scope = path === "/" ? "#studio-layers" : '[aria-label="Parent channel"]';
      const tree = path === "/" ? ".layers" : ".channel-tree";
      const row = path === "/" ? ".layer-row" : ".channel-tree-pill";
      await expect(page.locator(`${scope} ${tree}`)).toBeVisible();
      if (state === "ready") await expect(page.locator(`${scope} ${row}`).first()).toBeVisible();
      if (state === "empty")
        await expect(page.locator(`${scope}`).getByText("No channels found.")).toBeVisible();
      await expectHitTargets(page, { within: scope });
      await expectProminentRule(page, [...DESTRUCTIVE_VERBS, ...route.destructiveVerbs]);
    });
  }
}

// T-142-F2 item 3: a banner never draws outside its row, whatever its aspect
// ratio. Banners without text, so a shot of this view cannot be misread.
async function oddBanner(page: Page, width: number, height: number, hue: number) {
  return Buffer.from(
    await page.evaluate(
      ({ width, height, hue }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const c = canvas.getContext("2d")!;
        const g = c.createLinearGradient(0, 0, width, height);
        g.addColorStop(0, `hsl(${hue} 35% 30%)`);
        g.addColorStop(1, `hsl(${hue + 40} 35% 55%)`);
        c.fillStyle = g;
        c.fillRect(0, 0, width, height);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { width, height, hue },
    ),
    "base64",
  );
}

/** Each visible banner's drawn area (clipped by its clipping ancestors) vs. its pill and row. */
async function bannerEscapes(tree: Locator) {
  return tree.evaluate((root) => {
    const out: string[] = [];
    const within = (inner: DOMRect, outer: DOMRect) =>
      inner.left >= outer.left - 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.bottom <= outer.bottom + 0.5;
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>(".channel-tree-banner"))) {
      if (!img.checkVisibility() || !img.naturalWidth) continue;
      const row = img.closest("li")!;
      const pill = img.closest(".channel-tree-pill")!;
      let { left, top, right, bottom } = img.getBoundingClientRect();
      for (let el = img.parentElement; el && el !== row.parentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible" && cs.clipPath === "none") continue;
        const box = el.getBoundingClientRect();
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
      }
      const drawn = new DOMRect(left, top, right - left, bottom - top);
      const name = row.textContent?.trim();
      if (!within(drawn, pill.getBoundingClientRect())) out.push(`${name}: outside its pill`);
      if (!within(drawn, row.getBoundingClientRect())) out.push(`${name}: outside its row`);
      const pillStyle = getComputedStyle(pill);
      if (pillStyle.overflow !== "hidden" || pillStyle.clipPath === "none")
        out.push(`${name}: pill does not clip (${pillStyle.overflow}, ${pillStyle.clipPath})`);
    }
    return out;
  });
}

test.describe("banners stay inside their row (T-142-F2 item 3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("about:blank");
    const { channels } = screenshotChannels();
    const images = new Map([
      ["11", await oddBanner(page, 44, 500, 260)], // very tall
      ["12", await oddBanner(page, 2000, 20, 150)], // very wide
      ["13", await oddBanner(page, 500, 44, 20)], // the banner size
    ]);
    await mockApi(page, { channels, images });
    await page.addInitScript(() => localStorage.setItem("ts-icon-rail-open", "open"));
  });

  test("in the live tree (Wallpaper parent picker)", async ({ page }) => {
    await page.goto("/wallpaper");
    const tree = picker(page).locator(".channel-tree");
    await tree.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        tree
          .locator(".channel-tree-banner")
          .evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth).length),
      )
      .toBe(3);
    expect(await bannerEscapes(tree)).toEqual([]);
  });

  test("in the TeamSpeak preview", async ({ page }) => {
    await page.goto("/?channel=12");
    const preview = page.getByRole("figure", { name: "Preview in TeamSpeak" });
    await expect(preview.locator(".channel-tree-row")).toHaveCount(7); // the whole tree
    await expect
      .poll(() =>
        preview
          .locator(".channel-tree-banner")
          .evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth).length),
      )
      .toBe(3);
    expect(await bannerEscapes(preview)).toEqual([]);
  });
});

// T-142-F2 item 6 (D-11): one row geometry. The Wallpaper parent picker rows
// are the live tree's rows: same height, and a depth-0 pill no wider than the
// TS6 depth-0 width (src/components/teamspeakGeometry.ts).
test("the Wallpaper picker rows have the TeamSpeak preview's geometry", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "Geometry is compared in the desktop project.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await setUp(page);
  // The TS6 rows on "/" are the dock's TeamSpeak preview since D-142F-33 (the
  // editor's live tree is its compact layer panel), so the row is measured there.
  await page.goto("/");
  const liveRow = previewTree(page).locator(".channel-tree-row").filter({ hasText: "Lobby" });
  await expect(liveRow).toBeVisible();
  const l = (await liveRow.boundingBox())!;
  const lp = (await liveRow.locator(".channel-tree-pill").boundingBox())!;
  await page.goto("/wallpaper");
  const pickerRow = picker(page).locator(".channel-tree-row").filter({ hasText: "Lobby" });
  await expect(pickerRow).toBeVisible();
  const p = (await pickerRow.boundingBox())!;
  expect(Math.abs(p.height - l.height)).toBeLessThanOrEqual(1);
  const pp = (await pickerRow.locator(".channel-tree-pill").boundingBox())!;
  expect(Math.abs(pp.height - lp.height)).toBeLessThanOrEqual(1);
  expect(pp.width).toBeLessThanOrEqual(456 + 1); // TS6 depth-0 width
  // The picker keeps its C1 room and its 44 px button around the 30 px pill.
  expect((await picker(page).boundingBox())!.width).toBeGreaterThanOrEqual(280);
  expect((await pickerRow.getByRole("button").boundingBox())!.height).toBeGreaterThanOrEqual(43);
});
