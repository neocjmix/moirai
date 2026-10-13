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
  TstlExperimentCandidate,
  TstlExperimentBox
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

import { placeSemanticLanes } from "./semantic-lanes.js";
import { alignSemanticLanes } from "./align-semantic-lanes.js";
import { buildPositionedBubbleCandidate } from "./candidate-positioned-bubble.js";
import { buildCandidateB } from "./candidate-b.js";
import { buildCandidateC } from "./candidate-c.js";
import { buildBubbleCandidate } from "./candidate-bubble.js";
import { buildRibbonCandidate } from "./candidate-ribbon.js";
import type { TstlAlternativeGeometry } from "./candidate-bc-types.js";

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
  const a: TstlExperimentCandidate = {
    algorithmVersion: "tstl-a-restricted-full-world/1",
    xByEventId,
    contoursByCompositeId,
    worldBoundsByCompositeId,
    noAreaCompositeIds: comparison.projection.compositeIds.filter(
      (id) => !contoursByCompositeId[id]!.length
    )
  };
  const alternatives = [
    buildCandidateB(comparison),
    buildCandidateC(comparison)
  ];
  const convert = (value: TstlAlternativeGeometry): TstlExperimentCandidate => {
    const sourcePoint = (point: { x: number; y: number }) => ({
      x: point.x,
      y: point.y / frame.scale + frame.sourceYOrigin
    });
    for (const id of comparison.projection.compositeIds)
      if (!value.contoursByCompositeId[id] || !value.tracesByCompositeId[id])
        throw Error("tstl_alternative_owner_missing");
    const seen = new Set<string>();
    for (const membership of value.memberships) {
      const key = `${membership.compositeId}:${membership.eventId}`;
      if (
        seen.has(key) ||
        !comparison.projection.ancestors[membership.eventId]?.includes(
          membership.compositeId
        ) ||
        (membership.status === "list" && !membership.reason)
      )
        throw Error("tstl_alternative_membership_invalid");
      seen.add(key);
    }
    for (const id of comparison.projection.leafIds)
      for (const owner of comparison.projection.ancestors[id]!)
        if (!seen.has(`${owner}:${id}`))
          throw Error("tstl_alternative_membership_missing");
    const contours = Object.fromEntries(
      Object.entries(value.contoursByCompositeId).map(([id, rings]) => [
        id,
        rings.map((ring) => ring.map(sourcePoint))
      ])
    );
    const traces = Object.fromEntries(
      Object.entries(value.tracesByCompositeId).map(([id, paths]) => [
        id,
        paths.map((trace) => ({
          ...trace,
          points: trace.points.map(sourcePoint)
        }))
      ])
    );
    return {
      algorithmVersion: value.algorithmVersion,
      xByEventId,
      contoursByCompositeId: contours,
      worldBoundsByCompositeId,
      noAreaCompositeIds: comparison.projection.compositeIds.filter(
        (id) => !contours[id]!.length
      ),
      tracesByCompositeId: traces,
      memberships: value.memberships,
      diagnostics: {
        ...value.diagnostics,
        leafMemberships: value.memberships.filter((m) =>
          comparison.projection.leafIds.includes(m.eventId)
        ).length,
        leafRoutedMemberships: value.memberships.filter(
          (m) =>
            m.status === "route" &&
            comparison.projection.leafIds.includes(m.eventId)
        ).length,
        leafListMemberships: value.memberships.filter(
          (m) =>
            m.status === "list" &&
            comparison.projection.leafIds.includes(m.eventId)
        ).length
      },
      limitations: value.limitations
    };
  };
  const b = convert(alternatives[0]!);
  const c = convert(alternatives[1]!);
  const bubble = buildBubbleCandidate(baseline, comparison);
  const ribbon = buildRibbonCandidate(baseline, comparison);
  const lanes = buildPositionedBubbleCandidate(
    baseline,
    comparison,
    placeSemanticLanes(comparison.projection, comparison.b0.events).positions
  );
  const aligned = buildPositionedBubbleCandidate(
    baseline,
    comparison,
    alignSemanticLanes(comparison.projection, comparison.b0.events).positions
  );
  const anchored = buildPositionedBubbleCandidate(
    baseline,
    comparison,
    alignSemanticLanes(comparison.projection, comparison.b0.events, true)
      .positions
  );
  const all = [a, b, c, bubble, ribbon, lanes, aligned, anchored].flatMap(
    (candidate) => [
      ...Object.values(candidate.contoursByCompositeId).flat(2),
      ...Object.values(candidate.tracesByCompositeId ?? {}).flatMap((traces) =>
        traces.flatMap((trace) => trace.points)
      )
    ]
  );
  const bounds = all.reduce<TstlExperimentBox>(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      maxX: Math.max(box.maxX, point.x),
      minY: Math.min(box.minY, point.y),
      maxY: Math.max(box.maxY, point.y)
    }),
    {
      ...baseline.bounds,
      minX: Math.min(
        baseline.bounds.minX,
        ...comparison.a.events.map((event) => event.x)
      ),
      maxX: Math.max(
        baseline.bounds.maxX,
        ...comparison.a.events.map((event) => event.x)
      )
    }
  );
  const noAreaCompositeIds = comparison.projection.compositeIds.filter(
    (id) => !contoursByCompositeId[id]!.length
  );
  return {
    formatVersion: "tstl-product-experiment/4",
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
    a,
    b,
    c,
    bubble,
    ribbon,
    lanes,
    aligned,
    anchored,
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
      "B/C use exactly A Event coordinates; only geometry changes. Routing is bounded and failed links retain exact membership lists.",
      "B is a restricted terminal forest, without a split/rejoin-cycle or global Steiner-optimality claim. C uses open spines and membership traces.",
      "Bubble and ribbon preserve exact B0 Event XY and change only final Composite outlines; compound holes remain empty in every renderer.",
      "Smooth regions are inspired by Bubble Sets and TimeSets, not full reproductions. Final geometric checks do not establish complete semantic arrangement certification.",
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
      stats: artifact.stats,
      b: artifact.b.diagnostics,
      c: artifact.c.diagnostics,
      bubble: artifact.bubble.diagnostics,
      ribbon: artifact.ribbon.diagnostics
    })
  );
}
