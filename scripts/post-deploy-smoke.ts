interface HealthPayload {
  readonly status: string;
  readonly service: string;
  readonly commit_sha: string;
}

export {};

interface StatusPayload {
  readonly application: { readonly commit_sha: string };
  readonly surfaces: {
    readonly atropos: string;
    readonly health: string;
    readonly status: string;
  };
}

interface GraphQueryPayload {
  readonly result: {
    readonly revision_vector: readonly {
      world_id: string;
      served_revision: number;
    }[];
    readonly events: readonly {
      id: string;
      matched_canon_ids: readonly string[];
    }[];
    readonly relations: readonly {
      id: string;
      type: string;
      matched_canon_ids: readonly string[];
    }[];
    readonly completeness: string;
  };
  readonly semantic_digest: string;
}

const graphWorldId = "01995c2a-7b00-7000-8000-000000000101";
// Current public dogfood corpus. Overlapping-Canon acceptance stays in isolated CI.
const graphCanon = "019f5b00-0000-7000-8000-000000000002";
const graphTimeSystem = "019f5b00-0000-7000-8000-000000000003";
const graphEventA = "019f5b00-0000-7000-8000-000000000100";
const graphEventB = "019f5b00-0000-7000-8000-000000000104";
const graphTimeBound = "019f5b00-0000-7000-8000-000000001001";
const gregorianFrame = {
  time_system_id: graphTimeSystem,
  definition_version: "1",
  adapter_identity: "yyyy-iso-fields-fraction12-z-v1",
  comparison_domain: "yyyy-iso-fields-fraction12-z-v1"
};

const baseUrl = process.env.PUBLIC_INTEGRATION_URL;
const expectedSha = process.env.EXPECTED_COMMIT_SHA;
if (!baseUrl || !expectedSha) {
  throw new Error(
    "PUBLIC_INTEGRATION_URL and EXPECTED_COMMIT_SHA are required"
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

async function fetchGraphQuery(): Promise<GraphQueryPayload> {
  const response = await fetch(new URL("/graph/query", baseUrl), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      contract_version: 1,
      temporal_frame: {
        target: gregorianFrame
      },
      sources: [
        {
          world_id: graphWorldId,
          served_revision: 1,
          canon_ids: [graphCanon],
          time_systems: [gregorianFrame]
        }
      ],
      scope: { kind: "overview" },
      entity_filter: {
        event_kinds: ["atomic", "composite"],
        roles: [],
        subject_handle_ids: [],
        include_states: true,
        include_narratives: true,
        include_virtual_time_events: true
      },
      relation_filter: {
        types: [
          "contains",
          "precedes",
          "not_after",
          "coincides",
          "causes",
          "enables",
          "prevents",
          "influences",
          "starts",
          "ends",
          "identity_continues",
          "identity_instance_of",
          "identity_splits",
          "identity_merges",
          "derives_from",
          "transfers"
        ],
        directions: ["directed", "undirected"]
      },
      diagnostics_filter: {
        include_codes: [],
        include_unplaced: true,
        include_unresolved: true
      },
      budget: {
        detail_level: "overview",
        max_entities: 1000,
        max_relations: 2000,
        max_evidence: 4000
      }
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`/graph/query returned ${response.status}`);
  return (await response.json()) as GraphQueryPayload;
}

async function verify(): Promise<void> {
  const [health, ready, status, landing, graph] = await Promise.all([
    fetchJson<HealthPayload>("/health/live"),
    fetchJson<HealthPayload>("/health/ready"),
    fetchJson<StatusPayload>("/status-public"),
    fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(10_000) }),
    fetchGraphQuery()
  ]);
  const eventIds = graph.result.events.map((event) => event.id);
  const timeBounds = graph.result.relations.filter(
    (relation) => relation.id === graphTimeBound
  );
  if (
    health.status !== "ok" ||
    ready.status !== "ok" ||
    health.service !== "atropos-web" ||
    ready.service !== "atropos-web" ||
    health.commit_sha !== expectedSha ||
    ready.commit_sha !== expectedSha ||
    status.application.commit_sha !== expectedSha ||
    Object.values(status.surfaces).some((value) => value !== "ok") ||
    !landing.ok ||
    graph.result.completeness !== "complete" ||
    graph.result.revision_vector.length !== 1 ||
    graph.result.revision_vector[0]?.world_id !== graphWorldId ||
    graph.result.revision_vector[0]?.served_revision !== 1 ||
    eventIds.length !== 40 ||
    graph.result.relations.length !== 124 ||
    graph.result.events.some(
      (event) => event.matched_canon_ids.join(",") !== graphCanon
    ) ||
    graph.result.relations.some(
      (relation) => relation.matched_canon_ids.join(",") !== graphCanon
    ) ||
    eventIds.filter((id) => id === graphEventA).length !== 1 ||
    eventIds.filter((id) => id === graphEventB).length !== 1 ||
    timeBounds.length !== 1 ||
    timeBounds[0]?.type !== "not_after" ||
    !/^[0-9a-f]{64}$/.test(graph.semantic_digest)
  ) {
    throw new Error("Atropos deployment does not match the expected build");
  }
}

const deadline = Date.now() + 10 * 60_000;
let lastError: unknown;
while (Date.now() < deadline) {
  try {
    await verify();
    process.stdout.write(
      `production public readiness smoke passed; sha=${expectedSha}\n`
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
throw lastError instanceof Error
  ? lastError
  : new Error("post-deploy smoke timed out");
