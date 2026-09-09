import { spawnSync } from "node:child_process";
import type { ClothoMethod } from "../packages/contracts/src/index.js";

const expectedSha = process.env.EXPECTED_COMMIT_SHA ?? "";
const apiUrl = process.env.CLOTHO_API_URL ?? "";
const publicUrl = process.env.PUBLIC_INTEGRATION_URL ?? "";
if (
  !/^[a-f0-9]{40}$/.test(expectedSha) ||
  !apiUrl ||
  !publicUrl ||
  !process.env.CLOTHO_TOKEN
)
  throw new Error("Clotho smoke configuration is incomplete");

function call<T>(method: ClothoMethod, input: unknown): T {
  const result = spawnSync(
    process.execPath,
    ["skills/clotho/dist/cli.js", method],
    {
      input: JSON.stringify(input),
      encoding: "utf8",
      timeout: 35_000,
      maxBuffer: 4_194_304
    }
  );
  if (result.status !== 0) throw new Error(`Clotho ${method} failed`);
  return (JSON.parse(result.stdout) as { result: T }).result;
}

async function mcp<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(new URL("/mcp", apiUrl), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${process.env.CLOTHO_TOKEN}`
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok)
    throw new Error(`MCP smoke request failed (${response.status})`);
  const body = (await response.json()) as {
    error?: unknown;
    result: T & { isError?: boolean };
  };
  if (body.error || body.result.isError)
    throw new Error("MCP smoke operation failed");
  return body.result;
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health/ready", apiUrl), {
        signal: AbortSignal.timeout(10_000)
      });
      const health = (await response.json()) as {
        commit_sha: string;
        status: string;
        service: string;
      };
      if (
        response.ok &&
        health.status === "ok" &&
        health.service === "clotho-api" &&
        health.commit_sha === expectedSha
      )
        return;
    } catch {
      // Deployment convergence is bounded by the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("Clotho deployment timed out");
}

await waitForReady();
for (const path of ["/v1/clotho/world.list", "/mcp"]) {
  const response = await fetch(new URL(path, apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000)
  });
  if (response.status !== 401)
    throw new Error(`Unauthenticated access was not rejected: ${path}`);
}
await mcp("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "moirai-production-smoke", version: "1" }
});
const tools = await mcp<{ tools: { name: string }[] }>("tools/list", {});
if (!tools.tools.some((tool) => tool.name === "change_commit"))
  throw new Error("MCP tool discovery failed");
call("world.list", {});
const publicHealth = await fetch(new URL("/health", publicUrl), {
  signal: AbortSignal.timeout(10_000)
});
if (!publicHealth.ok) throw new Error("Atropos health check failed");
process.stdout.write(`production read/auth smoke passed; sha=${expectedSha}\n`);
