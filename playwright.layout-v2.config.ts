import { defineConfig, devices } from "@playwright/test";

// Local synthetic regression. Actual public World acceptance uses
// playwright.layout-v2-overlay.config.ts with an explicitly pinned scope.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "layout-v2.spec.ts",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  use: {
    actionTimeout: 15_000,
    baseURL: "http://127.0.0.1:3200",
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
  webServer: {
    command:
      "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-layout-v2-fixture corepack pnpm exec tsx scripts/prepare-temporal-publication-fixture.ts && LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-layout-v2-fixture LOCAL_PUBLICATION_FIXTURE_WORLD_ID=019f3b00-0000-7000-8000-000000000a01 corepack pnpm --filter @moirai/atropos-web dev --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
