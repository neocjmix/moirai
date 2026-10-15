/** Read-only IP-017 evidence. No solver, publication or canonical writes.
 * node_modules/.bin/tsx --tsconfig apps/atropos-web/tsconfig.json scripts/tstl-research/organic-evidence.ts [OUTPUT_DIR]
 * Add ORGANIC_SCREENSHOTS=1 to capture each exact SVG in Chromium.
 * Deterministic JSON/SVG artifacts complement the actual GraphShell screenshots;
 * the isolated SVGs are explicitly labelled and are not production UI evidence.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { areaD, FillRule, intersectD } from "clipper2-ts";
import { candidateExperimentPrimitives } from "../../apps/atropos-web/src/lib/tstl-experiment-client.js";
import {
  organicExperimentGeometry,
  organicReproduction
} from "../../apps/atropos-web/src/lib/organic-experiment.js";
import {
  buildOrganicSurfaces,
  DEFAULT_ORGANIC_SURFACE_PARAMETERS,
  ORGANIC_SURFACE_REFERENCE_METRIC,
  padOrganicSurfaceContours,
  type OrganicSurfacePoint,
  type OrganicSurfaceResult
} from "../../apps/atropos-web/src/lib/organic-surface.js";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "../../apps/atropos-web/src/lib/tstl-experiment-pin.js";
import type { TstlExperimentArtifact } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
import type { ResolvedRenderPrimitive } from "../../apps/atropos-web/src/lib/v5-render-density.js";

type Point = OrganicSurfacePoint;
type Rings = Point[][];
type Box = { minX: number; maxX: number; minY: number; maxY: number };
const output = resolve(process.argv[2] ?? ".artifacts/organic-surface");
mkdirSync(output, { recursive: true });
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => sha(JSON.stringify(value));
const writeJson = (name: string, value: unknown) =>
  writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n");
const bytes = readFileSync(
  "apps/atropos-web/public" + TSTL_EXPERIMENT_ASSET_URL
);
assert.equal(sha(bytes), TSTL_EXPERIMENT_SHA256, "immutable product asset SHA");
const artifact = JSON.parse(bytes.toString()) as TstlExperimentArtifact;
const artifactBefore = digest(artifact);
const frozen = candidateExperimentPrimitives(artifact, "anchored");
const frozenBefore = digest(frozen);
const result = buildOrganicSurfaces({ primitives: frozen });
assert.equal(
  digest(frozen),
  frozenBefore,
  "engine does not mutate frozen input"
);
assert.equal(
  digest(artifact),
  artifactBefore,
  "engine does not mutate artifact"
);
assert.equal(result.composites.length, 109);
assert.equal(result.diagnostics.nonmemberIntersections, 0);
assert.equal(result.diagnostics.baseNonmemberIntersections, 0);

const invariants: Record<string, unknown> = {};
for (const display of ["base", "padded", "overlay"] as const) {
  const actual = organicExperimentGeometry(frozen, result, display);
  assert.deepEqual(actual.candidate.xByEventId, artifact.anchored.xByEventId);
  assert.deepEqual(
    actual.candidate.worldBoundsByCompositeId,
    artifact.anchored.worldBoundsByCompositeId
  );
  assert.deepEqual(
    actual.primitives.map((p) => p.id),
    frozen.map((p) => p.id)
  );
  for (let index = 0; index < frozen.length; index++) {
    const before = frozen[index]!,
      after = actual.primitives[index]!;
    if (!before.composite)
      assert.deepEqual(
        after,
        before,
        `${display}: exact event/relation primitive`
      );
    else {
      assert.deepEqual(
        after.composite?.anchor,
        before.composite.anchor,
        `${display}: original Composite anchor`
      );
      assert.deepEqual(
        after.composite?.worldBounds,
        before.composite.worldBounds,
        `${display}: original semantic bounds`
      );
      assert.deepEqual(
        after.composite?.paddingProfile,
        before.composite.paddingProfile,
        `${display}: original local nesting`
      );
      assert.deepEqual(after.collectionIds, before.collectionIds);
      assert.deepEqual(after.parentCompositeIds, before.parentCompositeIds);
      assert.deepEqual(after.ancestorCompositeIds, before.ancestorCompositeIds);
      assert.deepEqual(
        after.composite?.childEventIds,
        before.composite.childEventIds
      );
    }
  }
  invariants[display] = {
    identities: "exact",
    eventXY: "exact",
    compositeAnchors: "exact",
    semanticBounds: "exact",
    relationPrimitives: "exact",
    collectionsAndContains: "exact"
  };
}
const geometryAudit = (contours: Record<string, Rings>) => {
  let components = 0,
    holes = 0,
    vertices = 0;
  for (const rings of Object.values(contours))
    for (const ring of rings) {
      assert(ring.length >= 3);
      assert(
        ring.every(
          (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
        )
      );
      const area = areaD(ring);
      assert(Math.abs(area) > 1e-8, "nondegenerate serialized ring");
      if (area > 0) components++;
      else holes++;
      vertices += ring.length;
    }
  return { components, holes, vertices, finite: true };
};
const baseAudit = geometryAudit(result.baseContoursByCompositeId);
const paddedAudit = geometryAudit(result.paddedContoursByCompositeId);
assert.equal(baseAudit.holes, result.diagnostics.baseHoles);
assert.equal(paddedAudit.holes, result.diagnostics.paddedHoles);
const metric = (rings: Rings): Rings =>
  rings.map((ring) =>
    ring.map(({ x, y }) => ({
      x,
      y: y * ORGANIC_SURFACE_REFERENCE_METRIC.scaleY
    }))
  );
const overlapArea = (a: Rings, b: Rings) =>
  Math.abs(
    intersectD(metric(a), metric(b), FillRule.NonZero, 5).reduce(
      (sum, ring) => sum + areaD(ring),
      0
    )
  );
const distanceToBoundary = (point: Point, rings: Rings) => {
  let minimum = Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = dx * dx + dy * dy;
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)
          )
        : 0;
      minimum = Math.min(
        minimum,
        Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
      );
    }
  return minimum;
};
const clearanceSample = (base: Rings, padded: Rings) => {
  const points = metric(base).flat(),
    boundary = metric(padded);
  const distances = points
    .filter(
      (_, index) => index % Math.max(1, Math.ceil(points.length / 160)) === 0
    )
    .map((point) => distanceToBoundary(point, boundary))
    .sort((a, b) => a - b);
  return {
    samples: distances.length,
    minimum: distances[0] ?? null,
    median: distances[Math.floor(distances.length / 2)] ?? null,
    maximum: distances.at(-1) ?? null,
    meaning:
      "Nearest final boundary in the fixed reference metric; includes nonmember cuts. Sampling does not certify every boundary point."
  };
};

const ids = {
  korea: "01a123a1-0000-751e-9e64-e7c7b6b89fbc",
  japan: "01a123a1-0000-77c0-8401-4f9db460625b",
  china: "01a1240c-0000-73dd-bea1-64db15136c48",
  imjin: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
  yi: "1f10a329-835d-79b1-a9c3-ae1835934b8b",
  first: "01a10a3f-05d2-7a5c-8c94-278b6468252b",
  sorties: "01a10a3f-05d2-7b2b-a4b0-64ca30604418",
  operation: "01a107ff-8b3c-7f88-bac7-a721ce10410a",
  hansan: "01a107ff-8b3c-75eb-bc17-7166e9061e76",
  jeongyu: "01a10a3f-05d2-73a0-84d4-bba33bbf662c"
};
const names = new Map(frozen.map((p) => [p.entity.id, p.label]));
const relationId = "01a10817-869d-759e-88e5-fa3975c5eebd";
const longRelation = frozen.find((p) => p.entity.id === relationId)!;
assert(longRelation?.geometry.kind === "line");
assert(
  result.composites
    .find((entry) => entry.compositeId === ids.yi)
    ?.relationIds.includes(relationId)
);
const overlapPairs = [
  [ids.korea, ids.japan],
  [ids.yi, ids.jeongyu],
  [ids.imjin, ids.china]
].map(([a, b]) => ({
  owners: [a!, b!],
  titles: [names.get(a!), names.get(b!)],
  baseMetricArea: overlapArea(
    result.baseContoursByCompositeId[a!]!,
    result.baseContoursByCompositeId[b!]!
  ),
  paddedMetricArea: overlapArea(
    result.paddedContoursByCompositeId[a!]!,
    result.paddedContoursByCompositeId[b!]!
  )
}));
assert(
  overlapPairs.every((pair) => pair.baseMetricArea > 0),
  "actual shared memberships retain overlapping regions"
);

const rectangle: Rings = [
  [
    { x: -60, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 300 },
    { x: -60, y: 300 }
  ]
];
const profile = [
  { minY: 0, maxY: 100, depth: 1 },
  { minY: 100, maxY: 200, depth: 3 },
  { minY: 200, maxY: 300, depth: 1 }
];
const paddedRectangle = padOrganicSurfaceContours(rectangle, profile, 1);
const horizontalLimits = (rings: Rings, y: number) => {
  const xs = rings.flatMap((ring) =>
    ring.flatMap((a, index) => {
      const b = ring[(index + 1) % ring.length]!;
      return (a.y <= y && b.y > y) || (b.y <= y && a.y > y)
        ? [a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)]
        : [];
    })
  );
  return { minX: Math.min(...xs), maxX: Math.max(...xs) };
};
const measuredClearance = [50, 150, 250].map((y, index) => {
  const limits = horizontalLimits(paddedRectangle, y),
    expected = index === 1 ? 21 : 11;
  assert(Math.abs(-60 - limits.minX - expected) < 0.001);
  assert(Math.abs(limits.maxX - 60 - expected) < 0.001);
  return { y, expected, left: -60 - limits.minX, right: limits.maxX - 60 };
});
assert.deepEqual(padOrganicSurfaceContours(rectangle, profile, 0), rectangle);

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const colors = [
  "#20a799",
  "#f29e4c",
  "#7483e8",
  "#d46bb2",
  "#54a1dc",
  "#b6a13d"
];
const path = (
  rings: readonly (readonly Point[])[],
  box: Box,
  width: number,
  height: number
) =>
  rings
    .map(
      (ring) =>
        ring
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${(((p.x - box.minX) / (box.maxX - box.minX)) * width).toFixed(4)},${(((p.y - box.minY) / (box.maxY - box.minY)) * height).toFixed(4)}`
          )
          .join(" ") + " Z"
    )
    .join(" ");
function comparisonSvg(
  name: string,
  owners: string[],
  box: Box,
  source: readonly ResolvedRenderPrimitive[],
  surfaces: OrganicSurfaceResult
) {
  const width = 440,
    height = 620,
    top = 84,
    gutter = 18;
  const columns = [
    "Frozen baseline",
    "Organic base",
    "Organic padded",
    "Base / padded overlay"
  ];
  const original = Object.fromEntries(
    source
      .filter((p) => owners.includes(p.entity.id))
      .map((p) => [
        p.entity.id,
        p.geometry.kind === "polygon" ? p.geometry.rings : []
      ])
  );
  const header = `<text x="18" y="25" font-size="18" fill="#e7ecef">${escape(name)} · isolated final contour comparison</text><text x="18" y="47" font-size="12" fill="#aebcc4">Identical frozen XY and viewport in all panels. Points include all source leaves. This SVG is not GraphShell UI evidence.</text>`;
  const panels = columns
    .map((label, column) => {
      const x = gutter + column * (width + gutter);
      const shapes = owners
        .map((id, index) => {
          const rings =
            column === 0
              ? (original[id] ?? [])
              : column === 1
                ? (surfaces.baseContoursByCompositeId[id] ?? [])
                : (surfaces.paddedContoursByCompositeId[id] ?? []);
          const shape = `<path d="${path(rings, box, width, height)}" fill="${colors[index % colors.length]}" fill-opacity=".22" stroke="${colors[index % colors.length]}" stroke-width="1.2" fill-rule="evenodd"/>`;
          return (
            shape +
            (column === 3
              ? `<path d="${path(surfaces.baseContoursByCompositeId[id] ?? [], box, width, height)}" fill="none" stroke="#ed92cd" stroke-width=".8" fill-rule="evenodd"/>`
              : "")
          );
        })
        .join("");
      const points = source
        .filter((p) => p.entity.kind === "event" && p.geometry.kind === "point")
        .map((p) => {
          assert(p.geometry.kind === "point");
          const q = p.geometry.xy;
          return `<circle cx="${((q.x - box.minX) / (box.maxX - box.minX)) * width}" cy="${((q.y - box.minY) / (box.maxY - box.minY)) * height}" r="2.1" fill="#eaf4fa"><title>${escape(p.label ?? p.entity.id)}</title></circle>`;
        })
        .join("");
      return `<text x="${x}" y="73" fill="#e7ecef" font-size="13">${label}</text><svg x="${x}" y="${top}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#10232d"/>${shapes}${points}</svg>`;
    })
    .join("");
  const legend = owners
    .map(
      (id, index) =>
        `<text x="18" y="${top + height + 25 + index * 20}" font-size="13" fill="${colors[index % colors.length]}">${escape(names.get(id) ?? id)} · ${escape(id)}</text>`
    )
    .join("");
  writeFileSync(
    resolve(output, name + ".svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${gutter + columns.length * (width + gutter)}" height="${top + height + 40 + owners.length * 20}" font-family="sans-serif"><rect width="100%" height="100%" fill="#091720"/>${header}${panels}${legend}</svg>`
  );
}
// A small explicit relation graph exposes split/rejoin, a genuine enclosed hole
// and an unrelated island together. Coordinates are fixed in the same metric.
const syntheticPositions: Record<string, Point> = {
  top: { x: 0, y: -100 },
  left: { x: -80, y: 0 },
  right: { x: 80, y: 0 },
  bottom: { x: 0, y: 100 },
  island: { x: 260, y: 0 }
};
const topologyPrimitives: ResolvedRenderPrimitive[] = Object.entries(
  syntheticPositions
).map(([id, p]) => ({
  id: `event:${id}`,
  entity: { kind: "event", id },
  label: id,
  geometry: { kind: "point", xy: { x: p.x, y: p.y * 5 } },
  bounds: { minX: p.x, maxX: p.x, minY: p.y * 5, maxY: p.y * 5 },
  collectionIds: ["fixture-collection"],
  ancestorCompositeIds: ["fixture-owner"],
  lod: { visible: [0, 20], groupId: id }
}));
for (const [index, [a, b]] of [
  ["top", "left"],
  ["top", "right"],
  ["left", "bottom"],
  ["right", "bottom"]
].entries()) {
  const points = [syntheticPositions[a!]!, syntheticPositions[b!]!].map(
    (p) => ({ x: p.x, y: p.y * 5 })
  );
  topologyPrimitives.push({
    id: `relation:r${index}`,
    entity: { kind: "relation", id: `r${index}` },
    geometry: { kind: "line", paths: [points] },
    label: "precedes",
    collectionIds: ["fixture-collection"],
    endpointIds: [a!, b!],
    bounds: {
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y))
    },
    lod: { visible: [0, 20], groupId: `r${index}` }
  });
}
const fixtureBounds = { minX: -100, maxX: 280, minY: -600, maxY: 600 };
topologyPrimitives.push({
  id: "composite:fixture-owner",
  entity: { kind: "composite", id: "fixture-owner" },
  label: "Branch, rejoin, hole and island",
  geometry: { kind: "polygon", rings: [] },
  bounds: fixtureBounds,
  collectionIds: ["fixture-collection"],
  lod: { visible: [0, 20], groupId: "fixture-owner" },
  composite: {
    childEventIds: Object.keys(syntheticPositions),
    supportComplete: true,
    worldBounds: fixtureBounds,
    depth: 1,
    anchor: { x: 80, y: 0 },
    paddingProfile: [{ minY: -600, maxY: 600, depth: 1 }]
  }
});
const topologyParameters = {
  ...DEFAULT_ORGANIC_SURFACE_PARAMETERS,
  radiusX: 30,
  radiusY: 50,
  levelScale: 0,
  relationWidth: 14
};
const topologyResult = buildOrganicSurfaces({
  primitives: topologyPrimitives,
  parameters: topologyParameters
});
assert.equal(topologyResult.composites[0]!.baseComponents, 2);
assert.equal(topologyResult.composites[0]!.baseHoles, 1);
assert.equal(topologyResult.diagnostics.memberCoverageFailures, 0);
assert.equal(topologyResult.diagnostics.nonmemberIntersections, 0);
assert.equal(
  digest(
    buildOrganicSurfaces({
      primitives: topologyPrimitives,
      parameters: topologyParameters
    })
  ),
  digest(topologyResult),
  "deterministic complete fixture output"
);
const unpaddedTopology = buildOrganicSurfaces({
  primitives: topologyPrimitives,
  parameters: { ...topologyParameters, paddingScale: 0 }
});
assert.deepEqual(
  unpaddedTopology.baseContoursByCompositeId,
  topologyResult.baseContoursByCompositeId,
  "padding cannot alter node field or base boundary"
);
assert.deepEqual(
  unpaddedTopology.paddedContoursByCompositeId,
  unpaddedTopology.baseContoursByCompositeId
);
const noRelationsTopology = buildOrganicSurfaces({
  primitives: topologyPrimitives,
  parameters: { ...topologyParameters, relationStrength: 0 }
});
assert.equal(
  noRelationsTopology.composites[0]!.baseComponents,
  5,
  "unlinked nodes remain separate; only authored paths connect the field"
);
comparisonSvg(
  "topology-branch-hole-island",
  ["fixture-owner"],
  { minX: -140, maxX: 340, minY: -750, maxY: 750 },
  topologyPrimitives,
  topologyResult
);
writeJson("topology.json", {
  primitives: topologyPrimitives,
  parameters: topologyParameters,
  result: topologyResult,
  ablations: {
    withoutPadding: unpaddedTopology.diagnostics,
    withoutRelations: noRelationsTopology.diagnostics
  },
  deterministicRepeat: true,
  baseUnaffectedByPadding: true
});
const views = [
  {
    name: "historical-imjin",
    owners: [ids.korea, ids.japan, ids.imjin, ids.yi],
    box: { minX: -450, maxX: 850, minY: 222520, maxY: 224320 }
  },
  {
    name: "historical-nested-hansan",
    owners: [
      ids.imjin,
      ids.first,
      ids.sorties,
      ids.operation,
      ids.hansan,
      ids.yi
    ],
    box: { minX: -100, maxX: 650, minY: 222750, maxY: 223150 }
  },
  {
    name: "historical-shared-long-relation",
    owners: [ids.jeongyu, ids.china, ids.yi],
    box: { minX: -350, maxX: 750, minY: 223650, maxY: 224050 }
  }
];
for (const view of views) {
  comparisonSvg(view.name, view.owners, view.box, frozen, result);
  const box = view.box;
  const camera = `${(box.minX + box.maxX) / 2},${(box.minY + box.maxY) / 2},${box.maxX - box.minX},${box.maxY - box.minY}`;
  writeJson(
    view.name + ".repro.json",
    organicReproduction(
      "anchored",
      result.parameters,
      "overlay",
      "?gsViewport=" + camera
    )
  );
}
writeJson("geometry.json", {
  baseContoursByCompositeId: result.baseContoursByCompositeId,
  paddedContoursByCompositeId: result.paddedContoursByCompositeId
});
writeJson(
  "reproduction.json",
  organicReproduction(
    "anchored",
    result.parameters,
    "overlay",
    "?gsViewport=260,223420,650,1800"
  )
);
const evidence = {
  format: "organic-surface-evidence/1",
  source: artifact.source,
  artifact: { path: TSTL_EXPERIMENT_ASSET_URL, sha256: TSTL_EXPERIMENT_SHA256 },
  baseline: "anchored",
  algorithmVersion: result.algorithmVersion,
  parameters: DEFAULT_ORGANIC_SURFACE_PARAMETERS,
  referenceMetric: ORGANIC_SURFACE_REFERENCE_METRIC,
  invariantChecks: invariants,
  digests: {
    frozenPrimitives: frozenBefore,
    xy: digest(artifact.anchored.xByEventId),
    semanticBounds: digest(artifact.anchored.worldBoundsByCompositeId),
    baseContours: digest(result.baseContoursByCompositeId),
    paddedContours: digest(result.paddedContoursByCompositeId)
  },
  baseAudit,
  paddedAudit,
  diagnostics: result.diagnostics,
  composites: result.composites,
  actualSharedCompositeOverlap: overlapPairs,
  historicalClearanceSamples: [
    ...new Set(views.flatMap((view) => view.owners))
  ].map((id) => ({
    id,
    title: names.get(id),
    ...clearanceSample(
      result.baseContoursByCompositeId[id]!,
      result.paddedContoursByCompositeId[id]!
    )
  })),
  measuredClearanceFixture: {
    profile,
    samples: measuredClearance,
    zeroPaddingPreservesBase: true
  },
  topologyCounterexample: {
    visual: "topology-branch-hole-island.svg",
    data: "topology.json",
    diagnostics: topologyResult.diagnostics,
    withoutRelations: noRelationsTopology.diagnostics,
    deterministicRepeat: true,
    baseUnaffectedByPadding: true
  },
  longRelation: {
    id: relationId,
    endpoints: longRelation.endpointIds,
    geometry: longRelation.geometry
  },
  visualExports: views,
  limitations: result.limitations,
  acceptance:
    "Machine geometry checks and isolated SVG evidence only; actual GraphShell screenshots and user visual approval are separate."
};
writeJson("evidence.json", evidence);
writeJson("review-summary.json", {
  ...evidence,
  composites: result.composites.map((entry) => ({
    id: entry.compositeId,
    title: names.get(entry.compositeId),
    baseComponents: entry.baseComponents,
    paddedComponents: entry.paddedComponents,
    baseHoles: entry.baseHoles,
    paddedHoles: entry.paddedHoles,
    paddingDepths: entry.paddingDepths,
    paddingClearanceDeficitArea: entry.paddingClearanceDeficitArea,
    missingMembers: entry.paddedMissingMemberIds.length,
    nonmemberIntersections: entry.paddedNonmemberIntersections
  }))
});
writeFileSync(
  resolve(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Organic Surface evidence</title><style>body{background:#091720;color:#e7ecef;font:16px system-ui;margin:20px}img{max-width:100%;border:1px solid #365260}a{color:#8dded6}</style><h1>Organic Surface · fixed Anchored XY</h1><p>These isolated exports compare identical geometry and cameras; use the deployed GraphShell for interaction and visual acceptance.</p>${views.map((v) => `<p><a href="${v.name}.svg">${v.name}</a> · <a href="${v.name}.repro.json">Reproduction JSON</a></p><img src="${v.name}.svg" alt="${v.name}">`).join("")}<p><a href="topology.json">Topology counterexample and ablations</a></p><img src="topology-branch-hole-island.svg" alt="Constructed branch, rejoin, hole and island"><p><a href="evidence.json">Machine evidence</a> · <a href="reproduction.json">Default reproduction</a></p></html>`
);
if (process.env.ORGANIC_SCREENSHOTS === "1") {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1850, height: 900 },
      deviceScaleFactor: 1
    });
    for (const name of [
      ...views.map((view) => view.name),
      "topology-branch-hole-island"
    ]) {
      await page.goto(pathToFileURL(resolve(output, name + ".svg")).href);
      const height = await page.evaluate(() =>
        Number(document.documentElement.getAttribute("height"))
      );
      await page.screenshot({
        path: resolve(output, name + ".png"),
        clip: { x: 0, y: 0, width: 1850, height },
        timeout: 120000
      });
    }
  } finally {
    await browser.close();
  }
}
console.log(
  JSON.stringify(
    { output, baseAudit, paddedAudit, diagnostics: result.diagnostics },
    null,
    2
  )
);
