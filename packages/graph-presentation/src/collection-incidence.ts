/** Shared, browser-safe Collection incidence relaxation. Temporal geometry is supplied by the caller. */
import type {
  LayoutInput,
  LayoutOutput,
  LayoutShape
} from "./layout-engine.js";
import { chronologyYearToWorldY } from "./urdr-chart-plane.js";

export interface IncidenceMetadata {
  readonly formatVersion: "collection-incidence/1";
  readonly events: readonly {
    readonly id: string;
    readonly childIds: readonly string[];
    readonly collectionIds: readonly string[];
  }[];
  readonly collections: readonly {
    readonly id: string;
    readonly eventIds: readonly string[];
  }[];
  readonly relations: readonly {
    readonly id: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly type: string;
  }[];
}
export type IncidenceContext = IncidenceMetadata & {
  readonly input: LayoutInput;
};
export type IncidenceCandidate =
  "relation-only" | "global-incidence" | "local-incidence";
export interface Parameters {
  iterations: number;
  windowYears: number;
  spacing: number;
  cohesion: number;
  relation: number;
  smoothing: number;
  stability: number;
}
export const defaults: Parameters = {
  iterations: 90,
  windowYears: 24,
  spacing: 32,
  cohesion: 0.7,
  relation: 0.35,
  smoothing: 0.12,
  stability: 20
};
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
export function shapeCenter(s: LayoutShape) {
  return s.kind === "point"
    ? s.position
    : s.kind === "segment"
      ? { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 }
      : {
          x: (s.bounds.minX + s.bounds.maxX) / 2,
          y: (s.bounds.minY + s.bounds.maxY) / 2
        };
}
interface Node {
  id: string;
  x: number;
  y: number;
  year: number;
  prior: number | null;
  memberships: readonly string[];
  primitive: boolean;
}
interface Hub {
  id: string;
  collection: string;
  bin: number;
  x: number;
  members: { i: number; weight: number }[];
  weights: Map<number, number>;
  mass: number;
}

/** Keeps repaired temporal coordinates, segment durations and unplaced IDs from the real engine.
 * Composite X envelopes are rederived bottom-up from all authored children, not memberships. */
export function replaceX(
  snapshot: IncidenceContext,
  base: LayoutOutput,
  positions: ReadonlyMap<string, number>,
  algorithmVersion = "incidence/1"
): LayoutOutput {
  const original = new Map(base.shapes.map((s) => [s.event_id, s]));
  const events = new Map(snapshot.events.map((e) => [e.id, e]));
  const result = new Map<string, LayoutShape>();
  const visiting = new Set<string>();
  const visit = (id: string): LayoutShape | undefined => {
    const cached = result.get(id);
    if (cached) return cached;
    const s = original.get(id);
    if (!s || visiting.has(id)) return undefined;
    visiting.add(id);
    let next: LayoutShape = s;
    const x = positions.get(id) ?? shapeCenter(s).x;
    if (s.kind === "point") next = { ...s, position: { ...s.position, x } };
    else if (s.kind === "segment") {
      const dx = x - shapeCenter(s).x;
      next = {
        ...s,
        start: { ...s.start, x: s.start.x + dx },
        end: { ...s.end, x: s.end.x + dx }
      };
    } else {
      const cs = (events.get(id)?.childIds ?? []).flatMap((c) => {
        const value = visit(c);
        return value ? [value] : [];
      });
      if (cs.length) {
        const ranges = cs.map((c) =>
          c.kind === "region"
            ? c.bounds
            : c.kind === "point"
              ? { minX: c.position.x, maxX: c.position.x }
              : {
                  minX: Math.min(c.start.x, c.end.x),
                  maxX: Math.max(c.start.x, c.end.x)
                }
        );
        next = {
          ...s,
          bounds: {
            ...s.bounds,
            minX: Math.min(...ranges.map((c) => c.minX)) - 10,
            maxX: Math.max(...ranges.map((c) => c.maxX)) + 10
          }
        };
      }
    }
    visiting.delete(id);
    result.set(id, next);
    return next;
  };
  return {
    ...base,
    algorithm_version: algorithmVersion,
    shapes: base.shapes.flatMap((s) => {
      const value = visit(s.event_id);
      return value ? [value] : [];
    })
  };
}

export function relaxIncidence(
  snapshot: IncidenceContext,
  candidate: IncidenceCandidate,
  parameters: Parameters,
  base: LayoutOutput,
  previous?: LayoutOutput
): {
  output: LayoutOutput;
  centers: { collection: string; year: number; x: number; count: number }[];
} {
  if (
    Object.values(parameters).some((v) => !Number.isFinite(v)) ||
    parameters.windowYears <= 0 ||
    parameters.spacing <= 0 ||
    parameters.iterations < 0 ||
    parameters.iterations > 256 ||
    !Number.isInteger(parameters.iterations) ||
    [
      parameters.cohesion,
      parameters.relation,
      parameters.smoothing,
      parameters.stability
    ].some((v) => v < 0)
  )
    throw Error("research_parameters_invalid");
  const metadata = new Map(snapshot.events.map((e) => [e.id, e]));
  const priors = new Map(
    previous?.shapes.map((s) => [s.event_id, shapeCenter(s).x]) ?? []
  );
  const yearScale =
    chronologyYearToWorldY(snapshot.input.board, 1) -
    chronologyYearToWorldY(snapshot.input.board, 0);
  const epoch = chronologyYearToWorldY(snapshot.input.board, 0);
  const primitiveIds = new Set(
    base.shapes.filter((s) => s.kind !== "region").map((s) => s.event_id)
  );
  const sets = new Map(
    snapshot.collections.map((c) => [
      c.id,
      new Set(c.eventIds.filter((id) => primitiveIds.has(id)))
    ])
  );
  const subsetCache = new Map<string, boolean>();
  const redundant = (large: string, small: string) => {
    const key = large + "|" + small;
    const known = subsetCache.get(key);
    if (known !== undefined) return known;
    const a = sets.get(large)!,
      b = sets.get(small)!;
    const value = b.size < a.size && [...b].every((id) => a.has(id));
    subsetCache.set(key, value);
    return value;
  };
  const nodes: Node[] = base.shapes
    .map((s) => {
      const p = shapeCenter(s);
      const all = metadata.get(s.event_id)?.collectionIds ?? [];
      // Remove strictly redundant supersets from layout influence only. Original membership remains intact.
      const effective = all.filter(
        (c) => !all.some((d) => d !== c && redundant(c, d))
      );
      return {
        id: s.event_id,
        x:
          priors.get(s.event_id) ??
          (hashUnit(s.event_id) - 0.5) * parameters.spacing * 8,
        y: p.y,
        year: (p.y - epoch) / yearScale,
        prior: priors.get(s.event_id) ?? null,
        memberships: effective,
        primitive: s.kind !== "region"
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const hubMap = new Map<string, Hub>();
  if (candidate !== "relation-only")
    nodes.forEach((n, i) => {
      if (!n.primitive) return;
      const t = n.year / parameters.windowYears;
      const b = Math.floor(t);
      const f = t - b;
      const bins =
        candidate === "global-incidence"
          ? [[0, 1]]
          : [
              [b, 1 - f],
              [b + 1, f]
            ];
      for (const c of [...n.memberships].sort())
        for (const [bin, weight] of bins) {
          if (weight! <= 0.001) continue;
          const id = c + ":" + bin;
          let h = hubMap.get(id);
          if (!h) {
            h = {
              id,
              collection: c,
              bin: bin!,
              x: 0,
              members: [],
              weights: new Map(),
              mass: 0
            };
            hubMap.set(id, h);
          }
          h.members.push({ i, weight: weight! });
          h.weights.set(i, weight!);
          h.mass += weight!;
        }
    });
  const hubs = [...hubMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const h of hubs)
    h.x = h.members.reduce((s, m) => s + nodes[m.i]!.x * m.weight, 0) / h.mass;
  const bins = new Map<number, Hub[]>();
  const contexts = new Map<string, Hub[]>();
  for (const h of hubs) {
    const bs = bins.get(h.bin) ?? [];
    bs.push(h);
    bins.set(h.bin, bs);
    const cs = contexts.get(h.collection) ?? [];
    cs.push(h);
    contexts.set(h.collection, cs);
  }
  const continuity: [Hub, Hub][] = [];
  for (const hs of contexts.values()) {
    hs.sort((a, b) => a.bin - b.bin);
    for (let i = 1; i < hs.length; i++)
      if (hs[i]!.bin - hs[i - 1]!.bin <= 1)
        continuity.push([hs[i - 1]!, hs[i]!]);
  }
  // Sparse incidence and authored graph, never all pairs of Events.
  const links = [...snapshot.relations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((r) => {
      const a = index.get(r.sourceId),
        b = index.get(r.targetId);
      if (a === undefined || b === undefined) return [];
      const scale =
        r.type === "contains"
          ? 0.75
          : r.type === "causes"
            ? 1
            : r.type === "precedes"
              ? 0.25
              : 0;
      const dt =
        Math.abs(nodes[a]!.year - nodes[b]!.year) / parameters.windowYears;
      return scale ? [{ a, b, weight: scale / (1 + dt * dt) }] : [];
    });
  const ordered = nodes
    .map((n, i) => ({ n, i }))
    .filter((v) => v.n.primitive)
    .sort((a, b) => a.n.y - b.n.y || a.n.id.localeCompare(b.n.id));
  const peers: { a: number; b: number; target: number }[] = [];
  for (let a = 0; a < ordered.length; a++)
    for (let b = a + 1; b < Math.min(ordered.length, a + 17); b++) {
      const dt =
        Math.abs(ordered[a]!.n.year - ordered[b]!.n.year) /
        (parameters.windowYears / 8);
      if (dt >= 1) break;
      peers.push({
        a: ordered[a]!.i,
        b: ordered[b]!.i,
        target: parameters.spacing * (1 - dt)
      });
    }
  const distinctness = new Map<string, number>();
  const diversity = (a: Hub, b: Hub) => {
    const key = a.id + "|" + b.id;
    const cached = distinctness.get(key);
    if (cached !== undefined) return cached;
    const smaller = a.members.length < b.members.length ? a : b,
      other = smaller === a ? b : a;
    let common = 0;
    for (const m of smaller.members)
      common += Math.min(m.weight, other.weights.get(m.i) ?? 0);
    const value = Math.max(0, 1 - common / Math.min(a.mass, b.mass));
    distinctness.set(key, value);
    return value;
  };
  for (let iteration = 0; iteration < parameters.iterations; iteration++) {
    const force = new Float64Array(nodes.length),
      normal = new Float64Array(nodes.length).fill(1);
    const hf = new Map<Hub, number>(hubs.map((h) => [h, 0]));
    for (const h of hubs) {
      let mean = 0;
      for (const m of h.members) {
        const n = nodes[m.i]!;
        const w =
          (parameters.cohesion * m.weight) / Math.max(1, n.memberships.length);
        force[m.i]! += w * (h.x - n.x);
        normal[m.i]! += w;
        mean += n.x * m.weight;
      }
      hf.set(h, parameters.cohesion * (mean / h.mass - h.x));
    }
    for (const hs of bins.values()) {
      // Bounded local hub peers; many-Collection complexity is not hidden as C².
      const sorted = [...hs].sort(
        (a, b) => a.x - b.x || a.id.localeCompare(b.id)
      );
      for (let a = 0; a < sorted.length; a++)
        for (let b = a + 1; b < Math.min(sorted.length, a + 25); b++) {
          const one = sorted[a]!,
            two = sorted[b]!,
            d = diversity(one, two);
          const target =
            parameters.spacing *
            (Math.sqrt(one.mass) + Math.sqrt(two.mass)) *
            d;
          const gap = two.x - one.x;
          if (gap >= target) continue;
          const push = Math.min(parameters.spacing * 2, (target - gap) * 0.45);
          hf.set(one, hf.get(one)! - push);
          hf.set(two, hf.get(two)! + push);
        }
    }
    for (const [a, b] of continuity) {
      const v = (b.x - a.x) * parameters.smoothing;
      hf.set(a, hf.get(a)! + v);
      hf.set(b, hf.get(b)! - v);
    }
    for (const l of links) {
      const w = parameters.relation * l.weight;
      const v =
        Math.max(
          -parameters.spacing * 3,
          Math.min(parameters.spacing * 3, nodes[l.b]!.x - nodes[l.a]!.x)
        ) * w;
      force[l.a]! += v;
      force[l.b]! -= v;
      normal[l.a]! += w;
      normal[l.b]! += w;
    }
    for (const pair of peers) {
      const gap = nodes[pair.b]!.x - nodes[pair.a]!.x;
      const distance = Math.abs(gap);
      if (distance >= pair.target) continue;
      const sign =
        gap === 0
          ? nodes[pair.a]!.id < nodes[pair.b]!.id
            ? 1
            : -1
          : Math.sign(gap);
      const push = sign * (pair.target - distance) * 0.35;
      force[pair.a]! -= push;
      force[pair.b]! += push;
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.prior !== null) {
        force[i]! += parameters.stability * (n.prior - n.x);
        normal[i]! += parameters.stability;
      }
      const step = Math.max(
        -parameters.spacing,
        Math.min(parameters.spacing, force[i]! / normal[i]!)
      );
      n.x += step * 0.35;
    }
    for (const h of hubs)
      h.x +=
        Math.max(
          -parameters.spacing,
          Math.min(parameters.spacing, hf.get(h)!)
        ) * 0.35;
  }
  const output = replaceX(
    snapshot,
    base,
    new Map(nodes.map((n) => [n.id, n.x])),
    `${candidate}/1`
  );
  const meanYear =
    nodes.reduce((sum, n) => sum + n.year, 0) / Math.max(1, nodes.length);
  const centers = hubs.map((h) => ({
    collection: h.collection,
    year:
      candidate === "global-incidence"
        ? meanYear
        : h.bin * parameters.windowYears,
    x: h.x,
    count: h.mass
  }));
  return { output, centers };
}
