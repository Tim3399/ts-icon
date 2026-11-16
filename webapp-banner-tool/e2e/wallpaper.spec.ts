// Channel Wallpaper (route "/wallpaper"), T-142 part (d), a D2 Studio page since D-142F-38. Every state of the
// route is checked for hit targets (item 8) and the prominent-button rule
// (item 18, screen table: "Generate channels" is the prominent action; "Undo",
// "Discard" are destructive).
import { expect, test, type Page } from "@playwright/test";
import { bannerPng, mockApi } from "./fixtures/api";
import { DESTRUCTIVE_VERBS, SCREEN_ROUTES } from "./fixtures/routes";
import {
  expectHitTargets,
  expectNoHorizontalOverflow,
  expectProminentRule,
} from "./helpers/assertions";

const ADMIN_API = "http://127.0.0.1:3001";
const ROUTE = SCREEN_ROUTES.find((route) => route.path === "/wallpaper")!;
const DESTRUCTIVE = [...DESTRUCTIVE_VERBS, ...ROUTE.destructiveVerbs];

const RUNS = [
  {
    runId: "run-pending",
    requestId: "r1",
    status: "pending",
    createdChannels: [],
    rowCount: 3,
    createdAt: "2026-11-14T10:00:00.000Z",
  },
  {
    runId: "run-done",
    requestId: "r2",
    status: "completed",
    createdChannels: [
      { cid: "21", name: "Wallpaper 1", kind: "art", depth: 0 },
      { cid: "22", name: "Wallpaper 2", kind: "spacer", depth: 0 },
    ],
    rowCount: 2,
    createdAt: "2026-11-14T11:00:00.000Z",
  },
  {
    runId: "run-failed",
    requestId: "r3",
    status: "partial-failure",
    createdChannels: [{ cid: "31", name: "Wallpaper 1", kind: "art", depth: 0 }],
    rowCount: 4,
    failedAt: { name: "Wallpaper 2", error: "Channel limit reached" },
    createdAt: "2026-11-14T12:00:00.000Z",
  },
];

interface WallpaperMock {
  runs?: typeof RUNS;
  runsFail?: boolean;
  previewFail?: boolean;
}

async function mockWallpaper(page: Page, options: WallpaperMock = {}) {
  await mockApi(page);
  const png = await bannerPng(page, 200);
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  await page.route(`${ADMIN_API}/images-local/channel-wallpaper/runs`, (route) =>
    options.runsFail
      ? route.fulfill({ status: 500, json: { message: "Recent operations are unavailable." } })
      : route.fulfill({ json: { runs: options.runs ?? [] } }),
  );
  await page.route(`${ADMIN_API}/images-local/channel-wallpaper/preview`, (route) =>
    options.previewFail
      ? route.fulfill({ status: 500, json: { message: "The preview service is down." } })
      : route.fulfill({
          json: {
            rows: [
              { depth: 0, isSpacer: false, imageDataUrl: dataUrl },
              { depth: 1, isSpacer: false, imageDataUrl: dataUrl },
              { depth: 0, isSpacer: true, imageDataUrl: dataUrl },
            ],
          },
        }),
  );
}

async function open(page: Page) {
  await page.goto(ROUTE.path);
  await expect(page.getByRole("heading", { level: 1, name: ROUTE.heading })).toBeVisible();
}

async function addSource(page: Page) {
  await page.getByLabel("Image URL").fill("https://example.com/wallpaper.png");
}

/**
 * Hit targets, prominent rule and overflow for the state on screen.
 */
async function expectDesignRules(page: Page) {
  await expectHitTargets(page);
  await expectProminentRule(page, DESTRUCTIVE);
  await expectNoHorizontalOverflow(page);
}

test("Channel Wallpaper page renders without horizontal overflow", async ({ page }) => {
  await mockWallpaper(page);
  await open(page);
  await expectNoHorizontalOverflow(page);
});

test("empty state meets the design rules", async ({ page }) => {
  await mockWallpaper(page);
  await open(page);
  await expect(page.getByText("No source image yet")).toBeVisible();
  await expect(page.getByText("No operations yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate channels" })).toBeDisabled();
  await expectDesignRules(page);
});

test("loaded state (preview and operations) meets the design rules", async ({ page }) => {
  await mockWallpaper(page, { runs: RUNS });
  await open(page);
  await addSource(page);
  await expect(page.getByAltText("channel row").first()).toBeVisible();
  await expect(page.getByText("3 rows")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate channels" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Resume generation" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Undo this generation" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Discard operation" })).toHaveCount(1);
  await expectDesignRules(page);
});

test("advanced options open, validate and meet the design rules", async ({ page }) => {
  await mockWallpaper(page);
  await open(page);
  const toggle = page.getByRole("button", { name: "Advanced options" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Background color (#RRGGBBAA)").fill("nope");
  await expect(
    page.getByText("Use a background color such as #00000000 or #FFFFFF."),
  ).toBeVisible();
  await expect(page.getByLabel("Background color (#RRGGBBAA)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("button", { name: "Review highlighted fields" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Cover-fit mode/ })).toBeChecked();
  await expectDesignRules(page);
});

test("error states (preview and operations) meet the design rules", async ({ page }) => {
  await mockWallpaper(page, { previewFail: true, runsFail: true });
  await open(page);
  await addSource(page);
  // A 5xx answer is shown with the generic server message, once per failed request.
  await expect(
    page.locator("#main-content").getByRole("alert").filter({
      hasText: "The server could not finish this action.",
    }),
  ).toHaveCount(2);
  await expectDesignRules(page);
});

test("Undo asks for confirmation in a dialog, and Cancel keeps the run", async ({ page }) => {
  await mockWallpaper(page, { runs: RUNS });
  await open(page);
  await page.getByRole("button", { name: "Undo this generation" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete channels" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Undo this generation" })).toHaveCount(2);
});

test("the prominent button is Generate channels, never an Undo or Discard action", async ({
  page,
}) => {
  await mockWallpaper(page, { runs: RUNS });
  await open(page);
  await addSource(page);
  await expect(page.getByAltText("channel row").first()).toBeVisible();
  const prominent = page.locator('[data-variant="prominent"]:visible');
  await expect(prominent).toHaveCount(1);
  await expect(prominent).toHaveText("Generate channels");
  for (const name of ["Undo this generation", "Discard operation"])
    await expect(page.getByRole("button", { name }).first()).toHaveAttribute(
      "data-destructive",
      "",
    );
});

// D-142F-38: the rows to create are TS6 pills at the real geometry, and the
// parent picker in the inspector uses the same row height (shared ChannelTreeRow).
test("dock pills are 456 × 30 at 1440 px and the picker rows match their height", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Geometry is measured in the desktop project.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWallpaper(page);
  await open(page);
  await addSource(page);
  const dock = page.getByRole("list", { name: "Generated rows" });
  const dockRows = dock.locator(".channel-tree-row");
  await expect(dockRows).toHaveCount(3);
  const pill = (await dock.locator(".channel-tree-pill").first().boundingBox())!;
  expect(Math.round(pill.width)).toBe(456);
  expect(Math.round(pill.height)).toBe(30);
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const picker = inspector.getByRole("group", { name: "Parent channel" });
  await expect(picker).toBeVisible();
  const pickerRows = picker.locator(".channel-tree-row");
  expect(await pickerRows.count()).toBeGreaterThan(0);
  const dockRow = (await dockRows.first().boundingBox())!;
  const pickerRow = (await pickerRows.first().boundingBox())!;
  expect(Math.abs(pickerRow.height - dockRow.height)).toBeLessThanOrEqual(1);
  const pickerPill = (await picker.locator(".channel-tree-pill").first().boundingBox())!;
  expect(Math.abs(pickerPill.height - pill.height)).toBeLessThanOrEqual(1);
});
