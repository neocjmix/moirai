import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] }
    }
  ],
  webServer: {
    command:
      "./node_modules/.bin/tsc -p packages/contracts/tsconfig.build.json && ./node_modules/.bin/tsc -p packages/domain/tsconfig.build.json && ./node_modules/.bin/tsc -p packages/projections/tsconfig.build.json && ./node_modules/.bin/tsc -p packages/publication/tsconfig.build.json && node --import tsx scripts/prepare-temporal-publication-fixture.ts && cd apps/atropos-web && ./node_modules/.bin/next build && ALLOW_SYNTHETIC_PUBLICATION_FIXTURE=true TEMPORAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-temporal-publication-fixture ./node_modules/.bin/next start --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
