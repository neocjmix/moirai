/** Synthetic v5 read profile. No production store or credentials. */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import type { CanonicalState } from "@moirai/contracts/v5";
import {
  buildV5WorldSpatialStagedArtifacts,
  buildV5WorldCompleteArtifacts,
  readV5SelectedViewport,
  buildV5WorldLayout,
  buildV5SpatialIndex
} from "@moirai/graph-presentation/server";
import {
  projectV5WorldTemporal,
  buildV5ContentPages
} from "@moirai/projections";

const count = Number(process.argv[2] ?? 1000);
const density = process.argv[3] ?? "sparse";
if (
  ![1000, 10000, 100000].includes(count) ||
  !["sparse", "dense", "shared", "large"].includes(density)
)
  throw Error(
    "usage: ip011-a4-profile.ts 1000|10000|100000 sparse|dense|shared|large"
  );
const id = (i: number) => `event-${String(i).padStart(6, "0")}`;
const worldId = "a4-synthetic-world";
const local = density === "dense" ? 300 : 12;
const members = density === "large" ? count : local;
const coordinate = (i: number) => {
  const year = i < local ? 1453 : 2000 + (Math.floor((i - local) / 366) % 20);
  const day =
    i < local ? (density === "dense" ? 1 : i + 1) : ((i - local) % 28) + 1;
  return `${year}-01-${String(day).padStart(2, "0")}T00:00:00.000000000000Z`;
};
const events = Array.from({ length: count }, (_, i) => ({
  id: id(i),
  world_id: worldId,
  slug: null,
  title: id(i),
  summary: null,
  roles: [],
  attributes: {}
}));
const state: CanonicalState = {
  world: { id: worldId, slug: "a4", title: "Synthetic", description: null },
  collections: ["a", "b"].map((c) => ({
    id: c,
    world_id: worldId,
    slug: c,
    title: c,
    description: null
  })),
  events,
  eventCollectionMemberships: events.flatMap((event, i) =>
    i < members
      ? [
          { event_id: event.id, collection_id: "a" },
          ...(density === "shared"
            ? [{ event_id: event.id, collection_id: "b" }]
            : [])
        ]
      : []
  ),
  relations: events.map((event, i) => ({
    id: `date-${id(i)}`,
    world_id: worldId,
    type: "coincides" as const,
    direction: "undirected" as const,
    source_ref: { kind: "event" as const, event_id: event.id },
    target_ref: {
      kind: "time_event" as const,
      time_system_ref: { time_system_id: "gregorian" },
      definition_version: "1",
      coordinate: coordinate(i)
    },
    attributes: {}
  })),
  narratives: [
    ...events.map((event) => ({
      id: `n-${event.id}`,
      world_id: worldId,
      scope_type: "event" as const,
      scope_id: event.id,
      locale: "ko",
      title: null,
      body: "Synthetic event",
      public_references: [],
      notes: []
    })),
    ...["a", "b"].map((c) => ({
      id: `n-${c}`,
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: c,
      locale: "ko",
      title: null,
      body: "Synthetic collection",
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [
    {
      id: "gregorian",
      world_id: worldId,
      slug: "gregorian",
      title: "Gregorian",
      kind: "calendar",
      definition_version: "1",
      definition: {
        coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
        calendar: "proleptic-gregorian",
        timezone: "UTC",
        fractional_digits: 12,
        leap_second_policy: "reject",
        interval_policy: "half-open",
        capabilities: [
          "canonicalize",
          "equality",
          "compare",
          "boundary",
          "difference"
        ]
      }
    }
  ],
  collectionTimeSystems: []
};
const started = performance.now();
const phases: Record<string, number | string> = {};
if (process.env.A4_PHASES === "1") {
  let phaseStart = performance.now();
  const temporal = projectV5WorldTemporal(state, 31);
  phases.temporal_ms = +(performance.now() - phaseStart).toFixed(2);
  phaseStart = performance.now();
  const layout = buildV5WorldLayout(state, temporal, "gregorian");
  phases.layout_ms = +(performance.now() - phaseStart).toFixed(2);
  phases.layout_digest = createHash("sha256")
    .update(JSON.stringify(layout))
    .digest("hex");
  if (
    process.env.A4_EXPECT_LAYOUT_SHA &&
    phases.layout_digest !== process.env.A4_EXPECT_LAYOUT_SHA
  )
    throw Error("a4_layout_regression");
  phaseStart = performance.now();
  buildV5SpatialIndex(layout);
  phases.spatial_index_ms = +(performance.now() - phaseStart).toFixed(2);
  phaseStart = performance.now();
  buildV5ContentPages(state, 31);
  phases.content_ms = +(performance.now() - phaseStart).toFixed(2);
  if (process.env.A4_ONLY_PHASES === "1") {
    process.stdout.write(JSON.stringify({ count, density, phases }) + "\n");
    process.exit(0);
  }
}
const artifacts =
  process.env.A4_COMPLETE === "1"
    ? (await buildV5WorldCompleteArtifacts(state, 31)).artifacts
    : buildV5WorldSpatialStagedArtifacts(state, 31);
const buildMs = performance.now() - started;
const objects = new Map(
  [...artifacts.documents, ...artifacts.index].map(({ key, body }) => [
    key,
    body
  ])
);
const manifest = JSON.parse(
  artifacts.documents.find(({ key }) =>
    key.endsWith("/spatial/gregorian/manifest.json")
  )!.body
);
const localLeaf = artifacts.documents
  .filter(({ key }) => key.includes("/spatial/gregorian/nodes/0/"))
  .map(({ body }) => JSON.parse(body))
  .find((node) =>
    node.entries.some(
      (entry: { shape: { event_id: string } }) => entry.shape.event_id === id(0)
    )
  );
if (!localLeaf) throw Error("local_shape_missing");
const example = localLeaf.entries.find(
  (entry: { shape: { event_id: string } }) => entry.shape.event_id === id(0)
).bounds;
// The renderer may use a normalized axis rather than calendar years. Derive
// the local viewport from the first synthetic Event, then keep it fixed for N.
const viewport =
  density === "dense"
    ? { minX: -100000, maxX: 100000, minY: 203419, maxY: 203422 }
    : { minX: -724, maxX: -721, minY: 203419, maxY: 203422 };
const collectionIds = density === "shared" ? ["a", "b"] : ["a"];
const samples = [];
for (let n = 0; n < 3; n++) {
  let reads = 0,
    bytes = 0;
  const t = performance.now();
  const result = await readV5SelectedViewport(
    artifacts.root.body,
    worldId,
    31,
    "gregorian",
    viewport,
    collectionIds,
    null,
    async (key) => {
      const body = objects.get(key) ?? null;
      reads++;
      bytes += body ? Buffer.byteLength(body) : 0;
      return body;
    }
  );
  samples.push({
    ms: +(performance.now() - t).toFixed(2),
    reads,
    bytes,
    shapes: result.shapes.length,
    continuation: result.next_cursor !== null,
    response_bytes: Buffer.byteLength(JSON.stringify(result))
  });
}
process.stdout.write(
  JSON.stringify({
    count,
    density,
    local,
    members,
    build_ms: +buildMs.toFixed(2),
    artifact_bytes: [...objects.values()].reduce(
      (size, body) => size + Buffer.byteLength(body),
      0
    ),
    documents: artifacts.documents.length,
    index_nodes: artifacts.index.length,
    manifest_depth: manifest.depth,
    viewport,
    local_bounds: example,
    phases,
    rss_mb: Math.round(process.memoryUsage().rss / 1048576),
    samples
  }) + "\n"
);
