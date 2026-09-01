import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
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
      "@moirai/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@moirai/domain": fileURLToPath(
        new URL("./packages/domain/src/index.ts", import.meta.url)
      ),
      "@moirai/projections": fileURLToPath(
        new URL("./packages/projections/src/index.ts", import.meta.url)
      ),
      "@moirai/publication": fileURLToPath(
        new URL("./packages/publication/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "skills/**/*.test.ts"
    ],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"]
    }
  }
});
