// Banner URLs (route "/banner-urls"): concept D2's filter bar, table and
// inspector (T-142-F3 item 10, D-142F-37).
import { expect, test, type Page } from "@playwright/test";
import { mockApi, screenshotChannels, type ApiState, type MockChannel } from "./fixtures/api";
import { SCREEN_ROUTES } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

const route = SCREEN_ROUTES.find((screen) => screen.path === "/banner-urls")!;

const inspector = (page: Page) => page.getByRole("complementary", { name: "Inspector" });
const rows = (page: Page) => page.locator(".banner-urls-row");

/** The screenshot tree: every managed channel carries its banner URL. */
function treeWithUrls(): MockChannel[] {
  return screenshotChannels().channels;
}

async function openRoute(page: Page, state: ApiState, ready: () => Promise<void>) {
  await mockApi(page, {
    state,
    channels: state === "ready" ? treeWithUrls() : undefined,
  });
  await page.goto(route.path);
  // The page title is visually hidden (the active mode names the page).
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeAttached();
  await ready();
}

async function expectRouteRules(page: Page) {
  await expectNoHorizontalOverflow(page);
  await expectHitTargets(page);
  await expectProminentRule(page, route.destructiveVerbs);
}

test("Banner URLs page renders without horizontal overflow", async ({ page }) => {
  await mockApi(page);
  await page.goto(route.path);
  await expect(page.getByRole("heading", { level: 1, name: "Channel banner URLs" })).toBeAttached();
  await expectNoHorizontalOverflow(page);
});

test("loaded state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "ready", async () => {
    await expect(rows(page)).toHaveCount(7);
  });
  await expect(page.locator('[data-variant="prominent"]:visible')).toHaveText(
    "Set for all channels",
  );
  await expectRouteRules(page);
});

test("the filter, the count and the inspector follow the fixture tree", async ({ page }) => {
  await openRoute(page, "ready", async () => {
    await expect(rows(page)).toHaveCount(7);
  });
  const count = page.locator(".ds-filter-bar").getByRole("status");
  await expect(count).toHaveText("7 of 7 channels · 5 managed");

  await page.getByRole("radio", { name: "Not managed" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(count).toHaveText("2 of 7 channels · 5 managed");
  // The selection follows the filter to the first visible row.
  await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(inspector(page).getByRole("heading", { name: "Squad 2" })).toBeVisible();

  await page.getByRole("radio", { name: "Managed", exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await page.getByRole("searchbox", { name: "Filter channels" }).fill("hyt");
  await expect(rows(page)).toHaveCount(1);
  await expect(count).toHaveText("1 of 7 channels · 5 managed");
  await expect(inspector(page).getByRole("heading", { name: "Hytale" })).toBeVisible();
  await expect(inspector(page).getByText("Gaming Area / Hytale")).toBeVisible();
  await expect(inspector(page).getByText("https://icons.example.net/banner/13.png")).toBeVisible();

  // A channel without a URL: plain text, not monospace.
  await page.getByRole("searchbox", { name: "Filter channels" }).fill("");
  await page.getByRole("radio", { name: "All" }).click();
  const lobby = page.locator('.banner-urls-row[data-cid="16"]');
  await lobby.locator(".banner-urls-name").click();
  await expect(inspector(page).getByRole("heading", { name: "Lobby" })).toBeVisible();
  await expect(lobby).toContainText("No banner URL set");
  const family = await lobby
    .getByText("No banner URL set")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).not.toMatch(/mono|consolas|menlo/i);
  await expect(page.locator('.banner-urls-row[data-cid="10"]')).toContainText("Spacer");
});

test("Set banner URL works from a row and from the inspector", async ({ page }) => {
  const patched: string[] = [];
  await mockApi(page, { channels: treeWithUrls() });
  await page.route("**/channels/*/banner-url", (request) => {
    patched.push(
      request
        .request()
        .url()
        .match(/channels\/(\d+)\//)?.[1] ?? "",
    );
    return request.fulfill({ json: { message: "ok" } });
  });
  await page.goto(route.path);
  await expect(rows(page)).toHaveCount(7);

  await page.getByRole("button", { name: "Set banner URL for Lobby" }).click();
  await expect.poll(() => patched).toEqual(["16"]);
  await expect(page.getByRole("status").filter({ hasText: "Banner URL updated." })).toBeVisible();

  await page.locator('.banner-urls-row[data-cid="15"] .banner-urls-name').click();
  await inspector(page).getByRole("button", { name: "Set banner URL", exact: true }).click();
  await expect.poll(() => patched).toEqual(["16", "15"]);
});

test("Set for all channels asks for confirmation first", async ({ page }) => {
  let applied = 0;
  await mockApi(page, { channels: treeWithUrls() });
  await page.route("**/channels/apply-banner-urls", (request) => {
    applied++;
    return request.fulfill({ json: { updated: ["15", "16"], alreadyManaged: ["10"] } });
  });
  await page.goto(route.path);
  await expect(rows(page)).toHaveCount(7);

  await page.getByRole("button", { name: "Set for all channels" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Set managed banner URLs for 2 channel(s)?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(applied).toBe(0);

  await page.getByRole("button", { name: "Set for all channels" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Set URLs" }).click();
  await expect.poll(() => applied).toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Updated 2 channel(s); 1 already correct." }),
  ).toBeVisible();
});

test("empty state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "empty", async () => {
    await expect(page.locator("#main-content").getByText("No channels found.")).toBeVisible();
  });
  await expectRouteRules(page);
});

test("loading state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "loading", async () => {
    await expect(page.getByText("Loading channels…")).toBeVisible();
  });
  await expectRouteRules(page);
});

test("error state meets the hit-target and prominent rules", async ({ page }) => {
  await openRoute(page, "error", async () => {
    await expect(page.locator("#main-content").getByRole("alert")).toBeVisible();
  });
  await expectRouteRules(page);
});
