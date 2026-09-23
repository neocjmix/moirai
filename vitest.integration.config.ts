import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@moirai/domain/v5-operations": fileURLToPath(
        new URL("./packages/domain/src/v5-operations.ts", import.meta.url)
      ),
      "@moirai/domain/v5": fileURLToPath(
        new URL("./packages/domain/src/v5.ts", import.meta.url)
      ),
      "@moirai/contracts/v5": fileURLToPath(
        new URL("./packages/contracts/src/v5.ts", import.meta.url)
      ),
      "@moirai/contracts/v5-wire": fileURLToPath(
        new URL("./packages/contracts/src/v5-wire.ts", import.meta.url)
      ),
      "@moirai/graph-query": fileURLToPath(
        new URL("./packages/graph-query/src/index.ts", import.meta.url)
      ),
      "@moirai/lachesis/database": fileURLToPath(
        new URL("./packages/lachesis/src/database.ts", import.meta.url)
      ),
      "@moirai/lachesis": fileURLToPath(
        new URL("./packages/lachesis/src/index.ts", import.meta.url)
      ),
      "@moirai/clotho-application": fileURLToPath(
        new URL("./packages/clotho-application/src/index.ts", import.meta.url)
      ),
      "@moirai/persistence": fileURLToPath(
        new URL("./packages/persistence/src/index.ts", import.meta.url)
      ),
      "@moirai/projections": fileURLToPath(
        new URL("./packages/projections/src/index.ts", import.meta.url)
      ),
      "@moirai/publication": fileURLToPath(
        new URL("./packages/publication/src/index.ts", import.meta.url)
      ),
      "@moirai/contracts/testing": fileURLToPath(
        new URL("./packages/contracts/src/testing.ts", import.meta.url)
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
