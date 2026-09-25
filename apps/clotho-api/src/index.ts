import { assertV5DeploymentReady, buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { runA3Acceptance } from "./a3-acceptance.js";

const config = loadConfig(process.env);
await assertV5DeploymentReady(config);
if (process.env.CLOTHO_A3_ACCEPTANCE) await runA3Acceptance(process.env);
const app = buildApp(config);

await app.listen({ host: "0.0.0.0", port: config.port });
