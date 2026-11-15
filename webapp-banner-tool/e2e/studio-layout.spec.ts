// T-142-F3 R2 and R7: the Studio breakpoints. Desktop project, five widths, on
// the Banner editor and Channel images:
// - from 1240 px the layer panel is a side panel; 1024-1239 px it is a drawer
//   behind a top-bar toggle (aria-expanded, aria-controls, Escape closes it
//   and focus returns to the toggle);
// - no horizontal page overflow at any of the widths;
// - the mode labels are visible from 1240 px and icon-only below (the label
//   stays the accessible name and the tooltip).
import { expect, test, type Page } from "@playwright/test";
import { fixtureImages, mockApi, screenshotChannels } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

const WIDTHS = [1024, 1239, 1240, 1280, 1440];
const CROP_STAGE_MIN = 500;
const PREVIEW_ROW = 488; // 456 px pill + 2 x 16 px padding (R2)
const PICKER_MIN = 280;
const NAME_MIN = 80;
const ROUTES = [
  { path: "/", heading: "Create a channel banner" },
  { path: "/channels", heading: "Manage channel images" },
];

async function open(page: Page, width: number, path: string, heading: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("about:blank");
  const { channels, banners } = screenshotChannels();
  await mockApi(page, { channels, images: await fixtureImages(page, banners) });
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "desktop", "The Studio widths run in the desktop project.");
});

for (const width of WIDTHS) {
  const wide = width >= 1240;

  for (const route of ROUTES) {
    test(`${width} px ${route.path}: no horizontal overflow, mode labels ${wide ? "visible" : "icon-only"}`, async ({
      page,
    }) => {
      await open(page, width, route.path, route.heading);
      await expectNoHorizontalOverflow(page);
      const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
      const count = await links.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        const label = link.locator(".ds-mode-label");
        const name = (await label.textContent())?.trim() ?? "";
        expect(name).not.toBe("");
        await expect(link).toHaveAccessibleName(name);
        await expect(link).toHaveAttribute("title", name);
        if (wide) await expect(label).toBeVisible();
        else {
          // Visually hidden: a 1 x 1 px clip, so the link shows its icon only.
          const box = (await label.boundingBox())!;
          expect(box.width).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  test(`${width} px: the layer panel is ${wide ? "a side panel" : "a drawer"}`, async ({
    page,
  }) => {
    await open(page, width, "/", "Create a channel banner");
    const layers = page.locator("#studio-layers");
    const main = page.locator("#main-content");
    if (wide) {
      await expect(layers).toBeVisible();
      await expect(page.getByRole("button", { name: /layers$/ })).toHaveCount(0);
      const [l, m] = [(await layers.boundingBox())!, (await main.boundingBox())!];
      expect(l.x + l.width).toBeLessThanOrEqual(m.x + 1);
      return;
    }
    const toggle = page.getByRole("button", { name: "Show layers" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "studio-layers");
    await expect(layers).toHaveAttribute("inert", "");
    await expect(layers).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    const hide = page.getByRole("button", { name: "Hide layers" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await expect(layers).toBeVisible();
    await expect(layers).not.toHaveAttribute("inert");
    // An overlay: it does not take width from the main region.
    const m = (await main.boundingBox())!;
    expect(m.x).toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    const shown = page.getByRole("button", { name: "Show layers" });
    await expect(shown).toHaveAttribute("aria-expanded", "false");
    await expect(shown).toBeFocused();
    await expect(layers).toHaveAttribute("inert", "");
    await expectNoHorizontalOverflow(page);
  });

  test(`${width} px: the crop stage keeps 500 px and the 1:1 preview row fits`, async ({
    page,
  }) => {
    await open(page, width, "/", "Create a channel banner");
    const stage = page.getByTestId("crop-stage");
    expect((await stage.boundingBox())!.width).toBeGreaterThanOrEqual(CROP_STAGE_MIN);
    const preview = page.getByRole("region", { name: "Preview in TeamSpeak" });
    expect((await preview.boundingBox())!.width).toBeGreaterThanOrEqual(PREVIEW_ROW);
  });

  test(`${width} px: the wallpaper parent picker and the channel names have room`, async ({
    page,
  }) => {
    await open(page, width, "/wallpaper", "Channel wallpaper generator");
    const picker = page.getByRole("group", { name: "Parent channel" });
    await expect(picker).toBeVisible();
    expect((await picker.boundingBox())!.width).toBeGreaterThanOrEqual(PICKER_MIN);
    const names = picker.locator('.channel-tree-pill:not([data-kind="spacer"]) .channel-tree-name');
    expect(await names.count()).toBeGreaterThan(0);
    for (const name of await names.all()) {
      expect((await name.innerText()).trim(), "channel name is empty").not.toBe("");
      expect(
        (await name.boundingBox())!.width,
        "channel name is narrower than 80 px",
      ).toBeGreaterThanOrEqual(NAME_MIN);
    }
  });
}

// D-142F-36: from 1240 px the layer panel and the inspector fill the workspace
// height as in D2; their bottom is the viewport bottom with the page at scroll 0.
for (const width of [1240, 1440]) {
  for (const route of ROUTES) {
    test(`${width} px ${route.path}: the side panels reach the bottom of the viewport`, async ({
      page,
    }) => {
      await open(page, width, route.path, route.heading);
      await page.evaluate(() => window.scrollTo(0, 0));
      const viewport = page.viewportSize()!;
      const regions = [page.locator(".ds-studio-inspector")];
      if (route.path === "/") regions.push(page.locator("#studio-layers"));
      for (const region of regions) {
        await expect(region).toBeVisible();
        const box = (await region.boundingBox())!;
        expect(
          Math.abs(box.y + box.height - viewport.height),
          "panel bottom vs viewport bottom",
        ).toBeLessThanOrEqual(1);
      }
    });
  }
}
