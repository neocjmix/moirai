import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
import type { LayoutOutput } from "../../packages/graph-presentation/src/layout-engine.js";
import { chronologyYearToWorldY } from "../../packages/graph-presentation/src/urdr-chart-plane.js";
import { shapeCenter, type Parameters } from "./engine.js";
import { layoutGeometry } from "../../apps/atropos-web/src/labs/layout/geometry.js";
const q = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};
export function displacement(before: LayoutOutput, after: LayoutOutput) {
  const old = new Map(
    before.shapes
      .filter((s) => s.kind !== "region")
      .map((s) => [s.event_id, shapeCenter(s)])
  );
  const dx: number[] = [];
  let maxY = 0;
  for (const s of after.shapes) {
    if (s.kind === "region") continue;
    const p = old.get(s.event_id);
    if (!p) continue;
    const v = shapeCenter(s);
    dx.push(Math.abs(v.x - p.x));
    maxY = Math.max(maxY, Math.abs(v.y - p.y));
  }
  return {
    meanX: dx.reduce((s, v) => s + v, 0) / Math.max(1, dx.length),
    p95X: q(dx, 0.95),
    maxX: Math.max(0, ...dx),
    maxY,
    compared: dx.length
  };
}

/** Diagnostic, not a perceptual score. Core overlap excludes genuinely shared nodes.
 * Primary groups are declared evaluation views; they never enter the solver. */
export function metrics(
  snapshot: LabSnapshot,
  output: LayoutOutput,
  p: Parameters,
  primary: readonly string[]
) {
  const metadata = new Map(snapshot.events.map((e) => [e.id, e]));
  const origin = chronologyYearToWorldY(snapshot.input.board, 0),
    unit = chronologyYearToWorldY(snapshot.input.board, 1) - origin;
  const points = output.shapes
    .filter((s) => s.kind !== "region")
    .map((s) => {
      const pos = shapeCenter(s);
      return {
        id: s.event_id,
        ...pos,
        year: (pos.y - origin) / unit,
        groups: (metadata.get(s.event_id)?.collectionIds ?? []).filter((c) =>
          primary.includes(c)
        )
      };
    });
  const exclusive = points.filter((v) => v.groups.length === 1);
  let mixing = 0,
    samples = 0;
  const groupMixing = new Map<string, { sum: number; n: number }>();
  for (const e of exclusive) {
    const neighbors = exclusive
      .filter((o) => o !== e && Math.abs(o.year - e.year) <= p.windowYears / 2)
      .map((o) => ({
        o,
        d: Math.hypot(
          (o.x - e.x) / p.spacing,
          (o.year - e.year) / (p.windowYears / 8)
        )
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    if (neighbors.length) {
      const value =
        neighbors.filter((v) => v.o.groups[0] !== e.groups[0]).length /
        neighbors.length;
      mixing += value;
      const group = groupMixing.get(e.groups[0]!) ?? { sum: 0, n: 0 };
      group.sum += value;
      group.n++;
      groupMixing.set(e.groups[0]!, group);
      samples++;
    }
  }
  const bins = new Map<number, Map<string, number[]>>();
  for (const e of exclusive) {
    const key = Math.floor(e.year / p.windowYears);
    const bin = bins.get(key) ?? new Map<string, number[]>();
    const xs = bin.get(e.groups[0]!) ?? [];
    xs.push(e.x);
    bin.set(e.groups[0]!, xs);
    bins.set(key, bin);
  }
  let overlap = 0,
    pairs = 0;
  let components = 0,
    coreBins = 0;
  for (const b of bins.values()) {
    const groups = [...b.values()].filter((xs) => xs.length >= 3);
    for (const values of groups) {
      const xs = [...values].sort((a, b) => a - b);
      components +=
        1 + xs.slice(1).filter((v, i) => v - xs[i]! > 2 * p.spacing).length;
      coreBins++;
    }
    for (let a = 0; a < groups.length; a++)
      for (let j = a + 1; j < groups.length; j++) {
        const loA = q(groups[a]!, 0.1) - p.spacing / 2,
          hiA = q(groups[a]!, 0.9) + p.spacing / 2,
          loB = q(groups[j]!, 0.1) - p.spacing / 2,
          hiB = q(groups[j]!, 0.9) + p.spacing / 2;
        overlap +=
          Math.max(0, Math.min(hiA, hiB) - Math.max(loA, loB)) /
          Math.min(hiA - loA, hiB - loB);
        pairs++;
      }
  }
  const index = new Map(points.map((e) => [e.id, e]));
  const causal: { a: (typeof points)[number]; b: (typeof points)[number] }[] =
    [];
  let gap = 0,
    edges = 0;
  for (const r of snapshot.relations) {
    if (r.type !== "causes") continue;
    const a = index.get(r.sourceId),
      b = index.get(r.targetId);
    if (a && b) {
      causal.push({ a, b });
      gap += Math.abs(a.x - b.x) / p.spacing;
      edges++;
    }
  }
  const turn = (
    a: (typeof points)[number],
    b: (typeof points)[number],
    c: (typeof points)[number]
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  let crossings = 0,
    edgePairs = 0;
  for (let i = 0; i < causal.length; i++)
    for (let j = i + 1; j < causal.length; j++) {
      const a = causal[i]!,
        b = causal[j]!;
      if ([a.a.id, a.b.id].some((id) => id === b.a.id || id === b.b.id))
        continue;
      edgePairs++;
      if (
        turn(a.a, a.b, b.a) * turn(a.a, a.b, b.b) < 0 &&
        turn(b.a, b.b, a.a) * turn(b.a, b.b, a.b) < 0
      )
        crossings++;
    }
  const memo = new Map<string, Set<string>>();
  const descendants = (id: string): Set<string> => {
    const known = memo.get(id);
    if (known) return known;
    const ids = new Set<string>();
    memo.set(id, ids);
    for (const child of metadata.get(id)?.childIds ?? []) {
      ids.add(child);
      for (const nested of descendants(child)) ids.add(nested);
    }
    return ids;
  };
  let intruders = 0,
    contained = 0;
  for (const g of layoutGeometry(snapshot, output)) {
    if (g.kind !== "region" || g.polygon.length < 3) continue;
    const owned = descendants(g.id);
    for (const pnt of points) {
      let inside = false;
      for (let i = 0, j = g.polygon.length - 1; i < g.polygon.length; j = i++) {
        const a = g.polygon[i]!,
          b = g.polygon[j]!;
        if (
          a.y > pnt.y !== b.y > pnt.y &&
          pnt.x < ((b.x - a.x) * (pnt.y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside;
      }
      if (inside) {
        contained++;
        if (!owned.has(pnt.id)) intruders++;
      }
    }
  }
  let near = 0,
    total = 0;
  for (const e of points.filter((e) => e.groups.length > 1)) {
    for (const c of e.groups) {
      const peers = exclusive.filter(
        (o) =>
          o.groups[0] === c && Math.abs(o.year - e.year) < p.windowYears / 2
      );
      if (peers.length) {
        near += Math.min(...peers.map((o) => Math.abs(o.x - e.x))) / p.spacing;
        total++;
      }
    }
  }
  return {
    events: output.shapes.length,
    unplaced: output.unplaced_event_ids.length,
    primitives: points.length,
    shared: points.filter((v) => v.groups.length > 1).length,
    coreMixing: samples ? mixing / samples : null,
    macroCoreMixing: groupMixing.size
      ? [...groupMixing.values()].reduce((sum, g) => sum + g.sum / g.n, 0) /
        groupMixing.size
      : null,
    perCollectionMixing: Object.fromEntries(
      [...groupMixing].map(([id, g]) => [id, g.sum / g.n])
    ),
    localCoreOverlap: pairs ? overlap / pairs : null,
    overlapPairBins: pairs,
    causalHorizontalGap: edges ? gap / edges : null,
    causalCrossings: crossings,
    causalCrossingRate: edgePairs ? crossings / edgePairs : null,
    coreComponents: coreBins ? components / coreBins : null,
    compositeIntruderRate: contained ? intruders / contained : null,
    sharedLocalGap: total ? near / total : null,
    xSpan:
      Math.max(...points.map((v) => v.x)) - Math.min(...points.map((v) => v.x)),
    metricWindowYears: p.windowYears
  };
}
