// V-0.12.0-F4 (D-27): after a change on Channel images or Banner URLs the
// table stays on screen while the data reloads (no loading tile, quietly
// aria-busy), and the keyboard focus lands on a defined element, never on
// <body> or a disabled button. Runs in all four projects.
import { expect, test, type Page } from "@playwright/test";
import { fixtureImages, mockApi, type MockChannel } from "./fixtures/api";

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const loadingTile = (page: Page) => page.getByText("Loading channels…");

function channels(): MockChannel[] {
  return [
    { cid: "42", name: "Lobby", pid: null, depth: 0, hasImage: true, managed: true, size: 4_096 },
    { cid: "43", name: "Squad", pid: "42", depth: 1, hasImage: true, managed: false, size: 4_096 },
    { cid: "44", name: "Quiet", pid: null, depth: 0, hasImage: false, managed: false },
  ];
}

/**
 * From now on every channel-list request (GET channels, GET banner-urls)
 * waits until `release()`. Register it after the first load.
 */
async function holdChannelLists(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const held: string[] = [];
  await page.route(/\/images-local\/channels(\/banner-urls)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    held.push(route.request().url());
    await gate;
    return route.fallback();
  });
  return { release: () => release(), held };
}

/** The banner URL writes the shared mock does not answer: PATCH one, POST all. */
async function mockBannerWrites(page: Page, items: MockChannel[]) {
  await page.route(/\/images-local\/channels\/(\d+)\/banner-url$/, (route) => {
    const cid = route
      .request()
      .url()
      .match(/channels\/(\d+)\/banner-url/)![1];
    Object.assign(items.find((item) => item.cid === cid)!, { managed: true });
    return route.fulfill({ json: { message: "Banner URL updated" } });
  });
  await page.route(/\/images-local\/channels\/apply-banner-urls$/, (route) => {
    const pending = items.filter((item) => !item.managed);
    for (const item of pending) item.managed = true;
    return route.fulfill({
      json: { updated: pending.map((item) => item.cid), alreadyManaged: [] },
    });
  });
}

async function openChannelImages(page: Page) {
  const items = channels();
  const images = await fixtureImages(page, ["42", "43"]);
  const api = await mockApi(page, { channels: items, images });
  await page.goto("/channels");
  const table = page.getByRole("table", { name: "Channels" });
  await expect(page.getByRole("row", { name: "Squad, #43" })).toBeVisible();
  return { api, table };
}

test.describe("Channel images", () => {
  test("Remove keeps the rows during the reload and focuses the selected row", async ({ page }) => {
    const { api, table } = await openChannelImages(page);
    const squad = page.getByRole("row", { name: "Squad, #43" });
    await squad.getByText("Squad", { exact: true }).click();
    await expect(squad).toHaveAttribute("aria-selected", "true");
    const hold = await holdChannelLists(page);

    const remove = inspector(page).getByRole("button", { name: "Remove…" });
    await remove.focus();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Remove" });
    await confirm.focus();
    await page.keyboard.press("Enter");

    // Focus on the removed channel's row, which stays selected.
    await expect(squad).toBeFocused();
    await expect(squad).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => api.deleted).toEqual(["43"]);
    // The reload is held: the rows stay, the table is busy, no loading tile.
    await expect.poll(() => hold.held.length).toBeGreaterThan(0);
    await expect(table).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("row", { name: /, #4\d$/ })).toHaveCount(3);
    await expect(loadingTile(page)).toHaveCount(0);
    await expect(squad).toBeFocused();

    hold.release();
    await expect(table).not.toHaveAttribute("aria-busy");
    await expect(loadingTile(page)).toHaveCount(0);
    await expect(squad).toBeFocused();
    await expect(squad).toHaveAttribute("aria-selected", "true");
    await expect(inspector(page).getByText("#43")).toBeVisible();
    await expect(remove).toBeDisabled();
    // Space still selects a row by keyboard.
    const lobby = page.getByRole("row", { name: "Lobby, #42" });
    await lobby.focus();
    await page.keyboard.press("Space");
    await expect(lobby).toHaveAttribute("aria-selected", "true");
  });

  test("Cancel returns the focus to Remove…", async ({ page }) => {
    const { api } = await openChannelImages(page);
    const remove = inspector(page).getByRole("button", { name: "Remove…" });
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(remove).toBeFocused();
    await expect(remove).toBeEnabled();
    expect(api.deleted).toEqual([]);
  });

  test("a removed row that leaves the filter hands the focus to the table", async ({ page }) => {
    const { table } = await openChannelImages(page);
    await page.getByRole("radio", { name: "With image" }).click();
    const squad = page.getByRole("row", { name: "Squad, #43" });
    await squad.getByText("Squad", { exact: true }).click();
    await inspector(page).getByRole("button", { name: "Remove…" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).focus();
    await page.keyboard.press("Enter");
    await expect(squad).toHaveCount(0);
    await expect(table).toBeFocused();
  });

  test("an upload from the inspector keeps the focus on its button and the rows on screen", async ({
    page,
  }) => {
    const { api, table } = await openChannelImages(page);
    const quiet = page.getByRole("row", { name: "Quiet, #44" });
    await quiet.getByText("Quiet", { exact: true }).click();
    const hold = await holdChannelLists(page);
    const upload = inspector(page).getByLabel("Upload image of Quiet");
    await upload.focus();
    const png = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 400;
      canvas.getContext("2d")!.fillRect(0, 0, 1000, 400);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await upload.setInputFiles({
      name: "quiet.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await expect.poll(() => api.uploads.map((u) => u.cid)).toEqual(["44"]);
    await expect.poll(() => hold.held.length).toBeGreaterThan(0);
    await expect(table).toHaveAttribute("aria-busy", "true");
    await expect(loadingTile(page)).toHaveCount(0);
    await expect(quiet).toBeVisible();
    // The busy file button is aria-disabled, not disabled: it keeps the focus.
    const busy = inspector(page).locator("input[type=file]").first();
    await expect(busy).toBeFocused();
    await expect(busy).toHaveAttribute("aria-disabled", "true");
    hold.release();
    await expect(table).not.toHaveAttribute("aria-busy");
    const replace = inspector(page).getByLabel("Replace image of Quiet");
    await expect(replace).toBeFocused();
    await expect(replace).not.toHaveAttribute("aria-disabled");
  });
});

test.describe("Banner URLs", () => {
  async function openBannerUrls(page: Page) {
    const items = channels();
    await mockApi(page, { channels: items });
    await mockBannerWrites(page, items);
    await page.goto("/banner-urls");
    const table = page.getByRole("table", { name: "Channel banner URLs" });
    await expect(page.getByRole("row", { name: "Squad, #43" })).toBeVisible();
    return table;
  }

  test("Set banner URL keeps the rows during the reload and the focus on its button", async ({
    page,
  }) => {
    const table = await openBannerUrls(page);
    const squad = page.getByRole("row", { name: "Squad, #43" });
    await squad.getByText("Squad", { exact: true }).click();
    const hold = await holdChannelLists(page);
    const set = inspector(page).getByRole("button", { name: "Set banner URL" });
    await set.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => hold.held.length).toBeGreaterThan(0);
    await expect(table).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".banner-urls-row")).toHaveCount(3);
    await expect(loadingTile(page)).toHaveCount(0);
    // aria-disabled while busy: the pressed button keeps the focus.
    const busy = inspector(page).getByRole("button", { name: "Setting…" });
    await expect(busy).toBeFocused();
    await expect(busy).toHaveAttribute("aria-disabled", "true");

    hold.release();
    await expect(table).not.toHaveAttribute("aria-busy");
    await expect(set).toBeFocused();
    await expect(set).not.toHaveAttribute("aria-disabled");
    await expect(squad).toHaveAttribute("aria-selected", "true");
    await expect(inspector(page).getByText("Managed", { exact: true })).toBeVisible();
  });

  test("Set for all channels returns the focus to its button and keeps the rows", async ({
    page,
  }) => {
    const table = await openBannerUrls(page);
    const hold = await holdChannelLists(page);
    const setAll = page.getByRole("button", { name: "Set for all channels" });
    await setAll.focus();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Set URLs" });
    await confirm.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect.poll(() => hold.held.length).toBeGreaterThan(0);
    await expect(table).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".banner-urls-row")).toHaveCount(3);
    await expect(loadingTile(page)).toHaveCount(0);
    const busy = page.getByRole("button", { name: "Applying…" });
    await expect(busy).toBeFocused();
    await expect(busy).toHaveAttribute("aria-disabled", "true");

    hold.release();
    await expect(table).not.toHaveAttribute("aria-busy");
    await expect(setAll).toBeFocused();
    await expect(page.getByText("Updated 2 channel(s); 0 already correct.")).toBeVisible();
  });

  test("a set row that leaves the 'Not managed' filter hands the focus to the table", async ({
    page,
  }) => {
    const table = await openBannerUrls(page);
    await page.getByRole("radio", { name: "Not managed" }).click();
    const set = page.getByRole("button", { name: "Set banner URL for Quiet" });
    await set.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("row", { name: "Quiet, #44" })).toHaveCount(0);
    await expect(table).toBeFocused();
  });
});
