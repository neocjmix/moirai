import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { createFixtureState, snapshotFromState } from "./fixtures.js";
import { solve, defaults, type Candidate } from "./engine.js";
import { metrics, displacement } from "./metrics.js";
import { scaleFixture } from "./scale-fixture.js";
import { validateLabSnapshot } from "../../apps/atropos-web/src/labs/layout/snapshot-validation.js";
import { layoutGeometry } from "../../apps/atropos-web/src/labs/layout/geometry.js";
const candidates: Candidate[] = [
  "legacy-force",
  "deterministic-slots",
  "relation-only",
  "global-incidence",
  "local-incidence"
];
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const primary = ["context-0", "context-1", "context-2", "context-3"];
const benchmarkEngineDigest = hash(
  readFileSync("scripts/layout-research/engine.ts", "utf8")
);
const quality = [];
const scales = [];
const previousMeasurements = process.argv.includes("--quality-only")
  ? (JSON.parse(
      readFileSync("scripts/layout-research/measurements.json", "utf8")
    ) as {
      parameters: typeof defaults;
      scales: unknown[];
      benchmarkEngineDigest?: string;
    })
  : null;
if (
  previousMeasurements &&
  JSON.stringify(previousMeasurements.parameters) !== JSON.stringify(defaults)
)
  throw Error("Cannot reuse benchmarks after parameter changes");
if (
  previousMeasurements?.benchmarkEngineDigest &&
  previousMeasurements.benchmarkEngineDigest !== benchmarkEngineDigest
)
  throw Error("Cannot reuse benchmarks after engine source changes");
const changing = snapshotFromState(createFixtureState());
for (const mode of ["changing", "independent", "dense-shared", "history-r56"]) {
  const snapshot = validateLabSnapshot(
    mode === "history-r56"
      ? JSON.parse(
          readFileSync("scripts/layout-research/data/history-r56.json", "utf8")
        )
      : snapshotFromState(createFixtureState(mode as "changing"))
  );
  const evaluation =
    mode === "history-r56"
      ? snapshot.collections
          .filter((c) => ["한국사", "일본사", "중국사"].includes(c.title))
          .map((c) => c.id)
      : primary;
  for (const candidate of candidates) {
    const result = solve(snapshot, candidate);
    const start = performance.now();
    layoutGeometry(snapshot, result.output);
    const geometryMs = performance.now() - start;
    quality.push({
      fixture: mode,
      candidate,
      inputDigest: snapshot.inputDigest,
      shapeDigest: hash(result.output.shapes),
      computeMs: result.computeMs,
      geometryMs,
      ...metrics(snapshot, result.output, defaults, evaluation)
    });
  }
}
const old = solve(changing, "local-incidence").output,
  updated = snapshotFromState(createFixtureState("changing", true));
const updates = [0, 2, 20].map((stability) => ({
  stability,
  ...displacement(
    old,
    solve(
      updated,
      "local-incidence",
      { ...defaults, stability },
      stability ? old : undefined
    ).output
  )
}));
const sensitivity = [12, 24, 48].flatMap((windowYears) =>
  [0, 0.12, 0.5].map((smoothing) => {
    const result = solve(changing, "local-incidence", {
      ...defaults,
      windowYears,
      smoothing
    });
    return {
      windowYears,
      smoothing,
      ...metrics(changing, result.output, defaults, primary)
    };
  })
);
const seeds = [13013, 23013, 33013].map((seed) => {
  const snapshot = snapshotFromState(
    createFixtureState("changing", false, seed)
  );
  return {
    seed,
    ...metrics(
      snapshot,
      solve(snapshot, "local-incidence").output,
      defaults,
      primary
    )
  };
});
const ablation = [0.35, 0.7, 1.4].flatMap((cohesion) =>
  [0, 0.35, 0.7].map((relation) => {
    const result = solve(changing, "local-incidence", {
      ...defaults,
      cohesion,
      relation
    });
    return {
      cohesion,
      relation,
      ...metrics(changing, result.output, defaults, primary)
    };
  })
);
// Membership-only counterfactual: unchanged canonical IDs, temporal input and authored edges.
const reducedEvents = changing.events.map((e) => {
  const contexts = e.collectionIds.filter((c) => c.startsWith("context-"));
  return contexts.length > 1
    ? {
        ...e,
        collectionIds: e.collectionIds
          .filter((c) => !c.startsWith("context-") || c === contexts[0])
          .filter((c) => c !== "contact-subset")
      }
    : e;
});
const counterfactual = {
  ...changing,
  events: reducedEvents,
  collections: changing.collections.map((c) => ({
    ...c,
    eventIds: reducedEvents
      .filter((e) => e.collectionIds.includes(c.id))
      .map((e) => e.id)
  }))
};
const epoch = changing.input.board.axis.startYear;
void epoch;
const locality = candidates.map((candidate) => {
  const a = solve(counterfactual, candidate).output,
    b = solve(changing, candidate).output;
  const byId = new Map(a.shapes.map((s) => [s.event_id, s]));
  const extents = new Map(
    changing.input.explicitExtents.map((e) => [e.eventId, e])
  );
  const near: number[] = [],
    far: number[] = [];
  for (const s of b.shapes) {
    if (s.kind !== "point") continue;
    const old = byId.get(s.event_id);
    const extent = extents.get(s.event_id);
    if (!old || old.kind !== "point" || !extent) continue;
    const year = extent.minYear;
    const dx = Math.abs(old.position.x - s.position.x);
    if (year >= 1580 && year <= 1680) near.push(dx);
    else if (year < 1530 || year > 1740) far.push(dx);
  }
  const mean = (xs: number[]) =>
    xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
  return {
    candidate,
    nearMeanX: mean(near),
    farMeanX: mean(far),
    nearSamples: near.length,
    farSamples: far.length,
    description:
      "Remove extra primary memberships and contact-subset membership of shared Events; keep all Events, temporal constraints and authored links."
  };
});
for (const n of previousMeasurements ? [] : [1000, 10000, 100000]) {
  const snapshot = scaleFixture(n, changing);
  if (n === 1000) validateLabSnapshot(snapshot);
  for (const candidate of [
    "legacy-force",
    "deterministic-slots",
    "global-incidence",
    "local-incidence"
  ] as Candidate[]) {
    const times: number[] = [];
    let placed = 0;
    for (let repeat = 0; repeat < 3; repeat++) {
      const result = solve(snapshot, candidate);
      times.push(result.computeMs);
      placed = result.output.shapes.length;
    }
    scales.push({
      events: n,
      candidate,
      placed,
      timesMs: times,
      medianMs: [...times].sort((a, b) => a - b)[1]
    });
    console.log("scale", n, candidate, times);
  }
}
if (previousMeasurements) scales.push(...previousMeasurements.scales);
const result = {
  benchmarkEngineDigest,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    platform: process.platform
  },
  parameters: defaults,
  evaluation: {
    primary,
    metricWindowYears: 24,
    scaleIncludes:
      "prepared LayoutInput -> computeLayout (temporal geometry) -> research solve -> Composite bounds; excludes canonical projection, browser worker transfer, hull mesh, renderer, labels, tile publication",
    scaleRepeats: 3,
    qualityRunTiming: "single run; not benchmark"
  },
  quality,
  updates,
  sensitivity,
  seeds,
  ablation,
  locality,
  scales
};
writeFileSync(
  "scripts/layout-research/measurements.json",
  JSON.stringify(result, null, 2) + "\n"
);
console.log("wrote measurements.json");
