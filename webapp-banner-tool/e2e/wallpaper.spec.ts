// Channel Wallpaper (route "/wallpaper"). Owned by T-142 part (d); starts as a smoke test.
import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

test("Channel Wallpaper page renders without horizontal overflow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/wallpaper");
  await expect(
    page.getByRole("heading", { level: 1, name: "Channel wallpaper generator" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
