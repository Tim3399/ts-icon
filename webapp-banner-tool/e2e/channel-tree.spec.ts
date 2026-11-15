// Channel tree (live panel and wallpaper picker). Owned by T-142 part (e),
// which adds the row-look checks of item 17 here.
import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures/api";

test("live panel lists the channel tree", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const panel = page.getByRole("complementary", { name: "Live channel tree" });
  await expect(panel.locator(".channel-tree-row")).toHaveCount(2);
});
