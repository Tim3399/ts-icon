import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.TS_ICON_E2E_PORT ?? 5178);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("TS_ICON_E2E_PORT must be an integer between 1024 and 65535");
}
const baseURL = `http://127.0.0.1:${port}`;

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
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone SE"], defaultBrowserType: "chromium" } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    // Same CSS viewport and device-pixel ratio as 1280×900 at 200% browser zoom.
    { name: "zoom-layout", use: { viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 } },
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
