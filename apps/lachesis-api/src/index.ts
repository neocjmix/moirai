import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
const app = buildApp(config);

await app.listen({ host: "0.0.0.0", port: config.port });
