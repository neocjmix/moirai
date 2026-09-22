import { defineConfig, devices } from "@playwright/test";

// Read-only acceptance against the user-authorized public Moirai deployment.
// Separate from deterministic fixture tests; no credentials or writes.
export default defineConfig({
  testDir: "./tests/live",
  testMatch: "imjin.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: "list",
  outputDir: "test-results/imjin-live",
  use: {
    baseURL: "https://moirai-production-8ed1.up.railway.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "iphone-14", use: { ...devices["iPhone 14"] } },
    {
      name: "desktop-webkit",
      use: { browserName: "webkit", viewport: { width: 1440, height: 1000 } }
    }
  ]
});
