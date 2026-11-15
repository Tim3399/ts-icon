// Banner URLs (route "/banner-urls"). Owned by T-142 part (c); starts as a smoke test.
import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

test("Banner URLs page renders without horizontal overflow", async ({ page }) => {
  await mockApi(page);
  await page.goto("/banner-urls");
  await expect(page.getByRole("heading", { level: 1, name: "Channel banner URLs" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
