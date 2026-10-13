/** Offline polygon construction in a caller-declared fixed metric frame.
 * Boolean operations use decimal quantization, not a semantic certificate. */
import {
  areaD,
  differenceD,
  EndType,
  FillRule,
  inflatePathsD,
  intersectD,
  JoinType,
  trimCollinearD,
  unionD
} from "clipper2-ts";
import type { BaselineArtifact } from "./baseline.js";
import type {
  TstlExperimentBox,
  TstlExperimentPoint
} from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";

export type Point = TstlExperimentPoint;
export type Box = TstlExperimentBox;
export const REGION_PRECISION = 4;
export const boxRing = (box: Box): Point[] => [
  { x: box.minX, y: box.minY },
  { x: box.maxX, y: box.minY },
  { x: box.maxX, y: box.maxY },
  { x: box.minX, y: box.maxY }
];
export const ringArea = (points: Point[]) => areaD(points);

function canonical(paths: Point[][]): Point[][] {
  return paths
    .map((path) => trimCollinearD(path, REGION_PRECISION))
    .filter((path) => path.length >= 3 && Math.abs(areaD(path)) > 1e-8)
    .map((path) => {
      let first = 0;
      for (let index = 1; index < path.length; index++)
        if (
          path[index]!.x < path[first]!.x ||
          (path[index]!.x === path[first]!.x && path[index]!.y < path[first]!.y)
        )
          first = index;
      return [...path.slice(first), ...path.slice(0, first)].map(
        ({ x, y }) => ({ x, y })
      );
    })
    .sort(
      (a, b) =>
        Number(areaD(b) > 0) - Number(areaD(a) > 0) ||
        a[0]!.x - b[0]!.x ||
        a[0]!.y - b[0]!.y ||
        Math.abs(areaD(b)) - Math.abs(areaD(a))
    );
}

export function unionRegionPaths(paths: Point[][]): Point[][] {
  return paths.length
    ? canonical(unionD(paths, [], FillRule.NonZero, REGION_PRECISION))
    : [];
}

export function subtractRegionObstacles(
  paths: Point[][],
  obstacles: Box[]
): Point[][] {
  if (!paths.length) return [];
  if (!obstacles.length) return unionRegionPaths(paths);
  return canonical(
    differenceD(
      paths,
      obstacles.map(boxRing),
      FillRule.NonZero,
      REGION_PRECISION
    )
  );
}

export function subtractRegionPaths(
  paths: Point[][],
  clips: Point[][]
): Point[][] {
  return canonical(
    differenceD(paths, clips, FillRule.NonZero, REGION_PRECISION)
  );
}

export function bufferOpenPaths(paths: Point[][], radius: number): Point[][] {
  if (!paths.length || radius <= 0) return [];
  return canonical(
    inflatePathsD(
      paths,
      radius,
      JoinType.Round,
      EndType.Round,
      2,
      REGION_PRECISION,
      0.15
    )
  );
}

/** Morphological opening rounds the actual union boundary, never each tile.
 * Callers must restore necessary terminal supports and recheck final geometry. */
export function roundRegionPaths(paths: Point[][], radius: number): Point[][] {
  const united = unionRegionPaths(paths);
  if (radius <= 0 || !united.length) return united;
  const inner = inflatePathsD(
    united,
    -radius,
    JoinType.Round,
    EndType.Polygon,
    2,
    REGION_PRECISION,
    0.15
  );
  return canonical(
    inflatePathsD(
      inner,
      radius,
      JoinType.Round,
      EndType.Polygon,
      2,
      REGION_PRECISION,
      0.15
    )
  );
}

export function diskRing(
  center: Point,
  radius: number,
  segments = 24
): Point[] {
  return Array.from({ length: segments }, (_, index) => ({
    x: center.x + radius * Math.cos((index * Math.PI * 2) / segments),
    y: center.y + radius * Math.sin((index * Math.PI * 2) / segments)
  }));
}

export function containsEvenOdd(point: Point, rings: readonly Point[][]) {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!,
        b = ring[j]!;
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
  return inside;
}

const bounds = (ring: Point[]): Box => ({
  minX: Math.min(...ring.map((p) => p.x)),
  maxX: Math.max(...ring.map((p) => p.x)),
  minY: Math.min(...ring.map((p) => p.y)),
  maxY: Math.max(...ring.map((p) => p.y))
});
const overlap = (a: Box, b: Box) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
const filledArea = (paths: Point[][]) =>
  Math.abs(paths.reduce((sum, path) => sum + areaD(path), 0));

/** Counts proper self-crossings; collinear neighbors are allowed. Boolean
 * normalization supplies simple contours; this independently checks crossings. */
export function ringsSelfIntersect(rings: Point[][]) {
  let intersections = 0;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!,
        b = ring[(i + 1) % ring.length]!;
      for (let j = i + 2; j < ring.length; j++) {
        if (i === 0 && j === ring.length - 1) continue;
        const c = ring[j]!,
          d = ring[(j + 1) % ring.length]!;
        if (
          cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0
        )
          intersections++;
      }
    }
  return intersections;
}

export function validateRegionGeometry(
  rings: Point[][],
  memberSupports: Box[],
  nonmemberSupports: Box[]
) {
  const finite = rings.every(
    (ring) =>
      ring.length >= 3 &&
      ring.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
      )
  );
  if (!finite) throw Error("tstl_smooth_nonfinite_contour");
  const ringBounds = rings.map(bounds);
  const candidatesFor = (box: Box) =>
    rings.filter((_, index) => overlap(ringBounds[index]!, box));
  const memberCoverage = memberSupports.map(
    (box) =>
      filledArea(
        differenceD(
          [boxRing(box)],
          candidatesFor(box),
          FillRule.NonZero,
          REGION_PRECISION
        )
      ) <= 0.0001
  );
  const nonmemberIntersections = nonmemberSupports.filter(
    (box) =>
      filledArea(
        intersectD(
          candidatesFor(box),
          [boxRing(box)],
          FillRule.NonZero,
          REGION_PRECISION
        )
      ) > 0.0001
  ).length;
  return {
    memberCoverage,
    nonmemberIntersections,
    components: rings.filter((ring) => areaD(ring) > 0).length,
    holes: rings.filter((ring) => areaD(ring) < 0).length,
    selfIntersections: ringsSelfIntersect(rings),
    finite
  };
}

export function baselineCandidateCoordinates(baseline: BaselineArtifact) {
  const xByEventId: Record<string, number> = {};
  const positionsByEventId: Record<string, Point> = {};
  const worldBoundsByCompositeId: Record<string, Box> = {};
  for (const primitive of baseline.primitives) {
    if (
      primitive.entity.kind === "relation" ||
      primitive.entity.kind === "cluster"
    )
      continue;
    const anchor =
      primitive.composite?.anchor ??
      (primitive.geometry.kind === "point"
        ? primitive.geometry.xy
        : {
            x: (primitive.bounds.minX + primitive.bounds.maxX) / 2,
            y: (primitive.bounds.minY + primitive.bounds.maxY) / 2
          });
    xByEventId[primitive.entity.id] = anchor.x;
    positionsByEventId[primitive.entity.id] = { ...anchor };
    if (primitive.composite)
      worldBoundsByCompositeId[primitive.entity.id] = {
        ...primitive.composite.worldBounds
      };
  }
  return { xByEventId, positionsByEventId, worldBoundsByCompositeId };
}
