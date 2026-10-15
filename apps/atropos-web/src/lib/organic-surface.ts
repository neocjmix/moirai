/** IP-017: a browser-local surface experiment on immutable input XY.
 * Compact C2 fields are sampled at a declared final-display metric, not tiles.
 * Padding is a separate geometric operation; it never changes a field kernel.
 */
import {
  areaD,
  differenceD,
  EndType,
  FillRule,
  inflatePathsD,
  intersectD,
  JoinType,
  unionD
} from "clipper2-ts";
import type { ResolvedRenderPrimitive } from "./v5-render-density";

export type OrganicSurfacePoint = { x: number; y: number };
type Point = OrganicSurfacePoint;
type Rings = Point[][];
type Box = { minX: number; maxX: number; minY: number; maxY: number };
export interface OrganicSurfaceParameters {
  radiusX: number;
  radiusY: number;
  levelScale: number;
  relationStrength: number;
  relationWidth: number;
  threshold: number;
  paddingScale: number;
  sampleStep: number;
  smoothing: number;
}
export const ORGANIC_SURFACE_REFERENCE_METRIC = {
  scaleX: 1,
  scaleY: 0.2,
  glyphHalfSize: 2.5
} as const;
export const DEFAULT_ORGANIC_SURFACE_PARAMETERS: OrganicSurfaceParameters = {
  radiusX: 55,
  radiusY: 95,
  levelScale: 0.14,
  relationStrength: 1.6,
  relationWidth: 22,
  threshold: 0.35,
  paddingScale: 1,
  sampleStep: 1,
  smoothing: 2
};
export const ORGANIC_SURFACE_PARAMETER_DEFINITIONS: {
  key: keyof OrganicSurfaceParameters;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "radiusX", label: "X kernel radius", min: 8, max: 180, step: 1 },
  { key: "radiusY", label: "Y kernel radius", min: 12, max: 300, step: 1 },
  {
    key: "levelScale",
    label: "Structural level footprint",
    min: 0,
    max: 0.5,
    step: 0.01
  },
  {
    key: "relationStrength",
    label: "Relation adhesion",
    min: 0,
    max: 5,
    step: 0.1
  },
  {
    key: "relationWidth",
    label: "Relation field radius",
    min: 3,
    max: 80,
    step: 1
  },
  {
    key: "threshold",
    label: "Field threshold",
    min: 0.05,
    max: 0.9,
    step: 0.01
  },
  {
    key: "paddingScale",
    label: "Nesting padding multiplier",
    min: 0,
    max: 3,
    step: 0.1
  },
  {
    key: "sampleStep",
    label: "Contour sample spacing",
    min: 0.5,
    max: 2,
    step: 0.25
  },
  {
    key: "smoothing",
    label: "Boundary smoothing passes",
    min: 0,
    max: 3,
    step: 1
  }
];

/** Reject malformed imported settings instead of silently changing a repro. */
export function normalizeOrganicSurfaceParameters(
  input: Partial<OrganicSurfaceParameters> = {}
): OrganicSurfaceParameters {
  const result = { ...DEFAULT_ORGANIC_SURFACE_PARAMETERS };
  for (const { key, min, max } of ORGANIC_SURFACE_PARAMETER_DEFINITIONS) {
    const value = input[key] ?? result[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw Error(`organic_surface_parameter_out_of_range:${key}`);
    result[key] = value;
  }
  if (!Number.isInteger(result.smoothing))
    throw Error("organic_surface_parameter_out_of_range:smoothing");
  return result;
}
export function serializeOrganicSurfaceParameters(
  parameters: OrganicSurfaceParameters
): string {
  return JSON.stringify(normalizeOrganicSurfaceParameters(parameters));
}

export interface OrganicSurfaceCompositeDiagnostics {
  compositeId: string;
  memberEventIds: string[];
  baseComponents: number;
  paddedComponents: number;
  baseHoles: number;
  paddedHoles: number;
  paddingDepths: number[];
  baseMissingMemberIds: string[];
  paddedMissingMemberIds: string[];
  baseNonmemberIntersections: number;
  paddedNonmemberIntersections: number;
  /** Area removed from the requested offset to protect nonmember glyphs. */
  paddingClearanceDeficitArea: number;
  relationIds: string[];
  unsupportedRelationIds: string[];
  fieldSampleSpacing: number;
  baseVertices: number;
  paddedVertices: number;
  warnings: string[];
}
export interface OrganicSurfaceResult {
  algorithmVersion: "organic-anisotropic-field/1";
  parameters: OrganicSurfaceParameters;
  baseContoursByCompositeId: Record<string, Rings>;
  paddedContoursByCompositeId: Record<string, Rings>;
  memberPointsByEventId: Record<string, Point>;
  composites: OrganicSurfaceCompositeDiagnostics[];
  diagnostics: Record<string, number>;
  memberships: {
    compositeId: string;
    eventId: string;
    status: "area" | "list";
    reason?: string;
  }[];
  limitations: string[];
}
const PRECISION = 5;
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const signedArea = (rings: Rings) =>
  Math.abs(rings.reduce((sum, ring) => sum + areaD(ring), 0));
function boundsOf(points: readonly Point[]): Box {
  return points.reduce(
    (box, p) => ({
      minX: Math.min(box.minX, p.x),
      maxX: Math.max(box.maxX, p.x),
      minY: Math.min(box.minY, p.y),
      maxY: Math.max(box.maxY, p.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}
const boxRing = (b: Box): Point[] => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY }
];
function canonical(rings: Rings): Rings {
  return rings
    .filter((ring) => ring.length >= 3 && Math.abs(areaD(ring)) > 1e-8)
    .map((ring) => {
      let first = 0;
      for (let i = 1; i < ring.length; i++)
        if (
          ring[i]!.x < ring[first]!.x ||
          (ring[i]!.x === ring[first]!.x && ring[i]!.y < ring[first]!.y)
        )
          first = i;
      return [...ring.slice(first), ...ring.slice(0, first)];
    })
    .sort(
      (a, b) =>
        Number(areaD(b) > 0) - Number(areaD(a) > 0) ||
        a[0]!.x - b[0]!.x ||
        a[0]!.y - b[0]!.y ||
        Math.abs(areaD(b)) - Math.abs(areaD(a))
    );
}
const normalize = (rings: Rings): Rings =>
  rings.length ? canonical(unionD(rings, [], FillRule.EvenOdd, PRECISION)) : [];
const offset = (rings: Rings, radius: number): Rings =>
  radius > 0 && rings.length
    ? canonical(
        inflatePathsD(
          rings,
          radius,
          JoinType.Round,
          EndType.Polygon,
          2,
          PRECISION,
          0.025
        )
      )
    : rings.map((ring) => ring.map((p) => ({ ...p })));
const kernel = (squared: number) => (squared >= 1 ? 0 : (1 - squared) ** 3);
const distanceSquared = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)
        );
  return (p.x - a.x - dx * t) ** 2 + (p.y - a.y - dy * t) ** 2;
};

/** Dense sampling at the requested final metric resolution. No automatic
 * coarsening, proximity skeleton or synthetic route changes the field. */
function fieldContours(
  nodes: { point: Point; rx: number; ry: number }[],
  paths: Point[][],
  p: OrganicSurfaceParameters
): Rings {
  if (!nodes.length) return [];
  const support = nodes.flatMap(({ point, rx, ry }) => [
    { x: point.x - rx, y: point.y - ry },
    { x: point.x + rx, y: point.y + ry }
  ]);
  if (p.relationStrength > 0)
    for (const path of paths)
      for (const q of path)
        support.push(
          { x: q.x - p.relationWidth, y: q.y - p.relationWidth },
          { x: q.x + p.relationWidth, y: q.y + p.relationWidth }
        );
  const box = boundsOf(support),
    step = p.sampleStep;
  const minX = Math.floor(box.minX / step) * step - step;
  const minY = Math.floor(box.minY / step) * step - step;
  const width = Math.ceil((box.maxX - minX) / step) + 2;
  const height = Math.ceil((box.maxY - minY) / step) + 2;
  const field = new Float64Array(width * height);
  const visit = (b: Box, sample: (point: Point) => number) => {
    const startX = Math.max(0, Math.floor((b.minX - minX) / step));
    const endX = Math.min(width - 1, Math.ceil((b.maxX - minX) / step));
    const startY = Math.max(0, Math.floor((b.minY - minY) / step));
    const endY = Math.min(height - 1, Math.ceil((b.maxY - minY) / step));
    for (let y = startY; y <= endY; y++)
      for (let x = startX; x <= endX; x++)
        field[y * width + x]! += sample({
          x: minX + x * step,
          y: minY + y * step
        });
  };
  for (const { point, rx, ry } of nodes)
    visit(
      {
        minX: point.x - rx,
        maxX: point.x + rx,
        minY: point.y - ry,
        maxY: point.y + ry
      },
      (q) => kernel(((q.x - point.x) / rx) ** 2 + ((q.y - point.y) / ry) ** 2)
    );
  if (p.relationStrength > 0)
    for (const path of paths) {
      const b = boundsOf(path),
        r = p.relationWidth;
      visit(
        {
          minX: b.minX - r,
          maxX: b.maxX + r,
          minY: b.minY - r,
          maxY: b.maxY + r
        },
        (q) => {
          let distance = Infinity;
          for (let i = 1; i < path.length; i++)
            distance = Math.min(
              distance,
              distanceSquared(q, path[i - 1]!, path[i]!)
            );
          return p.relationStrength * kernel(distance / (r * r));
        }
      );
    }
  // Grid-edge identities join contours exactly; the asymptotic decider resolves
  // both saddle configurations without dropping branches or creating cracks.
  const vertices = new Map<number, Point>();
  const neighbors = new Map<number, number[]>();
  const connect = (a: number, b: number) => {
    const aa = neighbors.get(a) ?? [];
    aa.push(b);
    neighbors.set(a, aa);
    const bb = neighbors.get(b) ?? [];
    bb.push(a);
    neighbors.set(b, bb);
  };
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const k = y * width + x;
      const values = [
        field[k]! - p.threshold,
        field[k + 1]! - p.threshold,
        field[k + width + 1]! - p.threshold,
        field[k + width]! - p.threshold
      ];
      const mask = values.reduce((n, v, i) => n | (v >= 0 ? 1 << i : 0), 0);
      if (mask === 0 || mask === 15) continue;
      const edgeIds = [2 * k, 2 * (k + 1) + 1, 2 * (k + width), 2 * k + 1];
      const corners = [
        { x: minX + x * step, y: minY + y * step },
        { x: minX + (x + 1) * step, y: minY + y * step },
        { x: minX + (x + 1) * step, y: minY + (y + 1) * step },
        { x: minX + x * step, y: minY + (y + 1) * step }
      ];
      const crossing: number[] = [];
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4;
        if (values[edge]! >= 0 === values[next]! >= 0) continue;
        const id = edgeIds[edge]!;
        crossing.push(edge);
        if (!vertices.has(id)) {
          const t = values[edge]! / (values[edge]! - values[next]!);
          vertices.set(id, {
            x: corners[edge]!.x + (corners[next]!.x - corners[edge]!.x) * t,
            y: corners[edge]!.y + (corners[next]!.y - corners[edge]!.y) * t
          });
        }
      }
      if (crossing.length === 2)
        connect(edgeIds[crossing[0]!]!, edgeIds[crossing[1]!]!);
      else if (crossing.length === 4) {
        const q = values[0]! * values[2]! - values[1]! * values[3]!;
        if (q >= 0) {
          connect(edgeIds[0]!, edgeIds[1]!);
          connect(edgeIds[2]!, edgeIds[3]!);
        } else {
          connect(edgeIds[3]!, edgeIds[0]!);
          connect(edgeIds[1]!, edgeIds[2]!);
        }
      } else throw Error("organic_surface_unclosed_cell");
    }
  const rings: Rings = [],
    visited = new Set<number>();
  for (const start of neighbors.keys()) {
    if (visited.has(start)) continue;
    const ring: Point[] = [];
    let current = start,
      previous = -1;
    do {
      if (visited.has(current))
        throw Error("organic_surface_nonmanifold_contour");
      visited.add(current);
      ring.push(vertices.get(current)!);
      const adjacent = neighbors.get(current)!;
      if (adjacent.length !== 2) throw Error("organic_surface_open_contour");
      const next = adjacent[0] === previous ? adjacent[1]! : adjacent[0]!;
      previous = current;
      current = next;
    } while (current !== start);
    let smoothed = ring;
    for (let pass = 0; pass < p.smoothing; pass++)
      smoothed = smoothed.flatMap((a, i) => {
        const b = smoothed[(i + 1) % smoothed.length]!;
        return [
          { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
          { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }
        ];
      });
    rings.push(smoothed);
  }
  return normalize(rings);
}

/** Same local max-depth rule and 6 + 5*depth clearance as the current Y sweep.
 * All rings survive. A zero-height nested band expands its filled intervals,
 * including islands on either side of holes, rather than disappearing. */
export function padOrganicSurfaceContours(
  base: Rings,
  profile: readonly { minY: number; maxY: number; depth: number }[],
  scale: number
): Rings {
  if (!base.length || scale === 0)
    return base.map((ring) => ring.map((p) => ({ ...p })));
  const box = boundsOf(base.flat());
  const pieces = offset(base, 11 * scale);
  for (const band of profile) {
    if (band.depth <= 1 || band.maxY < box.minY || band.minY > box.maxY)
      continue;
    const minY = Math.max(band.minY, box.minY),
      maxY = Math.min(band.maxY, box.maxY);
    const radius = (6 + 5 * Math.max(1, band.depth)) * scale;
    if (minY === maxY) {
      const crossings: number[] = [];
      const closedBoundary: Point[][] = [];
      for (const ring of base)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!,
            b = ring[(i + 1) % ring.length]!;
          if (a.y === minY) closedBoundary.push(b.y === minY ? [a, b] : [a]);
          if ((a.y <= minY && b.y > minY) || (b.y <= minY && a.y > minY))
            crossings.push(a.x + ((b.x - a.x) * (minY - a.y)) / (b.y - a.y));
        }
      // Half-open crossings describe interior intervals. Add closed horizontal
      // boundary segments and tangent vertices so a depth band at maxY is not
      // lost (the authored profile has closed endpoints).
      if (closedBoundary.length)
        pieces.push(
          ...inflatePathsD(
            closedBoundary,
            radius,
            JoinType.Round,
            EndType.Round,
            2,
            PRECISION,
            0.025
          )
        );
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        pieces.push(
          ...inflatePathsD(
            [
              [
                { x: crossings[i]!, y: minY },
                { x: crossings[i + 1]!, y: minY }
              ]
            ],
            radius,
            JoinType.Round,
            EndType.Round,
            2,
            PRECISION,
            0.025
          )
        );
    } else {
      const slabs = intersectD(
        base,
        [boxRing({ minX: box.minX - 1, maxX: box.maxX + 1, minY, maxY })],
        FillRule.NonZero,
        PRECISION
      );
      pieces.push(...offset(slabs, radius));
    }
  }
  return canonical(unionD(pieces, [], FillRule.NonZero, PRECISION));
}

function glyphBox(point: Point): Box {
  const r = ORGANIC_SURFACE_REFERENCE_METRIC.glyphHalfSize;
  return {
    minX: point.x - r,
    maxX: point.x + r,
    minY: point.y - r,
    maxY: point.y + r
  };
}
function obstacleRing(point: Point): Point[] {
  // Circumscribed smooth footprint includes the whole existing 5×5 glyph box.
  const radius =
    Math.SQRT2 * ORGANIC_SURFACE_REFERENCE_METRIC.glyphHalfSize + 1;
  return Array.from({ length: 64 }, (_, i) => ({
    x: point.x + radius * Math.cos((i * 2 * Math.PI) / 64),
    y: point.y + radius * Math.sin((i * 2 * Math.PI) / 64)
  }));
}
const topology = (rings: Rings) => ({
  components: rings.filter((ring) => areaD(ring) > 0).length,
  holes: rings.filter((ring) => areaD(ring) < 0).length
});
const intersects = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
function validateGlyphs(
  rings: Rings,
  members: string[],
  nonmembers: string[],
  points: Map<string, Point>
) {
  const ringBounds = rings.map(boundsOf);
  const nearby = (box: Box) =>
    rings.filter((_, i) => intersects(box, ringBounds[i]!));
  return {
    missing: members.filter((id) => {
      const box = glyphBox(points.get(id)!);
      return (
        signedArea(
          differenceD([boxRing(box)], nearby(box), FillRule.NonZero, PRECISION)
        ) > 0.0001
      );
    }),
    intrusions: nonmembers.filter((id) => {
      const box = glyphBox(points.get(id)!);
      return (
        signedArea(
          intersectD(nearby(box), [boxRing(box)], FillRule.NonZero, PRECISION)
        ) > 0.0001
      );
    }).length
  };
}

export function buildOrganicSurfaces(input: {
  primitives: readonly ResolvedRenderPrimitive[];
  parameters?: Partial<OrganicSurfaceParameters>;
}): OrganicSurfaceResult {
  const p = normalizeOrganicSurfaceParameters(input.parameters);
  const primitives = [...input.primitives].sort((a, b) => order(a.id, b.id));
  const leaves = primitives.filter(
    (v) => v.entity.kind === "event" && v.geometry.kind === "point"
  );
  const owners = primitives.filter((v) => v.entity.kind === "composite");
  const origin = leaves.length
    ? Math.min(
        ...leaves.map((v) =>
          v.geometry.kind === "point" ? v.geometry.xy.y : 0
        )
      )
    : 0;
  const toMetric = (point: Point): Point => ({
    x: point.x,
    y: (point.y - origin) * 0.2
  });
  const toWorld = (point: Point): Point => ({
    x: point.x,
    y: point.y / 0.2 + origin
  });
  const memberPointsByEventId: Record<string, Point> = {};
  const points = new Map<string, Point>();
  for (const leaf of leaves)
    if (leaf.geometry.kind === "point") {
      if (
        !Number.isFinite(leaf.geometry.xy.x) ||
        !Number.isFinite(leaf.geometry.xy.y)
      )
        throw Error("organic_surface_nonfinite_input");
      memberPointsByEventId[leaf.entity.id] = { ...leaf.geometry.xy };
      points.set(leaf.entity.id, toMetric(leaf.geometry.xy));
    }
  const descendants = new Map<string, Set<string>>();
  for (const primitive of primitives)
    for (const owner of primitive.ancestorCompositeIds ??
      primitive.parentCompositeIds ??
      []) {
      const ids = descendants.get(owner) ?? new Set<string>();
      ids.add(primitive.entity.id);
      descendants.set(owner, ids);
    }
  // Complete child lists also cover small constructed fixtures and older input.
  const byId = new Map(
    primitives
      .filter((v) => v.entity.kind !== "relation")
      .map((v) => [v.entity.id, v])
  );
  for (const owner of owners) {
    const ids = descendants.get(owner.entity.id) ?? new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      ids.add(id);
      for (const child of byId.get(id)?.composite?.childEventIds ?? [])
        visit(child);
    };
    for (const child of owner.composite?.childEventIds ?? []) visit(child);
    descendants.set(owner.entity.id, ids);
  }
  const baseContoursByCompositeId: Record<string, Rings> = {},
    paddedContoursByCompositeId: Record<string, Rings> = {};
  const composites: OrganicSurfaceCompositeDiagnostics[] = [];
  const memberships: OrganicSurfaceResult["memberships"] = [];
  for (const owner of owners) {
    const id = owner.entity.id,
      ids = descendants.get(id) ?? new Set<string>();
    const members = [...ids].filter((key) => points.has(key)).sort(order);
    const nonmembers = [...points.keys()].filter((key) => !ids.has(key));
    const profile = (
      owner.composite?.paddingProfile?.length
        ? owner.composite.paddingProfile
        : [
            {
              minY: owner.bounds.minY,
              maxY: owner.bounds.maxY,
              depth: owner.composite?.depth ?? 1
            }
          ]
    ).map((band) => ({
      ...band,
      minY: (band.minY - origin) * 0.2,
      maxY: (band.maxY - origin) * 0.2
    }));
    const levelAt = (y: number) =>
      Math.max(
        1,
        ...profile
          .filter((band) => band.minY <= y && band.maxY >= y)
          .map((band) => band.depth)
      );
    const nodes = members.map((eventId) => {
      const point = points.get(eventId)!,
        factor = 1 + p.levelScale * (levelAt(point.y) - 1);
      return { point, rx: p.radiusX * factor, ry: p.radiusY * factor };
    });
    const relations = primitives.filter(
      (v) =>
        v.entity.kind === "relation" &&
        v.endpointIds?.every((endpoint) => ids.has(endpoint))
    );
    const unsupported = relations.filter(
      (v) =>
        v.geometry.kind !== "line" ||
        !v.geometry.paths.some((path) => path.length >= 2)
    );
    const routes = relations.flatMap((v) =>
      v.geometry.kind === "line"
        ? v.geometry.paths
            .filter((path) => path.length >= 2)
            .map((path) => path.map(toMetric))
        : []
    );
    const field = fieldContours(nodes, routes, p);
    const obstaclePaths = nonmembers.map((eventId) =>
      obstacleRing(points.get(eventId)!)
    );
    const exclude = (rings: Rings) =>
      rings.length && obstaclePaths.length
        ? canonical(
            differenceD(rings, obstaclePaths, FillRule.NonZero, PRECISION)
          )
        : rings;
    const base = exclude(field);
    const desiredPadding = padOrganicSurfaceContours(
      base,
      profile,
      p.paddingScale
    );
    const padded = exclude(desiredPadding);
    const baseCheck = validateGlyphs(base, members, nonmembers, points),
      paddedCheck = validateGlyphs(padded, members, nonmembers, points);
    const before = topology(base),
      after = topology(padded);
    const deficit = Math.max(
      0,
      signedArea(desiredPadding) - signedArea(padded)
    );
    const warnings: string[] = [];
    if (baseCheck.missing.length || paddedCheck.missing.length)
      warnings.push(
        "Nominal member glyph support conflicts remain; exact membership and Event identity are retained."
      );
    if (deficit > 0.0001)
      warnings.push(
        "Nonmember avoidance cuts requested padding; constant clearance is not met at those glyphs."
      );
    if (unsupported.length)
      warnings.push(
        "Some semantic relations have no resolved path and contribute no adhesion field."
      );
    if (!owner.composite?.paddingProfile?.length)
      warnings.push(
        "No local padding profile: using the supplied Composite depth over its semantic Y bounds."
      );
    baseContoursByCompositeId[id] = base.map((ring) => ring.map(toWorld));
    paddedContoursByCompositeId[id] = padded.map((ring) => ring.map(toWorld));
    composites.push({
      compositeId: id,
      memberEventIds: members,
      baseComponents: before.components,
      paddedComponents: after.components,
      baseHoles: before.holes,
      paddedHoles: after.holes,
      paddingDepths: [...new Set(profile.map((band) => band.depth))].sort(
        (a, b) => a - b
      ),
      baseMissingMemberIds: baseCheck.missing,
      paddedMissingMemberIds: paddedCheck.missing,
      baseNonmemberIntersections: baseCheck.intrusions,
      paddedNonmemberIntersections: paddedCheck.intrusions,
      paddingClearanceDeficitArea: deficit,
      relationIds: relations.map((v) => v.entity.id),
      unsupportedRelationIds: unsupported.map((v) => v.entity.id),
      fieldSampleSpacing: p.sampleStep,
      baseVertices: base.reduce((n, ring) => n + ring.length, 0),
      paddedVertices: padded.reduce((n, ring) => n + ring.length, 0),
      warnings
    });
    for (const eventId of members)
      memberships.push({
        compositeId: id,
        eventId,
        status: paddedCheck.missing.includes(eventId) ? "list" : "area",
        ...(paddedCheck.missing.includes(eventId)
          ? { reason: "FIXED_GLYPH_SUPPORT_CONFLICT" }
          : {})
      });
  }
  const sum = (key: keyof OrganicSurfaceCompositeDiagnostics) =>
    composites.reduce((n, d) => n + Number(d[key]), 0);
  return {
    algorithmVersion: "organic-anisotropic-field/1",
    parameters: p,
    baseContoursByCompositeId,
    paddedContoursByCompositeId,
    memberPointsByEventId,
    composites,
    memberships,
    diagnostics: {
      totalComposites: composites.length,
      baseComponents: sum("baseComponents"),
      paddedComponents: sum("paddedComponents"),
      baseHoles: sum("baseHoles"),
      paddedHoles: sum("paddedHoles"),
      memberCoverageFailures: composites.reduce(
        (n, d) => n + d.paddedMissingMemberIds.length,
        0
      ),
      baseMemberCoverageFailures: composites.reduce(
        (n, d) => n + d.baseMissingMemberIds.length,
        0
      ),
      nonmemberIntersections: sum("paddedNonmemberIntersections"),
      baseNonmemberIntersections: sum("baseNonmemberIntersections"),
      relationPaths: composites.reduce((n, d) => n + d.relationIds.length, 0),
      unsupportedRelations: composites.reduce(
        (n, d) => n + d.unsupportedRelationIds.length,
        0
      ),
      paddingClearanceDeficitArea: sum("paddingClearanceDeficitArea"),
      baseVertices: sum("baseVertices"),
      paddedVertices: sum("paddedVertices"),
      semanticCertifiedAreas: 0
    },
    limitations: [
      "Frozen reference metric is scaleX=1, scaleY=0.2. Padding matches 6+5*local authored depth at this metric, not constant CSS pixels after arbitrary axis zoom.",
      "Nominal glyph support is the existing 5×5 reference-metric box. Screen labels and zoom-dependent glyph sizes are not certified.",
      "The local padding rule uses maximum authored descendant depth, not Collection count or subjective importance. Nonmember cuts can defeat requested clearance and are reported by removed metric area.",
      "Relations contribute along resolved source paths only when both endpoints belong to the Composite. Strong adhesion can be interrupted by nonmember glyphs or high thresholds.",
      "Dense interpolated contours, requested corner subdivision and round offsets are final serialized geometry. Topology counts describe the result; no semantic area certificate or aesthetic acceptance is claimed."
    ]
  };
}

export const ORGANIC_SURFACE_VERSION = "organic-anisotropic-field/1" as const;
export const DEFAULT_ORGANIC_PARAMETERS = DEFAULT_ORGANIC_SURFACE_PARAMETERS;
export const normalizeOrganicParameters = normalizeOrganicSurfaceParameters;
