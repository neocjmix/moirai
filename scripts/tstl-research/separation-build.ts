/** Reproducible isolated diagnostic preview. Does not export production pins. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadHistorySnapshot, replayBaseline, sha256 } from "./baseline.js";
import { buildTstlComparison } from "./candidate.js";
import { buildPositionedBubbleCandidate } from "./candidate-positioned-bubble.js";
import {
  placeSemanticLanes,
  SEMANTIC_LANE_PARAMETERS
} from "./semantic-lanes.js";
import { baselineCandidateCoordinates } from "./smooth-regions.js";
import { alignSemanticLanes } from "./align-semantic-lanes.js";
import { separationMetrics } from "./separation-metrics.js";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "../../apps/atropos-web/src/lib/tstl-experiment-pin.js";
import type {
  TstlExperimentArtifact,
  TstlExperimentCandidate
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

const out = resolve(process.argv[2] ?? ".artifacts/tstl-separation/preview");
mkdirSync(out, { recursive: true });
const snapshot = loadHistorySnapshot();
const baseline = replayBaseline(snapshot).artifact;
const { artifact: comparison } = buildTstlComparison(snapshot, baseline);
const bytes = readFileSync(
  "apps/atropos-web/public" + TSTL_EXPERIMENT_ASSET_URL
);
if (sha256(bytes) !== TSTL_EXPERIMENT_SHA256)
  throw Error("separation_baseline_pin");
const product = JSON.parse(bytes.toString()) as TstlExperimentArtifact;
const coords = baselineCandidateCoordinates(baseline);
const candidate = (positions: Record<string, number>) =>
  buildPositionedBubbleCandidate(baseline, comparison, positions);
const modes: Record<string, TstlExperimentCandidate> = {
  B0: {
    ...product.bubble,
    algorithmVersion: "B0-compiled-hulls",
    contoursByCompositeId: Object.fromEntries(
      comparison.projection.compositeIds.map((id) => [
        id,
        product.b0Primitives
          .filter((p) => p.entity.id === id && p.geometry.kind === "polygon")
          .flatMap((p) =>
            p.geometry.kind === "polygon"
              ? p.geometry.rings.map((r) => [...r])
              : []
          )
      ])
    )
  },
  A: product.a,
  B: product.b,
  C: product.c,
  Bubble: product.bubble,
  Ribbon: product.ribbon
};
const runs: Record<string, unknown> = { originalA: comparison.a.solver };
for (const [name, parameters] of [
  [
    "Lanes-wide",
    {
      ...SEMANTIC_LANE_PARAMETERS,
      supportGap: 14,
      peerGutter: 18,
      rootGutter: 48,
      minimumBandWidth: 56,
      episodeGap: 1e9
    }
  ],
  ["Lanes", SEMANTIC_LANE_PARAMETERS]
] as const) {
  const start = performance.now();
  const run = placeSemanticLanes(
    comparison.projection,
    comparison.b0.events,
    parameters
  );
  const placementMs = performance.now() - start;
  const geometryStart = performance.now();
  modes[name] = candidate(run.positions);
  runs[name] = {
    ...run,
    placementMs,
    regionMs: performance.now() - geometryStart
  };
}
const alignedStart = performance.now();
const aligned = alignSemanticLanes(comparison.projection, comparison.b0.events);
const alignedPlacementMs = performance.now() - alignedStart;
const alignedGeometryStart = performance.now();
modes["Aligned"] = candidate(aligned.positions);
runs["Aligned"] = {
  ...aligned,
  placementMs: alignedPlacementMs,
  regionMs: performance.now() - alignedGeometryStart
};
const anchoredStart = performance.now();
const anchored = alignSemanticLanes(
  comparison.projection,
  comparison.b0.events,
  true
);
const anchoredPlacementMs = performance.now() - anchoredStart;
const anchoredGeometryStart = performance.now();
modes["Anchored"] = candidate(anchored.positions);
runs["Anchored"] = {
  ...anchored,
  placementMs: anchoredPlacementMs,
  regionMs: performance.now() - anchoredGeometryStart
};
const aStart = performance.now();
modes["A-Bubble"] = candidate(product.a.xByEventId);
runs["A-Bubble"] = { regionMs: performance.now() - aStart };
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
const sourceDirty =
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
    .length > 0;
const artifact = {
  sourceCommit,
  sourceDirty,
  source: product.source,
  events: comparison.b0.events.map((e) => ({
    id: e.eventId,
    title: e.title,
    y: coords.positionsByEventId[e.eventId]!.y,
    role: e.role,
    collections: e.collectionIds
  })),
  projection: comparison.projection,
  cases: comparison.cases,
  collections: product.collections,
  modes,
  runs
};
const json = JSON.stringify(artifact);
writeFileSync(
  resolve(out, "metrics.json"),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(modes).map(([name, mode]) => [
        name,
        {
          ...separationMetrics(
            comparison.projection,
            artifact.events,
            mode.xByEventId
          ),
          geometry: name === "B0" ? null : (mode.diagnostics ?? null)
        }
      ])
    ),
    null,
    2
  )
);
writeFileSync(resolve(out, "comparison.json"), json);
writeFileSync(
  resolve(out, "runtime.json"),
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      scope:
        "Offline r56 baseline + A + four regenerated Bubble variants; no browser/device performance claim",
      runs: Object.fromEntries(
        Object.entries(runs).map(([name, run]) => [
          name,
          typeof run === "object" && run
            ? {
                placementMs: Reflect.get(run, "placementMs"),
                regionMs: Reflect.get(run, "regionMs"),
                width: Reflect.get(run, "width")
              }
            : run
        ])
      )
    },
    null,
    2
  )
);
writeFileSync(
  resolve(out, "build.json"),
  JSON.stringify({
    sourceCommit,
    sourceDirty,
    sha256: sha256(json),
    source: product.source
  })
);
copyFileSync(
  "scripts/tstl-research/separation.html",
  resolve(out, "index.html")
);
execFileSync(
  "node_modules/.pnpm/node_modules/esbuild/bin/esbuild",
  [
    "scripts/tstl-research/separation-app.ts",
    "--bundle",
    "--format=esm",
    "--target=es2022",
    "--outfile=" + resolve(out, "app.js")
  ],
  { stdio: "inherit" }
);
console.log(
  JSON.stringify({
    out,
    sourceCommit,
    sourceDirty,
    runs: Object.fromEntries(
      Object.entries(runs).map(([key, r]) => [
        key,
        typeof r === "object" && r
          ? {
              placementMs: Reflect.get(r, "placementMs"),
              regionMs: Reflect.get(r, "regionMs"),
              width: Reflect.get(r, "width")
            }
          : r
      ])
    )
  })
);
