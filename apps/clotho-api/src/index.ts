import { assertV5DeploymentReady, buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig(process.env);
await assertV5DeploymentReady(config);
const app = buildApp(config);

await app.listen({ host: "0.0.0.0", port: config.port });
