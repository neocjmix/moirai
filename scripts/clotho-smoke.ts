import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  CONTRACT_VERSION,
  type ChangePlan,
  type ClothoMethod,
  type CommitResult,
  type CreateOperation
} from "../packages/contracts/src/index.js";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const canonId = "01995c2a-7b00-7000-8000-000000000102";
const seedId = "01995c2a-7b00-7000-8000-000000000103";
const timelineTimeSystemId = "019f0000-0000-7000-8000-000000000001";
const timelineCanonTimeSystemId = "019f0000-0000-7000-8000-000000000002";
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
  const endpoint = new URL("/mcp", apiUrl);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("Invalid MCP smoke endpoint");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${process.env.CLOTHO_TOKEN!}`
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error("MCP smoke request failed");
  const body = (await response.json()) as {
    error?: unknown;
    result: T & { isError?: boolean };
  };
  if (body.error || body.result.isError)
    throw new Error("MCP smoke operation failed");
  return body.result;
}
function id(label: string): string {
  const h = createHash("sha256")
    .update(`${expectedSha}:${label}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* Only bounded safe status is emitted on failure. */
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("Clotho deployment or publication timed out");
}
async function main(): Promise<void> {
  process.stdout.write("waiting for exact Clotho deployment\n");
  await waitFor(async () => {
    const response = await fetch(new URL("/health/ready", apiUrl), {
      signal: AbortSignal.timeout(10_000)
    });
    const health = (await response.json()) as {
      commit_sha: string;
      status: string;
      service: string;
    };
    return (
      response.ok &&
      health.status === "ok" &&
      health.service === "clotho-api" &&
      health.commit_sha === expectedSha
    );
  });
  process.stdout.write("exact Clotho deployment ready\n");
  const unauthorized = await fetch(new URL("/v1/clotho/world.list", apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000)
  });
  if (unauthorized.status !== 401)
    throw new Error("Unauthenticated Clotho access was not rejected");
  const mcpUnauthorized = await fetch(new URL("/mcp", apiUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000)
  });
  if (mcpUnauthorized.status !== 401)
    throw new Error("Unauthenticated MCP access was not rejected");
  await mcp("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "moirai-synthetic-smoke", version: "1" }
  });
  const tools = await mcp<{ tools: { name: string }[] }>("tools/list", {});
  if (
    tools.tools.length !== 10 ||
    !tools.tools.some((tool) => tool.name === "change_commit")
  )
    throw new Error("MCP tool discovery failed");
  const origin_refs = [{ field: "*", origin_index: 0 }];
  const base: ChangePlan = {
    contract_version: CONTRACT_VERSION,
    world_id: worldId,
    change_set_id: "01995c2a-7b00-7000-8000-000000000104",
    expected_revision: 0,
    intent: "Public synthetic Clotho acceptance fixture",
    origins: [
      {
        kind: "human_instruction",
        summary: "private-synthetic-clotho: automated acceptance only"
      }
    ],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: worldId,
        origin_refs,
        value: {
          slug: "clotho-synthetic",
          title: "Clotho Synthetic Observatory"
        }
      },
      {
        kind: "create",
        entity_type: "canon",
        entity_id: canonId,
        origin_refs,
        value: {
          world_id: worldId,
          slug: "signals",
          title: "Synthetic Signals"
        }
      },
      {
        kind: "create",
        entity_type: "event",
        entity_id: seedId,
        origin_refs,
        value: {
          canon_id: canonId,
          kind: "atomic",
          title: "The observatory receives its first signal",
          roles: [],
          attributes: {}
        }
      }
    ]
  };
  const listed = call<{ items: { id: string }[] }>("world.list", {});
  if (!listed.items.some((w) => w.id === worldId)) {
    call("change.validate", { plan: base });
    call("change.commit", { plan: base });
  }
  const world = call<{ source_revision: number }>("world.get", {
    world_id: worldId
  });
  const mcpWorld = await mcp<{
    structuredContent: { result: { source_revision: number } };
  }>("tools/call", {
    name: "world_get",
    arguments: { world_id: worldId }
  });
  if (
    mcpWorld.structuredContent.result.source_revision !== world.source_revision
  )
    throw new Error("MCP and CLI revision differ");
  call("canon.list", { world_id: worldId, at_revision: world.source_revision });
  const context = call<{ time_systems: readonly { id: string }[] }>(
    "context.slice",
    {
      world_id: worldId,
      canon_ids: [canonId],
      seed_ids: [seedId],
      at_revision: world.source_revision
    }
  );
  const title = `Clotho verified signal ${expectedSha.slice(0, 12)}`;
  const existing = call<{ items: { id: string }[] }>("event.search", {
    world_id: worldId,
    canon_id: canonId,
    query: title
  });
  let revision = world.source_revision;
  if (!existing.items.some((e) => e.id === id("event"))) {
    const timelineSetup: readonly CreateOperation[] = context.time_systems.some(
      (timeSystem) => timeSystem.id === timelineTimeSystemId
    )
      ? []
      : [
          {
            kind: "create",
            entity_type: "time_system",
            entity_id: timelineTimeSystemId,
            origin_refs,
            value: {
              world_id: worldId,
              slug: "deployment-sequence",
              title: "Deployment Sequence",
              kind: "ordinal",
              definition_version: "1",
              definition: { coordinate: "integer", unit: "deployment" }
            }
          },
          {
            kind: "create",
            entity_type: "canon_time_system",
            entity_id: timelineCanonTimeSystemId,
            origin_refs,
            value: {
              canon_id: canonId,
              time_system_id: timelineTimeSystemId
            }
          }
        ];
    const plan: ChangePlan = {
      ...base,
      change_set_id: id("change"),
      expected_revision: revision,
      operations: [
        ...timelineSetup,
        {
          kind: "create",
          entity_type: "event",
          entity_id: id("event"),
          origin_refs,
          value: {
            canon_id: canonId,
            kind: "atomic",
            title,
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "event_temporal_placement",
          entity_id: id("timeline-placement"),
          origin_refs,
          value: {
            event_id: id("event"),
            time_system_id: timelineTimeSystemId,
            kind: "point",
            earliest_start: { value: revision + 1 },
            latest_start: { value: revision + 1 },
            precision: "deployment",
            certainty: "exact",
            display_label: `Deployment ${revision + 1}`
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: id("timeline-relation"),
          origin_refs,
          value: {
            canon_id: canonId,
            type: "precedes",
            source_event_id: seedId,
            target_event_id: id("event"),
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: id("subject-relation"),
          origin_refs,
          value: {
            canon_id: canonId,
            type: "identity_continues",
            source_event_id: seedId,
            target_event_id: id("event"),
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "narrative",
          entity_id: id("narrative"),
          origin_refs,
          value: {
            canon_id: canonId,
            scope_type: "event",
            scope_id: id("event"),
            locale: "en",
            kind: "primary",
            body: "This public synthetic signal was authored through the authenticated Clotho CLI.",
            public_references: []
          }
        }
      ]
    };
    const preview = call<{ plan_digest: string }>("change.validate", { plan });
    await mcp("tools/call", { name: "change_validate", arguments: { plan } });
    if (
      call<{ source_revision: number }>("world.get", { world_id: worldId })
        .source_revision !== revision
    )
      throw new Error("Validation changed the revision");
    const committed = await mcp<{
      structuredContent: { result: CommitResult };
    }>("tools/call", {
      name: "change_commit",
      arguments: { plan, plan_digest: preview.plan_digest }
    });
    const result = committed.structuredContent.result;
    revision = result.current_revision;
    const replay = call<CommitResult>("change.commit", { plan });
    if (!replay.idempotent_replay || replay.current_revision !== revision)
      throw new Error("Commit replay was not idempotent");
    const mcpReplay = await mcp<{
      structuredContent: { result: CommitResult };
    }>("tools/call", {
      name: "change_commit",
      arguments: { plan }
    });
    if (
      !mcpReplay.structuredContent.result.idempotent_replay ||
      mcpReplay.structuredContent.result.current_revision !== revision
    )
      throw new Error("MCP commit replay was not idempotent");
  }
  process.stdout.write(
    `authenticated write contract passed; revision=${revision}\n`
  );
  const path = `/worlds/${worldId}/canons/${canonId}/events/${id("event")}`;
  process.stdout.write("waiting for revision-pinned public projection\n");
  await waitFor(async () => {
    const response = await fetch(new URL(path, publicUrl), {
      signal: AbortSignal.timeout(10_000)
    });
    const text = (await response.text()).replace(/<!--.*?-->/g, "");
    if (
      !response.ok ||
      !text.includes(title) ||
      !text.includes("authenticated Clotho CLI")
    )
      return false;
    for (const forbidden of [
      process.env.CLOTHO_TOKEN!,
      "private-synthetic-clotho",
      "origin_refs",
      "token_sha256"
    ])
      if (text.includes(forbidden)) throw new Error("Private metadata leak");
    const artifact = await fetch(
      new URL(
        `/worlds/${worldId}/revisions/${revision}/events/${id("event")}.json`,
        publicUrl
      ),
      { signal: AbortSignal.timeout(10_000) }
    );
    const body = await artifact.text();
    if (!artifact.ok || !body.includes(title)) return false;
    for (const forbidden of [
      process.env.CLOTHO_TOKEN!,
      "private-synthetic-clotho",
      "origin_refs",
      "token_sha256"
    ])
      if (body.includes(forbidden)) throw new Error("Private artifact leak");
    const timelinePath = `/worlds/${worldId}/revisions/${revision}/graph/canons/${canonId}/timeline-${timelineTimeSystemId}.json`;
    const timelineArtifact = await fetch(new URL(timelinePath, publicUrl), {
      signal: AbortSignal.timeout(10_000)
    });
    const timelineBody = await timelineArtifact.text();
    if (
      !timelineArtifact.ok ||
      !timelineArtifact.headers.get("cache-control")?.includes("immutable") ||
      !timelineBody.includes('"projection_type":"timeline"') ||
      !timelineBody.includes(`"source_revision":${revision}`) ||
      !timelineBody.includes(id("event")) ||
      !timelineBody.includes('"semantic_digest"')
    )
      return false;
    const canonPage = await fetch(
      new URL(`/worlds/${worldId}/canons/${canonId}`, publicUrl),
      { signal: AbortSignal.timeout(10_000) }
    );
    const canonHtml = (await canonPage.text()).replace(/<!--.*?-->/g, "");
    if (
      !canonPage.ok ||
      !canonHtml.includes("DERIVED TIMELINE") ||
      !canonHtml.includes("DERIVED SUBJECTS") ||
      !canonHtml.includes("Deployment Sequence") ||
      !canonHtml.includes(title)
    )
      return false;
    const canonArtifact = await fetch(
      new URL(
        `/worlds/${worldId}/revisions/${revision}/canons/${canonId}.json`,
        publicUrl
      ),
      { signal: AbortSignal.timeout(10_000) }
    );
    const canonDocument = (await canonArtifact.json()) as {
      subject_artifacts?: readonly {
        key: string;
        subject_handle_id: string;
      }[];
    };
    const subjectReference = canonDocument.subject_artifacts?.find(
      (reference) => reference.subject_handle_id.length > 0
    );
    if (!canonArtifact.ok || !subjectReference) return false;
    const subjectArtifact = await fetch(
      new URL(
        `/worlds/${worldId}/revisions/${revision}/subjects/${subjectReference.subject_handle_id}.json`,
        publicUrl
      ),
      { signal: AbortSignal.timeout(10_000) }
    );
    const subjectBody = await subjectArtifact.text();
    if (
      !subjectArtifact.ok ||
      !subjectArtifact.headers.get("cache-control")?.includes("immutable") ||
      !subjectBody.includes('"projection_type":"subject"') ||
      !subjectBody.includes(id("event")) ||
      !subjectBody.includes('"semantic_digest"')
    )
      return false;
    const subjectPage = await fetch(
      new URL(
        `/worlds/${worldId}/canons/${canonId}/subjects/${subjectReference.subject_handle_id}`,
        publicUrl
      ),
      { signal: AbortSignal.timeout(10_000) }
    );
    const subjectHtml = (await subjectPage.text()).replace(/<!--.*?-->/g, "");
    if (
      !subjectPage.ok ||
      !subjectHtml.includes("DERIVED SUBJECT") ||
      !subjectHtml.includes(title)
    )
      return false;
    return true;
  });
  process.stdout.write(
    `Clotho CLI + MCP → Lachesis → Publication → Atropos passed; revision=${revision}; path=${path}\n`
  );
}
void main().catch(() => {
  process.stderr.write(
    "Clotho synthetic smoke failed; inspect safe CI step status\n"
  );
  process.exitCode = 1;
});
