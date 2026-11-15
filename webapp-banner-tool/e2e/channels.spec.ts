// Manage channel images (route "/channels"). Owned by T-142 part (b).
import { expect, test } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import { DESTRUCTIVE_VERBS } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

test("gallery keeps equal names distinct by CID and supports native keyboard upload and delete", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/channels");
  await expect(page.locator(".channel-row")).toHaveCount(2);
  const second = page.locator(".channel-row").filter({ hasText: "Channel #43" });
  await second.locator("input[type=file]").focus();
  await expect(second.locator("input[type=file]")).toBeFocused();
  await second
    .locator("input[type=file]")
    .setInputFiles({ name: "image.png", mimeType: "image/png", buffer: await sourcePng(page) });
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  await expect(second.getByRole("img", { name: "General" })).toBeVisible();
  await expect(
    page
      .locator(".channel-row")
      .filter({ hasText: "Channel #42" })
      .getByRole("button", { name: "Remove" }),
  ).toBeDisabled();
  await page.getByLabel("Image status").selectOption("own");
  await expect(page.locator(".channel-row")).toHaveCount(1);
  await second.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(page.locator(".channel-row")).toHaveCount(0);
  await page.getByLabel("Image status").selectOption("all");
  await page.getByLabel("Search channels").fill("absent");
  await expect(page.getByText("No channels match these filters.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

// T-142 items 8 and 18 on every reachable state of /channels.
for (const state of ["ready", "empty", "loading", "error"] as const) {
  test(`channels (${state}) meets the hit target and the prominent rule`, async ({ page }) => {
    await mockApi(page, { state });
    await page.goto("/channels");
    await expect(
      page.getByRole("heading", { level: 1, name: "Manage channel images" }),
    ).toBeVisible();
    if (state === "ready") await expect(page.locator(".channel-row")).toHaveCount(2);
    if (state === "empty")
      await expect(page.locator("#main-content").getByText("No channels found.")).toBeVisible();
    if (state === "loading") await expect(page.getByText("Loading…")).toBeVisible();
    if (state === "error")
      await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
    await expectHitTargets(page);
    await expectProminentRule(page, [...DESTRUCTIVE_VERBS, "Delete"]);
  });
}
