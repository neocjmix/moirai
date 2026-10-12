/** Frozen whole-World product experiment; never writes canonical data or pointers. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadHistorySnapshot,
  replayBaseline,
  OBSERVED_FIXTURE_SHA256,
  sha256
} from "./baseline.js";
import {
  buildTstlComparison,
  constructSingleRunContours,
  type TstlComparisonArtifact
} from "./candidate.js";
import type { BaselineArtifact } from "./baseline.js";
import type {
  TstlExperimentArtifact,
  TstlExperimentBox
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

export function exportProductExperiment(
  baseline: BaselineArtifact,
  comparison: TstlComparisonArtifact
): TstlExperimentArtifact {
  if (!baseline.bounds) throw Error("tstl_product_empty_baseline");
  if (
    baseline.provenance.snapshotInputDigest !== comparison.source.inputDigest ||
    baseline.layout.revision !== comparison.source.revision ||
    baseline.layout.world_id !== comparison.source.worldId ||
    baseline.provenance.sourceRootDigest !== comparison.source.sourceRootDigest
  )
    throw Error("tstl_product_source_mismatch");
  const constructed = constructSingleRunContours(
    comparison.projection,
    comparison.a.events,
    comparison.projection.compositeIds
  );
  const contoursByCompositeId: TstlExperimentArtifact["a"]["contoursByCompositeId"] =
    Object.fromEntries(
      comparison.projection.compositeIds.map((id) => [id, []])
    );
  const frame = comparison.referenceFrame;
  for (const region of constructed.geometry.patches.flatMap(
    (patch) => patch.regions
  )) {
    contoursByCompositeId[region.compositeId]!.push(
      region.points.map((point) => ({
        x: point.x,
        y: point.y / frame.scale + frame.sourceYOrigin
      }))
    );
  }
  const xByEventId = Object.fromEntries(
    comparison.a.events.map((event) => [event.eventId, event.x])
  );
  const worldBoundsByCompositeId: Record<string, TstlExperimentBox> = {};
  for (const event of comparison.a.events) {
    if (event.baselineShape.kind !== "region") continue;
    const members = comparison.projection.descendants[event.eventId] ?? [];
    const xs = [event.x, ...members.map((id) => xByEventId[id]!)];
    worldBoundsByCompositeId[event.eventId] = {
      ...event.baselineShape.bounds,
      minX: Math.min(...xs),
      maxX: Math.max(...xs)
    };
  }
  const all = Object.values(contoursByCompositeId).flat(2);
  const bounds = {
    minX: Math.min(
      baseline.bounds.minX,
      ...comparison.a.events.map((event) => event.x),
      ...all.map((point) => point.x)
    ),
    maxX: Math.max(
      baseline.bounds.maxX,
      ...comparison.a.events.map((event) => event.x),
      ...all.map((point) => point.x)
    ),
    minY: Math.min(baseline.bounds.minY, ...all.map((point) => point.y)),
    maxY: Math.max(baseline.bounds.maxY, ...all.map((point) => point.y))
  };
  const noAreaCompositeIds = comparison.projection.compositeIds.filter(
    (id) => !contoursByCompositeId[id]!.length
  );
  return {
    formatVersion: "tstl-product-experiment/1",
    source: {
      ...comparison.source,
      fixtureSha256: OBSERVED_FIXTURE_SHA256,
      temporalProvenance: "legacy-scalar-only"
    },
    bounds,
    collections: comparison.snapshot.collections.map((collection) => ({
      ...collection,
      eventIds: [...collection.eventIds]
    })),
    b0Primitives: baseline.primitives,
    a: {
      algorithmVersion: "tstl-a-restricted-full-world/1",
      xByEventId,
      contoursByCompositeId,
      worldBoundsByCompositeId,
      noAreaCompositeIds
    },
    stats: {
      events: comparison.projection.eventIds.length,
      composites: comparison.projection.compositeIds.length,
      candidateAreaComposites:
        comparison.projection.compositeIds.length - noAreaCompositeIds.length,
      candidateFragments: Object.values(contoursByCompositeId).reduce(
        (sum, rings) => sum + rings.length,
        0
      ),
      multiRunBands: constructed.multiRunBands
    },
    limitations: [
      "Experimental fills are visible for evaluation; they are not certified membership areas.",
      "The restricted A model optimizes X only; its single-run contours leave multi-run bands empty.",
      "Every Composite uses the same candidate construction; Composites without an area use a point.",
      "Original Event Y and Composite temporal bounds are preserved. The scalar fixture does not establish the original temporal semantics.",
      "History revision 56 is frozen. Detail reads require the served revision to remain 56."
    ]
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const snapshot = loadHistorySnapshot();
  const baseline = replayBaseline(snapshot).artifact;
  const comparison = buildTstlComparison(snapshot, baseline).artifact;
  const artifact = exportProductExperiment(baseline, comparison);
  const body = JSON.stringify(artifact) + "\n";
  const hash = sha256(body);
  const relative = `/labs/tstl/r56-${hash.slice(0, 16)}.json`;
  const target = resolve("apps/atropos-web/public" + relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  const pin = resolve("apps/atropos-web/src/lib/tstl-experiment-pin.ts");
  writeFileSync(
    pin,
    `/** Generated by scripts/tstl-research/export-product.ts. */\nexport const TSTL_EXPERIMENT_ASSET_URL = ${JSON.stringify(relative)};\nexport const TSTL_EXPERIMENT_SHA256 = ${JSON.stringify(hash)};\n`
  );
  if (sha256(readFileSync(target)) !== hash)
    throw Error("tstl_product_export_write_mismatch");
  console.log(
    JSON.stringify({
      target,
      sha256: hash,
      bytes: Buffer.byteLength(body),
      stats: artifact.stats
    })
  );
}
