import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";

export default defineConfig({
  ...baseline,
  testDir: "./tests/continuity",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { ...baseline.use, baseURL: "http://127.0.0.1:3100" },
  webServer: {
    ...baseline.webServer,
    command: (baseline.webServer as { command: string }).command
      .replace(
        "node --import tsx scripts/prepare-temporal-publication-fixture.ts",
        "IP012_RENDER_FIXTURE=1 LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-render-continuity-fixture node --import tsx scripts/prepare-temporal-publication-fixture.ts"
      )
      .replace(
        "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-temporal-publication-fixture",
        "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-render-continuity-fixture"
      )
      .replace(
        "next start --hostname 127.0.0.1",
        "next start --hostname 127.0.0.1 --port 3100"
      ),
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
