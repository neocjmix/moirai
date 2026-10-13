/** Read-only replay of the current B0 compiler. This never publishes or writes history. */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CanonicalState,
  Relation
} from "../../packages/contracts/src/v5.js";
import {
  computeLayout,
  CANONICAL_LAYOUT_SELECTION,
  type LayoutInput
} from "../../packages/graph-presentation/src/layout-engine.js";
import {
  compileV5RenderPublication,
  resolveRenderGeometry,
  type RenderPrimitive,
  type RenderPublication,
  type RenderTile
} from "../../packages/graph-presentation/src/v5-render-publication.js";
import {
  snapshotDigestPayload,
  type LabSnapshot
} from "../../apps/atropos-web/src/labs/layout/types.js";
import { validateLabSnapshot } from "../../apps/atropos-web/src/labs/layout/snapshot-validation.js";

export const BASELINE_SOURCE_SHA = "d721b0efdcf309ed7ad21c55bc04572e2f14d644";
export const HISTORY_FIXTURE_PATH =
  "scripts/layout-research/data/history-r56.json";
export const DOCUMENTED_FIXTURE_SHA256 =
  "b3d846434095c536fc75c5c098ef87d77d18aa00210627b305eac407fc9461ae";
// The handoff byte digest disagrees with the unchanged blob in its own base commit.
// Pin the observed bytes, preserve the source, and keep that discrepancy explicit.
export const OBSERVED_FIXTURE_SHA256 =
  "5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64";
export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const jsonDigest = (value: unknown): string =>
  sha256(JSON.stringify(value));

export function loadHistorySnapshot(): LabSnapshot {
  const bytes = readFileSync(HISTORY_FIXTURE_PATH);
  if (sha256(bytes) !== OBSERVED_FIXTURE_SHA256)
    throw Error("tstl_fixture_bytes_changed");
  const snapshot = validateLabSnapshot(JSON.parse(bytes.toString("utf8")));
  if (sha256(snapshotDigestPayload(snapshot)) !== snapshot.inputDigest)
    throw Error("tstl_snapshot_digest_mismatch");
  return snapshot;
}

/** Match collection-incidence.test.ts exactly: the old input omitted incidence. */
export function reconstructBaselineInput(snapshot: LabSnapshot): LayoutInput {
  return {
    ...snapshot.input,
    incidence: {
      formatVersion: "collection-incidence/1",
      events: snapshot.events,
      collections: snapshot.collections,
      relations: snapshot.relations
    }
  };
}

/** A compiler-only adapter, not a recovered canonical archive. Unavailable
 * temporal records and narratives stay absent; no date semantics are inferred. */
function compilerState(snapshot: LabSnapshot): CanonicalState {
  const relations: Relation[] = snapshot.relations.map((relation) => {
    const type = relation.type;
    if (!["contains", "precedes", "enables", "influences"].includes(type))
      throw Error("tstl_baseline_relation_type_unexpected");
    return {
      id: relation.id,
      world_id: snapshot.worldId,
      type: type as Relation["type"],
      source_ref: { kind: "event", event_id: relation.sourceId },
      target_ref: { kind: "event", event_id: relation.targetId },
      direction: "directed",
      attributes: {}
    };
  });
  return {
    world: {
      id: snapshot.worldId,
      slug: "history-r56-replay",
      title: snapshot.worldTitle,
      description: null
    },
    events: snapshot.events.map((event) => ({
      id: event.id,
      world_id: snapshot.worldId,
      title: event.title,
      slug: null,
      summary: null,
      roles: [],
      attributes: {}
    })),
    collections: snapshot.collections.map((collection) => ({
      id: collection.id,
      world_id: snapshot.worldId,
      slug: collection.id,
      title: collection.title,
      description: null
    })),
    eventCollectionMemberships: snapshot.events.flatMap((event) =>
      event.collectionIds.map((id) => ({
        event_id: event.id,
        collection_id: id
      }))
    ),
    relations,
    timeSystems: [],
    collectionTimeSystems: [],
    narratives: []
  };
}

export type BaselinePrimitive = Omit<RenderPrimitive, "geometry"> & {
  readonly geometry: Exclude<RenderPrimitive["geometry"], { kind: "external" }>;
};

/** Collapse tile replicas and resolve the compiler's immutable geometry bytes.
 * All levels are inspected: an omitted primitive at one LOD is not lost here. */
export function collectBaselinePrimitives(
  publication: RenderPublication
): BaselinePrimitive[] {
  const documents = new Map(
    publication.geometryDocuments.map((d) => [d.key, d.body])
  );
  const primitives = new Map<string, BaselinePrimitive>();
  const replicas = new Map<string, string>();
  for (const document of publication.documents) {
    const tile = JSON.parse(document.body) as RenderTile;
    for (const primitive of tile.primitives) {
      const serialized = JSON.stringify(primitive);
      const old = replicas.get(primitive.id);
      if (old) {
        if (old !== serialized) throw Error("tstl_baseline_replica_mismatch");
        continue;
      }
      replicas.set(primitive.id, serialized);
      const geometry =
        primitive.geometry.kind === "external"
          ? resolveRenderGeometry(
              publication,
              primitive,
              documents.get(primitive.geometry.key) ?? ""
            )
          : primitive.geometry;
      const resolved = { ...primitive, geometry };
      primitives.set(primitive.id, resolved);
    }
  }
  return [...primitives.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function replayBaseline(snapshot = loadHistorySnapshot()) {
  const start = performance.now();
  const input = reconstructBaselineInput(snapshot);
  const inputMs = performance.now() - start;
  const layoutStart = performance.now();
  const layout = computeLayout(input);
  const layoutMs = performance.now() - layoutStart;
  const compileStart = performance.now();
  const publication = compileV5RenderPublication(
    compilerState(snapshot),
    layout
  );
  const compileMs = performance.now() - compileStart;
  const resolveStart = performance.now();
  const primitives = collectBaselinePrimitives(publication);
  const resolveMs = performance.now() - resolveStart;
  const represented = new Set(
    primitives
      .filter((p) => p.entity.kind !== "relation")
      .map((p) => p.entity.id)
  );
  const layoutShapes = new Map(layout.shapes.map((s) => [s.event_id, s]));
  const boundsRectangleHullCount = primitives.filter((primitive) => {
    const shape = layoutShapes.get(primitive.entity.id);
    if (shape?.kind !== "region" || primitive.geometry.kind !== "polygon")
      return false;
    const b = shape.bounds;
    return (
      JSON.stringify(primitive.geometry.rings) ===
      JSON.stringify([
        [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY }
        ]
      ])
    );
  }).length;
  const artifact = {
    formatVersion: "tstl-baseline/1" as const,
    sourceSha: BASELINE_SOURCE_SHA,
    provenance: {
      fixturePath: HISTORY_FIXTURE_PATH,
      documentedByteSha256: DOCUMENTED_FIXTURE_SHA256,
      observedByteSha256: OBSERVED_FIXTURE_SHA256,
      documentedByteDigestMatches: false,
      disposition:
        "Unchanged fixture matches documentation base and main Git blob; documented digest mismatch remains unresolved.",
      sourceRootDigest: snapshot.sourceRootDigest,
      snapshotInputDigest: snapshot.inputDigest,
      replayInputDigest: jsonDigest(input),
      temporalSupport: "legacy-scalar-only" as const
    },
    selection: CANONICAL_LAYOUT_SELECTION,
    layout,
    primitives,
    bounds: publication.bounds,
    digests: {
      shapes: jsonDigest(layout.shapes),
      layout: jsonDigest(layout),
      renderPrimitives: jsonDigest(primitives),
      publication: jsonDigest(publication)
    },
    counts: {
      events: snapshot.events.length,
      composites: snapshot.events.filter((e) => e.childIds.length > 0).length,
      leaves: snapshot.events.filter((e) => e.childIds.length === 0).length,
      containsEdges: snapshot.relations.filter((r) => r.type === "contains")
        .length,
      relations: snapshot.relations.length,
      collections: snapshot.collections.length,
      collectionMemberships: snapshot.events.reduce(
        (sum, e) => sum + e.collectionIds.length,
        0
      ),
      scalarExtents: input.explicitExtents.length,
      placed: layout.shapes.length,
      unplaced: layout.unplaced_event_ids.length,
      renderEventIds: represented.size,
      renderOmittedEventIds: snapshot.events
        .map((e) => e.id)
        .filter((id) => !represented.has(id)),
      renderPrimitives: primitives.length,
      boundsRectangleHullCount,
      tiles: publication.documents.length,
      externalGeometryDocuments: publication.geometryDocuments.length
    },
    seams: [
      {
        source: "packages/graph-presentation/src/collection-incidence.test.ts",
        contract:
          "Reconstruct missing incidence from outer events, relations and collections before replay."
      },
      {
        source: "packages/graph-presentation/src/layout-engine.ts",
        contract:
          "Current global-incidence/1 emits point/segment/bounds only; regions do not carry contours."
      },
      {
        source: "packages/graph-presentation/src/v5-world-layout.ts",
        contract:
          "Scalar layout input cannot recover exact, uncertain, duration or descendant-span semantics."
      },
      {
        source: "packages/graph-presentation/src/v5-render-publication.ts",
        contract:
          "compileV5RenderPublication rebuilds contains hulls from children, then tiles and externalizes geometry; changing X alone cannot preserve a candidate contour."
      },
      {
        source: "packages/graph-presentation/src/v5-render-hull.ts",
        contract:
          "Existing contains hull is reproduced verbatim; it is not a TSTL membership or exact-atom certificate. In r56, 18 of 109 final hulls equal layout-bounds rectangles: the compiler uses this fallback when resolved child support has fewer than three points."
      }
    ]
  };
  return {
    artifact,
    measurements: {
      inputMs,
      layoutMs,
      compileMs,
      resolveMs,
      totalMs: performance.now() - start,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      coldWarm: "single replay in fresh Node process; OS cache uncontrolled",
      measurementScope:
        "Node offline replay only; no browser, paint or device claim"
    }
  };
}

export type BaselineArtifact = ReturnType<typeof replayBaseline>["artifact"];

/** Baseline diagnostic intentionally uses outlines: no unvalidated semantic fill. */
export function baselineSvg(artifact: BaselineArtifact): string {
  const b = artifact.bounds;
  if (!b) throw Error("tstl_baseline_bounds_missing");
  const escape = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
    );
  const points = (p: readonly { x: number; y: number }[]) =>
    p.map((v) => `${v.x},${v.y}`).join(" ");
  const geometry = artifact.primitives
    .map((p) => {
      const title = `<title>${escape(p.label)} · ${p.entity.id}</title>`;
      if (p.geometry.kind === "point")
        return `<circle cx="${p.geometry.xy.x}" cy="${p.geometry.xy.y}" r="1.4" fill="#0f172a">${title}</circle>`;
      if (p.geometry.kind === "polygon")
        return p.geometry.rings
          .map(
            (ring) =>
              `<polygon points="${points(ring)}" fill="none" stroke="#2563eb" stroke-opacity="0.45" vector-effect="non-scaling-stroke">${title}</polygon>`
          )
          .join("");
      return p.geometry.paths
        .map(
          (path) =>
            `<polyline points="${points(path)}" fill="none" stroke="#64748b" stroke-opacity="0.35" vector-effect="non-scaling-stroke">${title}</polyline>`
        )
        .join("");
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="${b.minX - 10} ${b.minY - 10} ${b.maxX - b.minX + 20} ${b.maxY - b.minY + 20}" role="img" aria-labelledby="title desc"><title id="title">history-r56 B0 global-incidence/1 replay</title><desc id="desc">Existing contains hull outlines; unverified membership areas are not filled. Legacy scalar temporal support only. ${artifact.counts.events} unique Events.</desc><rect x="${b.minX - 10}" y="${b.minY - 10}" width="${b.maxX - b.minX + 20}" height="${b.maxY - b.minY + 20}" fill="#f8fafc"/>${geometry}</svg>\n`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = resolve(process.argv[2] ?? "scripts/tstl-research/evidence");
  mkdirSync(output, { recursive: true });
  const result = replayBaseline();
  writeFileSync(
    resolve(output, "b0.json"),
    JSON.stringify(result.artifact, null, 2) + "\n"
  );
  writeFileSync(resolve(output, "b0.svg"), baselineSvg(result.artifact));
  writeFileSync(
    resolve(output, "b0-measurements.json"),
    JSON.stringify(result.measurements, null, 2) + "\n"
  );
  console.log(
    JSON.stringify(
      {
        output,
        digests: result.artifact.digests,
        counts: result.artifact.counts,
        measurements: result.measurements
      },
      null,
      2
    )
  );
}
