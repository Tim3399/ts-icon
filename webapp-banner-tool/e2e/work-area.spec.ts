// T-142-F1 addendum 3 (C1): with the admin role and the live panel open, the
// shell never squeezes the work area. The live panel moves below the content
// whenever the main column would get narrower than --size-main-min (560 px:
// a 500 px crop stage plus the page padding). Desktop project, five widths.
import { expect, test, type Page } from "@playwright/test";
import { fixtureImages, mockApi, screenshotChannels } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

const WIDTHS = [1024, 1200, 1280, 1366, 1440];
const MAIN_MIN = 560;
const CROP_STAGE_MIN = 500;
const PICKER_MIN = 280;
const NAME_MIN = 80;

const panel = (page: Page) => page.getByRole("complementary", { name: "Live channel tree" });

async function open(page: Page, width: number, path: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("about:blank");
  const { channels, banners } = screenshotChannels();
  await mockApi(page, { channels, images: await fixtureImages(page, banners) });
  await page.addInitScript(() => localStorage.setItem("ts-icon-rail-open", "open"));
  await page.goto(path);
  await expect(panel(page)).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(
    testInfo.project.name !== "desktop",
    "The work-area widths run in the desktop project.",
  );
});

for (const width of WIDTHS) {
  test(`${width} px: the main column keeps its minimum, the panel never squeezes it`, async ({
    page,
  }) => {
    await open(page, width, "/");
    const main = page.locator("#main-content");
    const [m, p] = [(await main.boundingBox())!, (await panel(page).boundingBox())!];
    const beside = p.x >= m.x + m.width - 1;
    // Beside the content the column keeps its minimum; below it, it has the full width.
    if (beside) expect(m.width).toBeGreaterThanOrEqual(MAIN_MIN);
    else expect(p.y).toBeGreaterThanOrEqual(m.y + m.height - 1);
    // Either way the content box fits a 500 px crop stage.
    const content = await main.evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(content).toBeGreaterThanOrEqual(CROP_STAGE_MIN);
    await expectNoHorizontalOverflow(page);
  });

  test(`${width} px: the crop stage is at least 500 px wide`, async ({ page }) => {
    test.fixme(true, "enabled by D-142F-2");
    await open(page, width, "/");
    await page.getByRole("combobox", { name: "Channel", exact: true }).waitFor();
    const stage = page.getByTestId("crop-stage");
    expect((await stage.boundingBox())!.width).toBeGreaterThanOrEqual(CROP_STAGE_MIN);
  });

  test(`${width} px: the wallpaper parent picker and the channel names have room`, async ({
    page,
  }) => {
    test.fixme(true, "enabled in stage B");
    await open(page, width, "/wallpaper");
    const picker = page.getByRole("group", { name: "Parent channel" });
    await expect(picker).toBeVisible();
    expect((await picker.boundingBox())!.width).toBeGreaterThanOrEqual(PICKER_MIN);
    for (const tree of [picker, panel(page)]) {
      const names = tree.locator('.channel-tree-pill:not([data-kind="spacer"]) .channel-tree-name');
      for (const name of await names.all()) {
        expect((await name.innerText()).trim(), "channel name is empty").not.toBe("");
        expect(
          (await name.boundingBox())!.width,
          "channel name is narrower than 80 px",
        ).toBeGreaterThanOrEqual(NAME_MIN);
      }
    }
  });
}
