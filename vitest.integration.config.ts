import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@moirai/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@moirai/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
