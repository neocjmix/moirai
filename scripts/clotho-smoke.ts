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
const worldId = "01995c2a-7b00-7000-8000-000000000101";
const sharedEventId = "019f5b00-0000-7000-8000-000000000115";
const status = await fetch(new URL("/status-public", publicUrl), {
  signal: AbortSignal.timeout(10_000)
});
if (!status.ok) throw Error("Atropos public status unavailable");
const publicStatus = (await status.json()) as {
  versions: { contract: string };
};
if (publicStatus.versions.contract === "5") {
  async function authenticated<T>(
    path: string,
    body: unknown
  ): Promise<{
    status: number;
    body: T;
  }> {
    const response = await fetch(new URL(path, apiUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CLOTHO_TOKEN}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
    return { status: response.status, body: (await response.json()) as T };
  }
  for (const path of ["/v2/clotho/change.commit", "/mcp"]) {
    const response = await fetch(new URL(path, apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status !== 401)
      throw Error(`Unauthenticated v5 access was not rejected: ${path}`);
  }
  const old = await fetch(new URL("/v1/clotho/change.commit", apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000)
  });
  if (old.status !== 404) throw Error("Old writer route remains registered");
  const policy = await authenticated<{
    contract_version: number;
    result: { policy_version: string; policy_digest: string };
  }>("/v2/clotho/authoring.policy.get", {
    world_id: worldId,
    contract_version: 5
  });
  if (
    policy.status !== 200 ||
    policy.body.contract_version !== 5 ||
    !/^[0-9a-f]{64}$/.test(policy.body.result.policy_digest)
  )
    throw Error("Authenticated v5 policy read failed");
  const pointer = await fetch(
    new URL(`/worlds/${worldId}/current.json`, publicUrl),
    {
      signal: AbortSignal.timeout(10_000)
    }
  );
  if (!pointer.ok) throw Error("V5 pointer unavailable");
  const served = (await pointer.json()) as { served_revision: number };
  const search = await authenticated<{
    contract_version: number;
    result: { events: { id: string }[] };
  }>("/v2/clotho/event.search", {
    world_id: worldId,
    contract_version: 5,
    text: "계유정난",
    limit: 10
  });
  const detail = await authenticated<{
    contract_version: number;
    result: { event: { id: string }; narrative: { body: string } };
  }>("/v2/clotho/event.get", {
    world_id: worldId,
    contract_version: 5,
    event_id: sharedEventId,
    at_revision: served.served_revision
  });
  if (
    search.status !== 200 ||
    search.body.contract_version !== 5 ||
    !search.body.result.events.some((event) => event.id === sharedEventId) ||
    detail.status !== 200 ||
    detail.body.contract_version !== 5 ||
    detail.body.result.event.id !== sharedEventId ||
    !detail.body.result.narrative.body
  )
    throw Error("Authenticated v5 World Event read failed");
  const stale = await authenticated<{ error?: { code: string } }>(
    "/v2/clotho/change.commit",
    {
      contract_version: 5,
      change_set_id: "01996a80-0000-7000-8000-000000000003",
      world_id: worldId,
      expected_revision: served.served_revision,
      intent: "IP-011 A3 stale policy rejection probe",
      origins: [
        {
          kind: "human_instruction",
          summary: "Authorized A3 smoke probe; must reject"
        }
      ],
      policy_version: policy.body.result.policy_version,
      policy_digest: "0".repeat(64),
      operations: [
        {
          kind: "withdraw",
          entity_type: "collection",
          entity_id: "019f5b00-0000-7000-8000-000000000002",
          origin_refs: [{ field: "*", origin_index: 0 }]
        }
      ]
    }
  );
  if (
    stale.status !== 422 ||
    stale.body.error?.code !== "authoring_policy_mismatch"
  )
    throw Error("Authenticated stale policy was not rejected");
  await mcp("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "moirai-production-smoke", version: "5" }
  });
  const discovered = await mcp<{ tools: { name: string }[] }>("tools/list", {});
  if (
    ![
      "authoring_policy_get",
      "change_commit",
      "event_search",
      "event_get"
    ].every((name) => discovered.tools.some((tool) => tool.name === name))
  )
    throw Error("V5 MCP tool discovery failed");
  process.stdout.write(
    `production v5 read/auth/policy smoke passed; sha=${expectedSha}\n`
  );
  process.exit(0);
}
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
