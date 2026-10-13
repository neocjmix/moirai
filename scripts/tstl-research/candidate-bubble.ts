/** BubbleSets-inspired skeleton and rounded region union on unchanged B0 XY.
 * This is a capsule-union experiment, not a reproduction of the paper's field. */
import type { BaselineArtifact } from "./baseline.js";
import type { TstlComparisonArtifact } from "./candidate.js";
import type { TstlExperimentCandidate } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
import {
  baselineCandidateCoordinates,
  bufferOpenPaths,
  diskRing,
  roundRegionPaths,
  subtractRegionObstacles,
  unionRegionPaths,
  validateRegionGeometry,
  type Box,
  type Point
} from "./smooth-regions.js";

export const BUBBLE_PARAMETERS = {
  yScale: 0.2,
  supportHalfSize: 2.5,
  nonmemberClearance: 1.5,
  lobeRadius: 18,
  corridorRadius: 12,
  smoothingRadius: 5,
  maxDetourChannels: 96,
  segmentCheckBudget: 20_000_000
} as const;

const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const support = (p: Point, r: number): Box => ({
  minX: p.x - r,
  maxX: p.x + r,
  minY: p.y - r,
  maxY: p.y + r
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closed segment/AABB intersection, valid for diagonal skeleton edges too. */
export function bubbleSegmentIntersectsBox(a: Point, b: Point, box: Box) {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.y, b.y - a.y, box.minY, box.maxY]
  ]) {
    if (delta === 0) {
      if (start! < min! || start! > max!) return false;
      continue;
    }
    let enter = (min! - start!) / delta!,
      leave = (max! - start!) / delta!;
    if (enter > leave) [enter, leave] = [leave, enter];
    low = Math.max(low, enter);
    high = Math.min(high, leave);
    if (low > high) return false;
  }
  return true;
}

interface Work {
  checks: number;
  exhausted: boolean;
}
function routeEdge(
  a: Point,
  b: Point,
  obstacles: Box[],
  work: Work
): Point[] | null {
  const clear = (path: Point[]) => {
    for (let i = 1; i < path.length; i++)
      for (const box of obstacles) {
        if (work.checks >= BUBBLE_PARAMETERS.segmentCheckBudget) {
          work.exhausted = true;
          return false;
        }
        work.checks++;
        if (bubbleSegmentIntersectsBox(path[i - 1]!, path[i]!, box))
          return false;
      }
    return true;
  };
  if (clear([a, b])) return [a, b];
  if (work.exhausted) return null;
  // One-bend and dogleg channels include all relevant obstacle boundaries.
  const paths: Point[][] = [
    [a, { x: a.x, y: b.y }, b],
    [a, { x: b.x, y: a.y }, b]
  ];
  const relevant = obstacles.filter(
    (box) =>
      box.minX <= Math.max(a.x, b.x) + 36 &&
      box.maxX >= Math.min(a.x, b.x) - 36 &&
      box.minY <= Math.max(a.y, b.y) + 36 &&
      box.maxY >= Math.min(a.y, b.y) - 36
  );
  const ys = [
    ...new Set([
      a.y - 24,
      a.y + 24,
      b.y - 24,
      b.y + 24,
      ...relevant.flatMap((box) => [box.minY - 1, box.maxY + 1])
    ])
  ]
    .sort(
      (x, y) =>
        Math.abs(x - a.y) +
          Math.abs(x - b.y) -
          Math.abs(y - a.y) -
          Math.abs(y - b.y) || x - y
    )
    .slice(0, BUBBLE_PARAMETERS.maxDetourChannels / 2);
  const xs = [
    ...new Set([
      a.x - 24,
      a.x + 24,
      b.x - 24,
      b.x + 24,
      ...relevant.flatMap((box) => [box.minX - 1, box.maxX + 1])
    ])
  ]
    .sort(
      (x, y) =>
        Math.abs(x - a.x) +
          Math.abs(x - b.x) -
          Math.abs(y - a.x) -
          Math.abs(y - b.x) || x - y
    )
    .slice(0, BUBBLE_PARAMETERS.maxDetourChannels / 2);
  for (const y of ys) paths.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  for (const x of xs) paths.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  paths.sort(
    (p, q) =>
      p.slice(1).reduce((sum, v, i) => sum + distance(v, p[i]!), 0) -
      q.slice(1).reduce((sum, v, i) => sum + distance(v, q[i]!), 0)
  );
  for (const path of paths) {
    if (clear(path)) return path;
    if (work.exhausted) break;
  }
  return null;
}

/** Global deterministic Prim skeleton: no temporal-window topology cuts. */
export function bubbleSkeleton(
  points: readonly { id: string; point: Point }[]
) {
  if (points.length < 2) return [];
  const ordered = [...points].sort((a, b) => idOrder(a.id, b.id));
  const active = new Set([0]);
  const distances = ordered.map((p, i) =>
    i ? distance(ordered[0]!.point, p.point) : 0
  );
  const parents = ordered.map(() => 0);
  const edges: { from: string; to: string; a: Point; b: Point }[] = [];
  while (active.size < ordered.length) {
    let next = -1;
    for (let i = 0; i < ordered.length; i++)
      if (!active.has(i) && (next < 0 || distances[i]! < distances[next]!))
        next = i;
    const parent = parents[next]!;
    edges.push({
      from: ordered[parent]!.id,
      to: ordered[next]!.id,
      a: ordered[parent]!.point,
      b: ordered[next]!.point
    });
    active.add(next);
    for (let i = 0; i < ordered.length; i++)
      if (!active.has(i)) {
        const d = distance(ordered[next]!.point, ordered[i]!.point);
        if (d < distances[i]!) {
          distances[i] = d;
          parents[i] = next;
        }
      }
  }
  return edges;
}

export function buildBubbleCandidate(
  baseline: BaselineArtifact,
  comparison: TstlComparisonArtifact
): TstlExperimentCandidate {
  const { xByEventId, positionsByEventId, worldBoundsByCompositeId } =
    baselineCandidateCoordinates(baseline);
  if (!baseline.bounds) throw Error("tstl_bubble_empty_baseline");
  const origin = baseline.bounds.minY;
  const toMetric = (p: Point): Point => ({
    x: p.x,
    y: (p.y - origin) * BUBBLE_PARAMETERS.yScale
  });
  const toWorld = (p: Point): Point => ({
    x: p.x,
    y: p.y / BUBBLE_PARAMETERS.yScale + origin
  });
  const worldBox = (b: Box): Box => ({
    minX: b.minX,
    maxX: b.maxX,
    minY: b.minY / BUBBLE_PARAMETERS.yScale + origin,
    maxY: b.maxY / BUBBLE_PARAMETERS.yScale + origin
  });
  const leafIds = [...comparison.projection.leafIds].sort(idOrder);
  const metric = new Map(
    leafIds.map((id) => {
      const source = positionsByEventId[id];
      if (!source) throw Error("tstl_bubble_missing_b0_event");
      return [id, toMetric(source)] as const;
    })
  );
  const contoursByCompositeId: TstlExperimentCandidate["contoursByCompositeId"] =
    {};
  const memberships: NonNullable<TstlExperimentCandidate["memberships"]> = [];
  const diagnostics = {
    totalComposites: 0,
    leafMemberships: 0,
    leafAreaMemberships: 0,
    leafListMemberships: 0,
    skeletonEdges: 0,
    routedSkeletonEdges: 0,
    failedSkeletonEdges: 0,
    components: 0,
    holes: 0,
    connectedComposites: 0,
    multiComponentComposites: 0,
    nonmemberIntersections: 0,
    selfIntersections: 0,
    vertices: 0,
    segmentChecks: 0,
    budgetExhausted: 0,
    semanticCertifiedAreas: 0
  };
  const work: Work = { checks: 0, exhausted: false };
  for (const owner of [...comparison.projection.compositeIds].sort(idOrder)) {
    const ids = [...comparison.projection.leafMembers[owner]!].sort(idOrder);
    const memberSet = new Set(ids);
    const supports = ids.map((id) =>
      support(metric.get(id)!, BUBBLE_PARAMETERS.supportHalfSize)
    );
    const nonmembers = leafIds.filter((id) => !memberSet.has(id));
    const obstacles = nonmembers.map((id) =>
      support(
        metric.get(id)!,
        BUBBLE_PARAMETERS.supportHalfSize + BUBBLE_PARAMETERS.nonmemberClearance
      )
    );
    const edges = bubbleSkeleton(
      ids.map((id) => ({ id, point: metric.get(id)! }))
    );
    diagnostics.skeletonEdges += edges.length;
    const routes: Point[][] = [];
    for (const edge of edges) {
      const route = routeEdge(edge.a, edge.b, obstacles, work);
      if (route) {
        routes.push(route);
        diagnostics.routedSkeletonEdges++;
      } else diagnostics.failedSkeletonEdges++;
    }
    const lobes = ids.map((id) =>
      diskRing(metric.get(id)!, BUBBLE_PARAMETERS.lobeRadius)
    );
    const raw = unionRegionPaths([
      ...lobes,
      ...bufferOpenPaths(routes, BUBBLE_PARAMETERS.corridorRadius)
    ]);
    const rounded = roundRegionPaths(raw, BUBBLE_PARAMETERS.smoothingRadius);
    // Necessary observed terminal lobes are restored before final obstacle cut.
    const finalMetric = subtractRegionObstacles(
      unionRegionPaths([...rounded, ...lobes]),
      obstacles
    );
    const finalWorld = finalMetric.map((ring) => ring.map(toWorld));
    const validation = validateRegionGeometry(
      finalWorld,
      supports.map(worldBox),
      nonmembers.map((id) =>
        worldBox(support(metric.get(id)!, BUBBLE_PARAMETERS.supportHalfSize))
      )
    );
    if (validation.nonmemberIntersections || validation.selfIntersections)
      throw Error(`tstl_bubble_final_geometry_failed:${owner}`);
    contoursByCompositeId[owner] = finalWorld;
    diagnostics.totalComposites++;
    diagnostics.components += validation.components;
    diagnostics.holes += validation.holes;
    diagnostics.vertices += finalWorld.reduce((n, ring) => n + ring.length, 0);
    if (validation.components === 1) diagnostics.connectedComposites++;
    if (validation.components > 1) diagnostics.multiComponentComposites++;
    for (const [index, eventId] of ids.entries()) {
      const area = validation.memberCoverage[index]!;
      memberships.push({
        compositeId: owner,
        eventId,
        status: area ? "area" : "list",
        ...(!area
          ? {
              reason: work.exhausted
                ? "REGION_BUDGET_OR_SUPPORT_CONFLICT"
                : "FIXED_SUPPORT_CONFLICT"
            }
          : {})
      });
      diagnostics.leafMemberships++;
      if (area) diagnostics.leafAreaMemberships++;
      else diagnostics.leafListMemberships++;
    }
  }
  diagnostics.segmentChecks = work.checks;
  diagnostics.budgetExhausted = Number(work.exhausted);
  return {
    algorithmVersion: "bubble-inspired-b0-capsule-union/1",
    fillRule: "evenodd",
    xByEventId,
    worldBoundsByCompositeId,
    contoursByCompositeId,
    noAreaCompositeIds: Object.keys(contoursByCompositeId).filter(
      (id) => !contoursByCompositeId[id]!.length
    ),
    memberships,
    diagnostics,
    limitations: [
      "BubbleSets-inspired rounded capsule union on exact compiled B0 coordinates; this is not a reproduction of the original potential-field algorithm.",
      "One global member skeleton per Composite; obstacle detours are bounded and final connected-component counts report residual fragmentation rather than hiding it.",
      "Final serialized contours are checked against nominal 5×5 glyph supports in a fixed x/0.2y metric. Screen-space label and glyph footprints change with zoom and are not certified by that test.",
      "Obstacle cuts preserve nonmember glyph exclusion and may create explicit holes or support-conflict list fallbacks. Hole rings are rendered with even-odd fill, never as filled islands.",
      "Member coverage, obstacle exclusion and proper self-crossing checks are geometric evidence at decimal precision4. Global membership-intersection signatures, temporal completeness and semantic area certification remain unverified."
    ]
  };
}
