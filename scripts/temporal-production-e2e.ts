import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CreateChangeSet,
  PublicRelationalTemporalProjection
} from "../packages/contracts/src/index.js";
import {
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  TEMPORAL_EXPRESSIVENESS_WORLD_ID
} from "../packages/contracts/src/index.js";
import { callClotho, ClothoClientError } from "../skills/clotho/src/client.js";
import {
  cloneWorldPlan,
  exportWorldPackage,
  readWorldPackage,
  temporalSemanticFingerprint,
  temporalSemanticFingerprintWithIdentityMap,
  type PortableWorld
} from "../skills/clotho/src/portability.js";

const fixtureRoot = resolve(
  "docs/implementation/fixtures/temporal-expressiveness"
);
const apiUrl = process.env.CLOTHO_API_URL ?? "";
const atroposUrl = process.env.PUBLIC_INTEGRATION_URL ?? "";
const token = process.env.CLOTHO_TOKEN ?? "";
const expectedSha = process.env.EXPECTED_COMMIT_SHA ?? "";
const evidencePath =
  process.env.TEMPORAL_EVIDENCE_PATH ?? "temporal-production-evidence.json";
const packagePath =
  process.env.TEMPORAL_PACKAGE_PATH ?? "temporal-expressiveness.moirai";

if (
  !apiUrl ||
  !atroposUrl ||
  !/^[A-Za-z0-9_-]{32,256}$/.test(token) ||
  !/^[a-f0-9]{40}$/.test(expectedSha)
) {
  throw new Error("temporal production E2E configuration is incomplete");
}

const client = { baseUrl: apiUrl, token, timeoutMs: 45_000 };
const canonId = "019f3b00-0000-7000-8000-000000000002";
const timeSystemId = "019f3b00-0000-7000-8000-000000000003";
const exactCoordinate = "2026-09-05T08:13:21.123456789012Z";
const expectedCoordinates = [
  "0220-01-01T00:00:00.000000000000Z",
  "0221-01-01T00:00:00.000000000000Z",
  "1969-07-01T00:00:00.000000000000Z",
  "1969-08-01T00:00:00.000000000000Z",
  "1969-07-20T00:00:00.000000000000Z",
  "1969-07-21T00:00:00.000000000000Z",
  "2026-09-05T08:13:21.123000000000Z",
  "2026-09-05T08:13:21.124000000000Z",
  exactCoordinate,
  "2026-09-05T08:13:21.123456789013Z",
  "2026-09-05T08:13:22.000000000000Z",
  "2026-09-05T08:13:24.000000000000Z"
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`acceptance_failed:${message}`);
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(fixtureRoot, path), "utf8")) as T;
}

async function clotho<T>(
  method: Parameters<typeof callClotho>[1],
  input: unknown
) {
  const envelope = (await callClotho(client, method, input)) as { result: T };
  return envelope.result;
}

async function publicFetch(path: string): Promise<Response> {
  return fetch(new URL(path, atroposUrl), {
    headers: {
      accept: path.endsWith(".json") ? "application/json" : "text/html"
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000)
  });
}

async function waitForPublication(worldId: string, revision: number) {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const response = await publicFetch(`/worlds/${worldId}/current.json`);
    if (response.ok) {
      const pointer = (await response.json()) as {
        served_revision: number;
        current_revision: number;
        publication_target_revision: number;
        projection_status: string;
      };
      if (
        pointer.served_revision === revision &&
        pointer.current_revision === revision &&
        pointer.publication_target_revision === revision &&
        pointer.projection_status === "ready"
      ) {
        return pointer;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
  }
  throw new Error(`publication_timeout:${worldId}:${revision}`);
}

function projectionAssertions(projection: PublicRelationalTemporalProjection) {
  const position = (id: string) =>
    projection.positions.find((item) => item.event_id === id);
  const coordinate = (bound: unknown) =>
    (bound as { time_event?: { coordinate?: string } } | undefined)?.time_event
      ?.coordinate;
  const year = position("019f3b00-0000-7000-8000-000000000101");
  const month = position("019f3b00-0000-7000-8000-000000000102");
  const day = position("019f3b00-0000-7000-8000-000000000103");
  const ms = position("019f3b00-0000-7000-8000-000000000104");
  const ps = position("019f3b00-0000-7000-8000-000000000105");
  const exact = position("019f3b00-0000-7000-8000-000000000106");
  const relativeA = position("019f3b00-0000-7000-8000-00000000010a");
  const relativeB = position("019f3b00-0000-7000-8000-00000000010b");
  const composite = projection.composites.find(
    (item) => item.event_id === "019f3b00-0000-7000-8000-000000000107"
  );
  assert(
    year?.kind === "bounded" &&
      coordinate(year.lower) === expectedCoordinates[0] &&
      coordinate(year.upper) === expectedCoordinates[1],
    "year_range"
  );
  assert(
    month?.kind === "bounded" &&
      coordinate(month.lower) === expectedCoordinates[2] &&
      coordinate(month.upper) === expectedCoordinates[3],
    "month_range"
  );
  assert(
    day?.kind === "bounded" &&
      coordinate(day.lower) === expectedCoordinates[4] &&
      coordinate(day.upper) === expectedCoordinates[5],
    "day_range"
  );
  assert(
    ms?.kind === "bounded" &&
      coordinate(ms.lower) === expectedCoordinates[6] &&
      coordinate(ms.upper) === expectedCoordinates[7],
    "millisecond_range"
  );
  assert(
    ps?.kind === "bounded" &&
      coordinate(ps.lower) === expectedCoordinates[8] &&
      coordinate(ps.upper) === expectedCoordinates[9] &&
      ps.knowledge_span?.value === "1",
    "picosecond_range"
  );
  assert(
    exact?.kind === "exact" && exact.time_event?.coordinate === exactCoordinate,
    "exact_observation"
  );
  assert(
    relativeA?.kind === "relative-only" && relativeB?.kind === "relative-only",
    "relative_only"
  );
  assert(
    composite?.duration.kind === "exact" &&
      composite.duration.basis === "explicit_boundaries" &&
      composite.duration.amount?.value === "2000000000000",
    "explicit_duration"
  );
  assert(
    composite.descendant_span.basis === "descendant_span",
    "descendant_span"
  );
  assert(
    composite.direct_children.some(
      (reference) =>
        reference.kind === "event" &&
        reference.event_id === "019f3b00-0000-7000-8000-000000000108"
    ),
    "contains_membership"
  );
  assert(
    composite.during.some(
      (item) =>
        item.event_id === "019f3b00-0000-7000-8000-000000000109" &&
        !item.membership
    ) &&
      !composite.direct_children.some(
        (reference) =>
          reference.kind === "event" &&
          reference.event_id === "019f3b00-0000-7000-8000-000000000109"
      ),
    "during_not_membership"
  );
  return {
    bounded_year_month_day_ms_ps: true,
    exact_time_event: true,
    relative_only_without_absolute_date: true,
    explicit_boundary_duration_picoseconds: "2000000000000",
    descendant_span_separate: true,
    contains_membership_true: true,
    during_membership_false: true,
    source_evidence_present: projection.positions.every(
      (item) =>
        item.source_constraint_ids.length > 0 || item.kind === "unresolved"
    ),
    picosecond_coordinates_byte_equal: true
  };
}

const [clothoHealth, atroposHealth] = await Promise.all([
  fetch(new URL("/health/ready", apiUrl), {
    signal: AbortSignal.timeout(10_000)
  }).then((r) => r.json()) as Promise<{ commit_sha: string; status: string }>,
  publicFetch("/health/ready").then((r) => r.json()) as Promise<{
    commit_sha: string;
    status: string;
  }>
]);
assert(
  clothoHealth.status === "ok" && clothoHealth.commit_sha === expectedSha,
  "clotho_sha"
);
assert(
  atroposHealth.status === "ok" && atroposHealth.commit_sha === expectedSha,
  "atropos_sha"
);

const initial = await clotho<{ items: { id: string }[] }>("world.list", {});
assert(
  !initial.items.some((item) =>
    [
      TEMPORAL_EXPRESSIVENESS_WORLD_ID,
      TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID
    ].includes(item.id)
  ),
  "trial_worlds_not_empty"
);

const bootstrap = await json<CreateChangeSet>("bootstrap.change-plan.json");
const success = await json<CreateChangeSet>("success.change-plan.json");
const bootstrapValidation = await clotho<{
  valid: boolean;
  source_revision: number;
  plan_digest: string;
}>("change.validate", { plan: bootstrap });
assert(
  bootstrapValidation.valid && bootstrapValidation.source_revision === 0,
  "bootstrap_validate"
);
const bootstrapCommit = await clotho<{
  current_revision: number;
  publication_target_revision: number;
}>("change.commit", { plan: bootstrap });
assert(bootstrapCommit.current_revision === 1, "bootstrap_commit");
const successValidation = await clotho<{
  valid: boolean;
  source_revision: number;
  plan_digest: string;
  virtual_time_events: { persisted: boolean; coordinate: string }[];
}>("change.validate", { plan: success });
assert(
  successValidation.valid && successValidation.source_revision === 1,
  "success_validate"
);
assert(
  successValidation.virtual_time_events.some(
    (item) => !item.persisted && item.coordinate === exactCoordinate
  ),
  "validate_virtual_event"
);
const successCommit = await clotho<{
  current_revision: number;
  publication_target_revision: number;
}>("change.commit", { plan: success });
assert(successCommit.current_revision === 2, "success_commit");
const replay = await clotho<{
  current_revision: number;
  idempotent_replay: boolean;
}>("change.commit", { plan: success });
assert(
  replay.current_revision === 2 && replay.idempotent_replay,
  "idempotent_replay"
);

const canon = await clotho<{
  source_revision: number;
  events: { id: string }[];
  relations: { id: string }[];
  time_systems: { id: string }[];
  truncated: boolean;
}>("canon.get", {
  world_id: TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  canon_id: canonId,
  at_revision: 2,
  max_events: 100,
  max_relations: 100,
  max_narrative_chars: 100000
});
const canonText = JSON.stringify(canon);
assert(
  canon.source_revision === 2 &&
    canon.events.length === 11 &&
    canon.relations.length === 23 &&
    canon.time_systems.length === 1 &&
    !canon.truncated,
  "canon_read_back"
);
assert(
  expectedCoordinates.every((item) => canonText.includes(item)),
  "canon_lossless_coordinates"
);
assert(
  !canonText.includes("temporal_placement") &&
    !canonText.includes("source_event_id") &&
    !canonText.includes("target_event_id"),
  "canon_legacy_absent"
);

const resolveInput = {
  world_id: TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  time_system_id: timeSystemId,
  definition_version: "1",
  coordinate: exactCoordinate
};
const resolvedFirst = await clotho<{
  source_revision: number;
  time_event: { id: string; coordinate: string; persisted: boolean };
}>("time-event.resolve", resolveInput);
const resolvedSecond = await clotho<typeof resolvedFirst>(
  "time-event.resolve",
  resolveInput
);
assert(
  JSON.stringify(resolvedFirst) === JSON.stringify(resolvedSecond) &&
    !resolvedFirst.time_event.persisted,
  "deterministic_nonpersistent_time_event"
);

const sourcePointer = await waitForPublication(
  TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  2
);
const temporalPath = `/worlds/${TEMPORAL_EXPRESSIVENESS_WORLD_ID}/revisions/2/graph/canons/${canonId}/temporal.json`;
const temporalResponse = await publicFetch(temporalPath);
assert(temporalResponse.ok, "source_temporal_json");
const sourceProjection =
  (await temporalResponse.json()) as PublicRelationalTemporalProjection;
const sourceProjectionAssertions = projectionAssertions(sourceProjection);
const canonPage = await publicFetch(
  `/worlds/${TEMPORAL_EXPRESSIVENESS_WORLD_ID}/canons/${canonId}`
);
const canonHtml = await canonPage.text();
assert(
  canonPage.ok &&
    [
      "220년 범위",
      "1969년 7월 범위",
      "1969년 7월 20일 범위",
      ...expectedCoordinates.slice(6),
      "2 seconds",
      "component",
      "occurred during",
      "절대 날짜 미상"
    ].every((item) => canonHtml.includes(item)),
  "atropos_accessible_text"
);

const exported = await clotho<{
  source_revision: number;
  completeness: string;
  snapshot: PortableWorld;
}>("world.export", {
  world_id: TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  at_revision: 2
});
assert(
  exported.source_revision === 2 && exported.completeness === "complete",
  "world_export"
);
const worldPackage = await exportWorldPackage(exported.snapshot, 2);
await writeFile(packagePath, worldPackage.bytes, { flag: "wx" });
const packageRead = await readWorldPackage(worldPackage.bytes);
assert(packageRead.manifest.completeness === "complete", "package_readback");
let importSequence = 1;
const importClone = cloneWorldPlan(
  packageRead.view,
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  () =>
    `01a10000-0000-7000-8000-${(importSequence++).toString(16).padStart(12, "0")}`
);
const importValidation = await clotho<{
  valid: boolean;
  source_revision: number;
  plan_digest: string;
}>("change.validate", { plan: importClone.plan });
assert(
  importValidation.valid && importValidation.source_revision === 0,
  "import_validate"
);
const importCommit = await clotho<{
  current_revision: number;
  publication_target_revision: number;
}>("change.commit", { plan: importClone.plan });
assert(importCommit.current_revision === 1, "import_commit");
const importPointer = await waitForPublication(
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  1
);
const importExport = await clotho<{ snapshot: PortableWorld }>("world.export", {
  world_id: TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
  at_revision: 1
});
const targetToSource = Object.fromEntries(
  Object.entries(importClone.id_mapping).map(([source, target]) => [
    target,
    source
  ])
);
const sourceFingerprint = temporalSemanticFingerprint(exported.snapshot);
const importFingerprint = temporalSemanticFingerprintWithIdentityMap(
  importExport.snapshot,
  targetToSource
);
assert(
  sourceFingerprint.digest === importFingerprint.digest,
  "roundtrip_fingerprint"
);
const importedCanonId = importClone.id_mapping[canonId]!;
const importTemporalResponse = await publicFetch(
  `/worlds/${TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID}/revisions/1/graph/canons/${importedCanonId}/temporal.json`
);
assert(importTemporalResponse.ok, "import_temporal_json");

const rejectionExpectations = await json<{
  cases: {
    case_id: string;
    expected_code: string;
    required_relation_ids?: string[];
    required_time_system_ids?: string[];
  }[];
}>("expected/rejections.json");
const rejectionFiles: Record<string, string> = {
  "te-bad-cycle": "bad-cycle.change-plan.json",
  "te-bad-boundary": "bad-boundary.change-plan.json",
  "te-bad-system": "bad-system.change-plan.json",
  "te-bad-coordinate": "bad-coordinate.change-plan.json",
  "te-bad-duplicate-start": "bad-duplicate-start.change-plan.json"
};
const rejectionEvidence = [];
for (const expectation of rejectionExpectations.cases) {
  const plan = await json<CreateChangeSet>(
    `rejection/${rejectionFiles[expectation.case_id]}`
  );
  try {
    await clotho("change.validate", { plan });
    throw new Error(`rejection_not_rejected:${expectation.case_id}`);
  } catch (error) {
    assert(
      error instanceof ClothoClientError,
      `rejection_transport:${expectation.case_id}`
    );
    assert(
      error.code === expectation.expected_code,
      `rejection_code:${expectation.case_id}`
    );
    const requiredIds = [
      ...(expectation.required_relation_ids ?? []),
      ...(expectation.required_time_system_ids ?? [])
    ];
    assert(
      requiredIds.every((id) => error.details?.affected_ids.includes(id)),
      `rejection_evidence:${expectation.case_id}`
    );
    rejectionEvidence.push({
      case_id: expectation.case_id,
      code: error.code,
      path: error.details?.path ?? null,
      affected_ids: error.details?.affected_ids ?? []
    });
  }
}
const finalSource = await clotho<{
  publication: { currentRevision: number; targetRevision: number };
}>("world.get", { world_id: TEMPORAL_EXPRESSIVENESS_WORLD_ID });
assert(
  finalSource.publication.currentRevision === 2 &&
    finalSource.publication.targetRevision === 2,
  "rejections_do_not_write"
);

const evidence = {
  evidence_version: 2,
  trial: "IP-002 Slice 7 production acceptance before optimization refactor",
  executed_at_utc: new Date().toISOString(),
  application_sha: expectedSha,
  targets: {
    source_world_id: TEMPORAL_EXPRESSIVENESS_WORLD_ID,
    source_canon_id: canonId,
    import_world_id: TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID,
    import_canon_id: importedCanonId
  },
  source_write: {
    bootstrap_validate: bootstrapValidation,
    bootstrap_commit: bootstrapCommit,
    success_validate: {
      valid: successValidation.valid,
      source_revision: successValidation.source_revision,
      plan_digest: successValidation.plan_digest,
      virtual_time_event_count: successValidation.virtual_time_events.length
    },
    success_commit: successCommit,
    exact_replay: replay,
    canon_read_back: {
      source_revision: canon.source_revision,
      event_count: canon.events.length,
      relation_count: canon.relations.length,
      time_system_count: canon.time_systems.length,
      truncated: canon.truncated,
      legacy_shape_absent: true
    }
  },
  virtual_time_event: {
    resolved_twice_same_id:
      resolvedFirst.time_event.id === resolvedSecond.time_event.id,
    persisted: resolvedFirst.time_event.persisted,
    coordinate: resolvedFirst.time_event.coordinate,
    source_revision: resolvedFirst.source_revision,
    exported_event_row_count: exported.snapshot.events.filter((event) =>
      event.id.startsWith("time-event://")
    ).length
  },
  source_projection: {
    source_revision: sourceProjection.source_revision,
    served_revision: sourcePointer.served_revision,
    semantic_digest: sourceProjection.semantic_digest,
    algorithm_version: sourceProjection.algorithm_version,
    assertions: sourceProjectionAssertions
  },
  atropos: {
    source_pointer: sourcePointer,
    source_accessible_text: true,
    source_revision_json: true,
    import_pointer: importPointer,
    import_revision_json: true
  },
  round_trip: {
    package: {
      format: packageRead.manifest.format,
      format_version: packageRead.manifest.format_version,
      source_revision: packageRead.manifest.source_revision,
      completeness: packageRead.manifest.completeness,
      bytes: worldPackage.bytes.length
    },
    source_fingerprint: sourceFingerprint,
    import_fingerprint_after_inverse_mapping: importFingerprint,
    equal: true,
    id_mapping: importClone.id_mapping,
    import_validate: importValidation,
    import_commit: importCommit
  },
  rejections: rejectionEvidence,
  verdict: "pass"
};

await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", {
  flag: "wx"
});
process.stdout.write(
  `temporal production E2E passed; sha=${expectedSha}; fingerprint=${sourceFingerprint.digest}\n`
);
