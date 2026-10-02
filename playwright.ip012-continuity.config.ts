import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";

const prepareFixture =
  "IP012_RENDER_FIXTURE=1 LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-render-continuity-fixture node --import tsx scripts/prepare-temporal-publication-fixture.ts";
const startServer =
  "cd apps/atropos-web && LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-render-continuity-fixture ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3100";
// CI has already compiled the packages and Next app for the preceding mobile
// suite. Reuse that build, but generate a separate actual compiler-v4 fixture.
const command =
  process.env.IP012_CONTINUITY_REUSE_BUILD === "1"
    ? `${prepareFixture} && ${startServer}`
    : (baseline.webServer as { command: string }).command
        .replace(
          "node --import tsx scripts/prepare-temporal-publication-fixture.ts",
          prepareFixture
        )
        .replace(
          "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-temporal-publication-fixture",
          "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-render-continuity-fixture"
        )
        .replace(
          "next start --hostname 127.0.0.1",
          "next start --hostname 127.0.0.1 --port 3100"
        );

export default defineConfig({
  ...baseline,
  testDir: "./tests/continuity",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  outputDir: "test-results/ip012-continuity",
  use: {
    ...baseline.use,
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure"
  },
  webServer: {
    ...baseline.webServer,
    command,
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
