import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.MOIRAI_OVERLAY_URL ??
  "https://moirai-production-8ed1.up.railway.app";
const local =
  new URL(baseURL).hostname === "127.0.0.1" ||
  new URL(baseURL).hostname === "localhost";
const proxy =
  !local && process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY }
    : undefined;
export default defineConfig({
  testDir: "./tests/live",
  testMatch: "layout-v2-overlay.spec.ts",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/layout-v2-overlay",
  use: {
    actionTimeout: 15_000,
    baseURL,
    proxy,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 14"], defaultBrowserType: "chromium" }
    },
    ...(process.env.MOIRAI_OVERLAY_WEBKIT === "1"
      ? [{ name: "mobile-webkit", use: { ...devices["iPhone 14"] } }]
      : [])
  ]
});
