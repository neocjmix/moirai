import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { assertV5SchemaReady } from "@moirai/persistence/v5";
import { createDatabase } from "@moirai/persistence";

const config = loadConfig(process.env);
if (config.contractMode === "v5" || config.contractMode === "v5-readonly") {
  const preflight = createDatabase(config.databaseUrl);
  try {
    await assertV5SchemaReady(preflight);
  } finally {
    await preflight.destroy();
  }
}
const app = buildApp(config);

await app.listen({ host: "0.0.0.0", port: config.port });
