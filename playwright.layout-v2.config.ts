import { defineConfig, devices } from "@playwright/test";

const publicUrl = process.env.MOIRAI_LAB_URL;
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "layout-v2.spec.ts",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: publicUrl ?? "http://127.0.0.1:3200",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 14"], defaultBrowserType: "chromium" }
    }
  ],
  ...(publicUrl
    ? {}
    : {
        webServer: {
          command:
            "corepack pnpm --filter @moirai/atropos-web dev --hostname 127.0.0.1 --port 3200",
          url: "http://127.0.0.1:3200/labs/layout-v2",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      })
});
