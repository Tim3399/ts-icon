// Manage channel images (route "/channels"). Owned by T-142 part (b).
import { expect, test } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

test("gallery keeps equal names distinct by CID and supports native keyboard upload and delete", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/channels");
  await expect(page.locator(".channel-card")).toHaveCount(2);
  const second = page.locator(".channel-card").filter({ hasText: "Channel #43" });
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
      .locator(".channel-card")
      .filter({ hasText: "Channel #42" })
      .getByRole("button", { name: "Delete image" }),
  ).toBeDisabled();
  await page.getByLabel("Image status").selectOption("own");
  await expect(page.locator(".channel-card")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await second.getByRole("button", { name: "Delete image" }).click();
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(page.locator(".channel-card")).toHaveCount(0);
  await page.getByLabel("Image status").selectOption("all");
  await page.getByLabel("Search channels").fill("absent");
  await expect(page.getByText("No channels match these filters.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
