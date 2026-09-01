import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@moirai/persistence": fileURLToPath(
        new URL("./packages/persistence/src/index.ts", import.meta.url)
      ),
      "@moirai/projections": fileURLToPath(
        new URL("./packages/projections/src/index.ts", import.meta.url)
      ),
      "@moirai/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@moirai/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    fileParallelism: false,
    include: ["**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
