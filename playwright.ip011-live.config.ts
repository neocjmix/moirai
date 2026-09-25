import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  testMatch: "ip011-a3.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "test-results/ip011-a3-live",
  use: {
    baseURL: "https://moirai-production-8ed1.up.railway.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "iphone-14", use: { ...devices["iPhone 14"] } }]
});
