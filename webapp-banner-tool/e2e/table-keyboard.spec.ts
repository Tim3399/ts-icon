// T-142-F4 item 6 (F-142-33): table rows on Channel images and Banner URLs are
// selectable by keyboard alone, including the second of two equally named
// channels, and that channel's "Remove…" is reachable (D-142F-42).
import { expect, test, type Page } from "@playwright/test";
import { edgeCaseChannels, fixtureImages, mockApi, sourcePng } from "./fixtures/api";
import { tabTo } from "./helpers/assertions";

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });

test("Tab and Enter select the second 'Squad 1' and remove its image, not the first one's", async ({
  page,
}) => {
  const { channels, banners } = edgeCaseChannels();
  // Both "Squad 1" channels get an image, so either could be removed by mistake.
  for (const channel of channels)
    if (channel.name === "Squad 1") Object.assign(channel, { hasImage: true, size: 4_096 });
  const images = await fixtureImages(page, banners);
  const png = await sourcePng(page);
  images.set("22", png);
  images.set("23", png);
  const api = await mockApi(page, { channels, images });
  await page.goto("/channels");

  const squads = page.getByRole("row", { name: /^Squad 1, #/ });
  await expect(squads).toHaveCount(2);
  const second = page.getByRole("row", { name: "Squad 1, #23" });
  await tabTo(page, second);
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row", { name: "Squad 1, #22" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(inspector(page).getByText("#23")).toBeVisible();

  const remove = inspector(page).getByRole("button", { name: "Remove…" });
  await tabTo(page, remove);
  await page.keyboard.press("Enter");
  // The dialog starts on Cancel; Tab reaches the destructive confirm button.
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Remove" });
  await tabTo(page, confirm);
  await page.keyboard.press("Enter");
  await expect.poll(() => api.deleted).toEqual(["23"]);
  // The mock records the DELETE before it answers; the answer then reloads the
  // channels, which replaces the table with the loading tile and back. A row
  // focused before that is gone, and Space lands on the body (D-V0120F3-1).
  // The count shows only once the reload is done, with one image fewer.
  const withImage = channels.filter((channel) => channel.hasImage).length;
  await expect(page.getByText(new RegExp(` · ${withImage} with an image$`))).toBeVisible();

  // Space selects as well: back to the first "Squad 1".
  const first = page.getByRole("row", { name: "Squad 1, #22" });
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(inspector(page).getByText("#22")).toBeVisible();
});

test("Banner URLs rows are selectable by keyboard", async ({ page }) => {
  const { channels } = edgeCaseChannels();
  await mockApi(page, { channels });
  await page.goto("/banner-urls");
  const second = page.getByRole("row", { name: "Squad 1, #23" });
  await expect(second).toBeVisible();
  await expect(second).toHaveAttribute("aria-selected", "false");
  await tabTo(page, second);
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(inspector(page).getByText("#23")).toBeVisible();
  await expect(inspector(page).getByText("Lounge / Squad 1")).toBeVisible();
});
