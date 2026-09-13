import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const root = process.env.IP004_SCALE_READ_DIR;
const scale = Number(process.env.IP004_BROWSER_SCALE);
if (
  !root ||
  !/^\/tmp\/moirai-ip004-scale-[a-zA-Z0-9]+$/.test(root) ||
  ![100, 1000, 10000].includes(scale)
)
  throw Error("generated_ip004_fixture_required");
const server = base.webServer as {
  command: string;
  url: string;
  timeout: number;
};
const prepare =
  "node --import tsx scripts/prepare-temporal-publication-fixture.ts && ";
const environment =
  "LOCAL_PUBLICATION_FIXTURE_DIR=/tmp/moirai-temporal-publication-fixture";
if (!server.command.includes(prepare) || !server.command.includes(environment))
  throw Error("base_fixture_command_changed");
export default defineConfig({
  ...base,
  testMatch: "ip004-reader-scale.spec.ts",
  workers: 1,
  retries: 0,
  expect: { timeout: 30000 },
  webServer: {
    ...server,
    reuseExistingServer: false,
    timeout: 180000,
    command: server.command
      .replace(prepare, "")
      .replace(
        environment,
        `LOCAL_PUBLICATION_FIXTURE_DIR=${root} LOCAL_PUBLICATION_FIXTURE_WORLD_ID=019f60ac-${scale.toString(16).padStart(4, "0")}-7000-8000-000000000001`
      )
  }
});
