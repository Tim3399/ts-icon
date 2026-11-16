import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TS_ICON_E2E_PORT ?? 5178);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("TS_ICON_E2E_PORT must be an integer between 1024 and 65535");
}
const baseURL = `http://127.0.0.1:${port}`;

// The opt-in "screenshots" project (T-142 item 22) runs only when selected
// with --project=screenshots (npm run test:screenshots); the default
// `npm run test:e2e` does not include it. It needs SCREENSHOT_DIR.
const SCREENSHOTS = "screenshots";
const args = process.argv.slice(2);
// Workers reload this file without the CLI arguments; the flag set here is
// inherited by them through the environment.
const wantsScreenshots =
  process.env.TS_ICON_SCREENSHOTS_SELECTED === "1" ||
  args.some(
    (arg, i) =>
      arg === `--project=${SCREENSHOTS}` || (arg === "--project" && args[i + 1] === SCREENSHOTS),
  );
if (wantsScreenshots) process.env.TS_ICON_SCREENSHOTS_SELECTED = "1";
if (wantsScreenshots && !process.env.SCREENSHOT_DIR) {
  throw new Error(
    "The screenshots project needs SCREENSHOT_DIR, the directory the screenshots are written to.",
  );
}
const SCREENSHOT_SPEC = /screenshots\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: SCREENSHOT_SPEC,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: SCREENSHOT_SPEC,
      use: { ...devices["iPhone SE"], defaultBrowserType: "chromium" },
    },
    {
      name: "tablet",
      testIgnore: SCREENSHOT_SPEC,
      use: { viewport: { width: 768, height: 1024 } },
    },
    // Same CSS viewport and device-pixel ratio as 1280×900 at 200% browser zoom.
    {
      name: "zoom-layout",
      testIgnore: SCREENSHOT_SPEC,
      use: { viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 },
    },
    ...(wantsScreenshots
      ? [{ name: SCREENSHOTS, testMatch: SCREENSHOT_SPEC, use: { ...devices["Desktop Chrome"] } }]
      : []),
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_KEYCLOAK_ENABLED: "false",
      VITE_PUBLIC_API_URL: "http://127.0.0.1:3000",
      VITE_ADMIN_API_URL: "http://127.0.0.1:3001",
    },
  },
});
