// Banner editor (route "/"). Owned by T-142 part (a).
import { expect, test } from "@playwright/test";
import { mockApi, sourcePng } from "./fixtures/api";
import { expectNoHorizontalOverflow } from "./helpers/assertions";

test("real Cropper exports 500×44 PNG and preserves selected content after resize", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("43");
  await page
    .locator("#file-upload")
    .setInputFiles({ name: "gradient.png", mimeType: "image/png", buffer: await sourcePng(page) });
  const save = page.getByRole("button", { name: "Crop & send image" });
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const down = page.getByRole("button", { name: "Move down", exact: true });
  await down.focus();
  await page.keyboard.press("Space");
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  expect(api.uploads[0].png.readUInt32BE(16)).toBe(500);
  expect(api.uploads[0].png.readUInt32BE(20)).toBe(44);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();
  await page.getByRole("button", { name: "Enlarge view" }).click();
  await expect(page.locator(".preview-box")).toHaveClass(/preview-box-enlarged/);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => api.uploads.length).toBe(2);
  expect(api.uploads[1].png.equals(api.uploads[0].png)).toBe(true);
  await expectNoHorizontalOverflow(page);
});
