import { expect, test, type Locator, type Page } from "@playwright/test";

async function sourcePng(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 400;
      const context = canvas.getContext("2d")!;
      const gradient = context.createLinearGradient(0, 0, 1000, 400);
      gradient.addColorStop(0, "#eb4034");
      gradient.addColorStop(1, "#346eeb");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1000, 400);
      context.fillStyle = "#ffffff";
      context.fillRect(300, 80, 200, 100);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
}

async function mockApi(page: Page) {
  const uploads: { cid: string; png: Buffer }[] = [];
  const deleted: string[] = [];
  const images = new Map<string, Buffer>();
  const items = [
    { cid: "42", name: "General", pid: null, depth: 0, hasImage: false, managed: true },
    { cid: "43", name: "General", pid: "42", depth: 1, hasImage: false, managed: true },
  ];
  await page.route("http://127.0.0.1:3000/images/**", async (route) => {
    const cid = new URL(route.request().url()).pathname.match(/by-id\/(\d+)\.png/)?.[1];
    const png = images.get(cid || "");
    await route.fulfill(
      png ? { status: 200, contentType: "image/png", body: png } : { status: 404 },
    );
  });
  await page.route("http://127.0.0.1:3001/images-local/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/channels/banner-urls"))
      return route.fulfill({ json: { channels: items } });
    if (pathname.endsWith("/channels"))
      return route.fulfill({ json: { channels: items.map((item) => item.name), items } });
    if (pathname.endsWith("/spacer-base-image")) return route.fulfill({ status: 404 });
    const cid = pathname.match(/channels\/(\d+)\/image/)?.[1];
    if (cid && request.method() === "POST") {
      const payload = request.postDataBuffer()!;
      const start = payload.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const end = payload.indexOf(Buffer.from("IEND"), start) + 8;
      expect(start).toBeGreaterThanOrEqual(0);
      const png = payload.subarray(start, end);
      images.set(cid, png);
      uploads.push({ cid, png });
      items.find((item) => item.cid === cid)!.hasImage = true;
      return route.fulfill({ json: { message: "Image saved successfully" } });
    }
    if (cid && request.method() === "DELETE") {
      images.delete(cid);
      deleted.push(cid);
      items.find((item) => item.cid === cid)!.hasImage = false;
      return route.fulfill({ json: { message: "Image deleted" } });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked request: ${pathname}` } });
  });
  return { uploads, deleted };
}

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
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

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
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("unknown route offers a usable recovery path", async ({ page }) => {
  await mockApi(page);
  await page.goto("/missing-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Create a banner" }).click();
  await expect(page.getByRole("heading", { name: "Create a channel banner" })).toBeVisible();
});

async function tabTo(page: Page, control: Locator) {
  for (let i = 0; i < 50; i++) {
    if (await control.evaluate((node) => node === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(control, "Control must be reachable with Tab alone").toBeFocused();
}

test("banner creation, gallery navigation and deletion work using Tab and keyboard activation", async ({
  page,
}, testInfo) => {
  const api = await mockApi(page);
  await page.goto("/");
  const channel = page.getByRole("combobox", { name: "Channel", exact: true });
  await expect(channel).toBeEnabled();
  await tabTo(page, channel);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(channel).toHaveValue("43");

  await tabTo(page, page.locator("#file-upload"));
  const picker = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  // Supply only the OS picker result; opening it and all web controls use the keyboard.
  await (await picker).setFiles({
    name: "gradient.png",
    mimeType: "image/png",
    buffer: await sourcePng(page),
  });
  const zoom = page.getByRole("button", { name: "Zoom in", exact: true });
  await expect(zoom).toBeEnabled();
  await tabTo(page, zoom);
  await page.keyboard.press("Space");
  const save = page.getByRole("button", { name: "Crop & send image" });
  await tabTo(page, save);
  await page.keyboard.press("Enter");
  await expect.poll(() => api.uploads.length).toBe(1);
  expect(api.uploads[0].cid).toBe("43");
  expect(api.uploads[0].png.readUInt32BE(16)).toBe(500);
  expect(api.uploads[0].png.readUInt32BE(20)).toBe(44);
  await expect(page.getByAltText("Saved banner for General")).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("saved-banner.png"), fullPage: true });

  await tabTo(page, page.getByRole("link", { name: "Manage channel images" }));
  await page.keyboard.press("Enter");
  await expect(page.locator(".channel-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Manage channel images" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const status = page.getByLabel("Image status");
  await tabTo(page, status);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(status).toHaveValue("own");
  await expect(page.locator(".channel-card")).toHaveCount(1);
  const remove = page.locator(".channel-card").getByRole("button", { name: "Delete image" });
  await tabTo(page, remove);
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect.poll(() => api.deleted).toEqual(["43"]);
  await expect(page.locator(".channel-card")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
