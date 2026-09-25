import {
  assertSameIdentitySet,
  assertReadbackRevision
} from "./public-readback.js";

interface HealthPayload {
  readonly status: string;
  readonly service: string;
  readonly commit_sha: string;
}

interface StatusPayload {
  readonly application: { readonly commit_sha: string };
  readonly versions?: {
    readonly contract: string;
    readonly publication_format: string;
  };
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
const sharedEventId = "019f5b00-0000-7000-8000-000000000115";
const compositeEventId = "01a0c40a-a761-7fc7-aef2-10211e0ecb0e";
// Public dogfood corpus; pin one published Revision, including additive refinements.
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

async function fetchGraphQuery(revision: number): Promise<GraphQueryPayload> {
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
          served_revision: revision,
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

async function readV5<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL("/graph/v5/read", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ world_id: graphWorldId, ...input }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok)
    throw Error(`v5 ${input.kind} read returned ${response.status}`);
  return (await response.json()) as T;
}

async function verifyV5(pointer: {
  world_id: string;
  served_revision: number;
  current_revision: number;
  publication_target_revision: number;
  format_version: string;
  manifest_sha256: string;
}): Promise<void> {
  const [
    health,
    ready,
    status,
    landing,
    graph,
    root,
    old,
    catalog,
    event,
    children,
    spatial
  ] = await Promise.all([
    fetchJson<HealthPayload>("/health/live"),
    fetchJson<HealthPayload>("/health/ready"),
    fetchJson<StatusPayload>("/status-public"),
    fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(10_000) }),
    fetch(new URL(`/graph/v5?world=${graphWorldId}`, baseUrl), {
      signal: AbortSignal.timeout(20_000)
    }),
    fetch(new URL("/graph", baseUrl), { signal: AbortSignal.timeout(20_000) }),
    fetch(
      new URL(`/worlds/${graphWorldId}/revisions/30/manifest.json`, baseUrl),
      { signal: AbortSignal.timeout(10_000) }
    ),
    readV5<{
      served_revision: number;
      data: {
        collection_count: number;
        collections: { id: string; member_count: number }[];
      };
    }>({ kind: "collections", page: 0 }),
    readV5<{
      served_revision: number;
      data: { event: { id: string }; narrative: { body: string } };
    }>({ kind: "event", event_id: sharedEventId }),
    readV5<{ served_revision: number; data: { child_event_ids: string[] } }>({
      kind: "composite_children",
      event_id: compositeEventId,
      page: 0
    }),
    readV5<{
      served_revision: number;
      data: { shape_count: number; unplaced_count: number };
    }>({ kind: "spatial_summary", time_system_id: graphTimeSystem })
  ]);
  const collections = await Promise.all(
    catalog.data.collections.map((collection) =>
      readV5<{ served_revision: number; data: { event_ids: string[] } }>({
        kind: "collection",
        collection_id: collection.id,
        page: 0
      })
    )
  );
  const allIds = collections.flatMap((collection) => collection.data.event_ids);
  if (
    pointer.format_version !== "v5-publication/1" ||
    pointer.served_revision < 31 ||
    pointer.served_revision !== pointer.current_revision ||
    pointer.served_revision !== pointer.publication_target_revision ||
    !/^[0-9a-f]{64}$/.test(pointer.manifest_sha256) ||
    health.status !== "ok" ||
    ready.status !== "ok" ||
    health.service !== "atropos-web" ||
    ready.service !== "atropos-web" ||
    health.commit_sha !== expectedSha ||
    ready.commit_sha !== expectedSha ||
    status.application.commit_sha !== expectedSha ||
    status.versions?.contract !== "5" ||
    status.versions.publication_format !== "v5-publication/1" ||
    Object.values(status.surfaces).some((value) => value !== "ok") ||
    !landing.ok ||
    !graph.ok ||
    !root.ok ||
    !old.ok ||
    !(await graph.text()).includes("실제 세계사") ||
    !(await root.text()).includes("/graph/v5?world=") ||
    catalog.served_revision !== pointer.served_revision ||
    catalog.data.collection_count !== 6 ||
    event.served_revision !== pointer.served_revision ||
    event.data.event.id !== sharedEventId ||
    !event.data.narrative.body ||
    children.served_revision !== pointer.served_revision ||
    children.data.child_event_ids.length !== 14 ||
    spatial.served_revision !== pointer.served_revision ||
    spatial.data.shape_count !== 125 ||
    spatial.data.unplaced_count !== 2 ||
    collections.some(
      (collection) => collection.served_revision !== pointer.served_revision
    ) ||
    allIds.length !== 153 ||
    new Set(allIds).size !== 127 ||
    allIds.filter((id) => id === sharedEventId).length !== 2
  )
    throw Error("v5 public deployment does not match the expected build");
}

async function verify(): Promise<void> {
  const pointer = await fetchJson<{
    world_id: string;
    served_revision: number;
    current_revision?: number;
    publication_target_revision?: number;
    format_version?: string;
    manifest_sha256?: string;
  }>(`/worlds/${graphWorldId}/current.json`);
  const revision = pointer.served_revision;
  assertReadbackRevision(graphWorldId, revision, pointer);
  if (pointer.format_version === "v5-publication/1") {
    await verifyV5(pointer as Parameters<typeof verifyV5>[0]);
    return;
  }
  const prefix = `/worlds/${graphWorldId}/revisions/${revision}`;
  const [health, ready, status, landing, graph, canon, temporal] =
    await Promise.all([
      fetchJson<HealthPayload>("/health/live"),
      fetchJson<HealthPayload>("/health/ready"),
      fetchJson<StatusPayload>("/status-public"),
      fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(10_000) }),
      fetchGraphQuery(revision),
      fetchJson<{
        canon: { id: string; world_id: string };
        served_revision: number;
        events: readonly { id: string }[];
      }>(`${prefix}/canons/${graphCanon}.json`),
      fetchJson<{
        world_id: string;
        canon_id: string;
        served_revision: number;
        source_revision: number;
        relations: readonly { id: string }[];
      }>(`${prefix}/graph/canons/${graphCanon}/temporal.json`)
    ]);
  assertReadbackRevision(graphWorldId, revision, {
    world_id: canon.canon.world_id,
    served_revision: canon.served_revision
  });
  assertReadbackRevision(graphWorldId, revision, temporal);
  assertSameIdentitySet("Events", graph.result.events, canon.events);
  assertSameIdentitySet(
    "Relations",
    graph.result.relations,
    temporal.relations
  );
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
    graph.result.revision_vector[0]?.served_revision !== revision ||
    canon.canon.id !== graphCanon ||
    temporal.canon_id !== graphCanon ||
    temporal.source_revision !== revision ||
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
