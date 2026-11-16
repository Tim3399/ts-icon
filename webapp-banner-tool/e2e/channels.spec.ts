// Manage channel images (route "/channels"): concept D2's table and inspector
// (T-142-F3 item 9, D-142F-34).
import { expect, test } from "@playwright/test";
import {
  edgeCaseChannels,
  fixtureImages,
  mockApi,
  screenshotChannels,
  sourcePng,
} from "./fixtures/api";
import { DESTRUCTIVE_VERBS } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

const inspector = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "Inspector" });

test("gallery keeps equal names distinct by CID and supports native keyboard upload and delete", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/channels");
  const rows = page.locator(".channel-row");
  await expect(rows).toHaveCount(2);
  const second = page.locator('.channel-row[data-cid="43"]');
  const input = second.locator("input[type=file]");
  await input.focus();
  await expect(input).toBeFocused();
  await input.setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: await sourcePng(page),
  });
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  await expect(second.getByRole("img", { name: "General" })).toBeVisible();

  // The first channel still has no image: its Remove… is disabled.
  await page.locator('.channel-row[data-cid="42"] .channel-name').click();
  await expect(inspector(page).getByRole("button", { name: "Remove…" })).toBeDisabled();

  await page.getByRole("radio", { name: "With image" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "1 of 2 channels" })).toBeVisible();
  // The selection follows the filter to the only visible row.
  await expect(second).toHaveAttribute("aria-selected", "true");
  await inspector(page).getByRole("button", { name: "Remove…" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(rows).toHaveCount(0);
  await page.getByRole("radio", { name: "All" }).click();
  await page.getByRole("searchbox", { name: "Search channels" }).fill("absent");
  await expect(page.getByText("No channels match these filters.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("the filter, the count and the inspector follow the fixture tree", async ({ page }) => {
  const { channels, banners } = screenshotChannels();
  await mockApi(page, { channels, images: await fixtureImages(page, banners) });
  await page.goto("/channels");
  const rows = page.locator(".channel-row");
  await expect(rows).toHaveCount(7);
  const count = page.locator(".ds-filter-bar").getByRole("status");
  await expect(count).toHaveText("7 of 7 channels · 4 with an image");

  await page.getByRole("radio", { name: "Without" }).click();
  await expect(rows).toHaveCount(3);
  await expect(count).toHaveText("3 of 7 channels · 4 with an image");
  await page.getByRole("radio", { name: "With image" }).click();
  await expect(rows).toHaveCount(4);
  await page.getByRole("searchbox", { name: "Search channels" }).fill("hyt");
  await expect(rows).toHaveCount(1);
  await expect(count).toHaveText("1 of 7 channels · 4 with an image");

  // A channel with an image: size, update time and the editor link.
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "Hytale" })).toBeVisible();
  await expect(panel.getByText("19 KB")).toBeVisible();
  await expect(panel.locator("time")).toHaveAttribute("datetime", "2026-11-15T14:02:00Z");
  await expect(panel.getByRole("link", { name: "Open in editor" })).toHaveAttribute(
    "href",
    "/?channel=13",
  );
  // The selected channel is a read-only TS6 pill, drawn as a group (it has sub-channels).
  await expect(panel.locator(".channel-tree-pill")).toHaveAttribute("data-kind", "group");

  // A channel without an image: no size, no update time.
  await page.getByRole("searchbox", { name: "Search channels" }).fill("");
  await page.getByRole("radio", { name: "All" }).click();
  await page.locator('.channel-row[data-cid="16"] .channel-name').click();
  await expect(panel.getByRole("heading", { name: "Lobby" })).toBeVisible();
  await expect(panel.getByText("Size", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("Updated", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Remove…" })).toBeDisabled();
  await expect(page.locator('.channel-row[data-cid="16"]')).toContainText("Not managed");
  await expect(page.locator('.channel-row[data-cid="10"]')).toContainText("Spacer");
});

test("a file dropped on a row replaces that channel's banner", async ({ page }) => {
  const { channels, banners } = screenshotChannels();
  const api = await mockApi(page, { channels, images: await fixtureImages(page, banners) });
  await page.goto("/channels");
  const row = page.locator('.channel-row[data-cid="12"]');
  await expect(row).toBeVisible();
  const png = await sourcePng(page);
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }));
    return data;
  }, Array.from(png));
  await row.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(row).toHaveAttribute("data-drag-over", "true");
  await row.dispatchEvent("drop", { dataTransfer: transfer });
  await expect.poll(() => api.uploads.map((u) => u.cid)).toEqual(["12"]);
});

// T-142-F4 item 1 (F-142-28): a banner that fails to load shows the quiet
// empty tile in the table and the inspector, never a broken-image icon; a
// spacer on the base image still shows the base image.
test("a missing banner shows the empty tile; a spacer shows the base image", async ({ page }) => {
  const { channels, banners } = edgeCaseChannels();
  await mockApi(page, {
    channels,
    images: await fixtureImages(page, banners),
    spacerBase: await sourcePng(page),
  });
  await page.goto("/channels");
  const broken = page.locator('.channel-row[data-cid="20"]');
  await expect(broken.getByText("Banner could not be loaded")).toBeVisible();
  await expect(broken.locator("img")).toHaveCount(0);
  await expect(broken.locator(".channel-thumb-empty")).toHaveText("No image");

  await broken.locator(".channel-name").click();
  const panel = inspector(page);
  await expect(panel.getByRole("heading", { name: "Broken banner" })).toBeVisible();
  await expect(panel.getByText("Banner could not be loaded")).toBeVisible();
  await expect(panel.locator(".channel-tree-pill img")).toHaveCount(0);

  // Every banner image on the page has loaded; none is broken.
  const images = page.locator("#main-content img, .ds-studio-inspector img");
  expect(await images.count()).toBeGreaterThan(0);
  for (const image of await images.all())
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const spacer = page.locator('.channel-row[data-cid="21"]');
  await expect(spacer.getByRole("img", { name: "[spacer]Base" })).toBeVisible();
  await expect(spacer.getByText("Spacer base image")).toBeVisible();
});

// T-142 items 8 and 18 on every reachable state of /channels.
for (const state of ["ready", "empty", "loading", "error"] as const) {
  test(`channels (${state}) meets the hit target and the prominent rule`, async ({ page }) => {
    await mockApi(page, { state });
    await page.goto("/channels");
    await expect(
      page.getByRole("heading", { level: 1, name: "Manage channel images" }),
    ).toBeAttached();
    if (state === "ready") await expect(page.locator(".channel-row")).toHaveCount(2);
    if (state === "empty")
      await expect(page.locator("#main-content").getByText("No channels found.")).toBeVisible();
    if (state === "loading") await expect(page.getByText("Loading channels…")).toBeVisible();
    if (state === "error")
      await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
    await expectHitTargets(page);
    await expectProminentRule(page, [...DESTRUCTIVE_VERBS, "Delete"]);
  });
}
