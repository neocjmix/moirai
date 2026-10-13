/** Isolated, offline Candidate A experiment. No publication or canonical writes.
 * This restricted model optimizes Event X only, then builds orthogonal single-run
 * envelopes. It is not the full joint X/L/R/QP or a global optimum claim. */
import { createHash } from "node:crypto";
import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
import type { LayoutShape } from "../../packages/graph-presentation/src/layout-engine.js";
import {
  projectTstlSemantics,
  validateTstlGeometry,
  validateTstlIncidence,
  validateTstlRenderCommands,
  validateTstlTemporal,
  validateTstlWorldGeometry,
  type TstlBox,
  type TstlGeometryInput,
  type TstlGeometryResult,
  type TstlPatch,
  type TstlPoint,
  type TstlProjection,
  type TstlRegion,
  type TstlRenderCommands,
  type TstlTemporalRecord
} from "../../packages/graph-presentation/src/tstl-validator.js";
import type { BaselineArtifact } from "./baseline.js";

export const TSTL_CASES = {
  korea: "01a123a1-0000-751e-9e64-e7c7b6b89fbc",
  japan: "01a123a1-0000-77c0-8401-4f9db460625b",
  china: "01a1240c-0000-73dd-bea1-64db15136c48",
  imjin: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
  yi: "1f10a329-835d-79b1-a9c3-ae1835934b8b"
} as const;
export const A_PARAMETERS = {
  version: "restricted-point-qp-orthogonal-a/1",
  referenceHeight: 4096,
  anchorSpacing: 240,
  nominalBodySize: 6,
  visibleStroke: 1,
  padding: 3,
  glyphGap: 3,
  // Conservative support + both containment margins fit this separation.
  separation: 14,
  rootSwapPasses: 8,
  constraintVisitBudget: 1_000_000,
  convergenceTolerance: 1e-8,
  repairBudget: 12,
  maxEvents: 4096,
  maxConstraints: 250_000,
  maxSlabs: 8192,
  arrangementCellBudget: 250_000
} as const;

export interface TstlReferenceFrame {
  sourceYOrigin: number;
  scale: number;
  nominalHalfHeight: number;
}
export interface TstlComparisonEvent {
  eventId: string;
  title: string;
  x: number;
  sourceY: number;
  referenceY: number;
  role: "memberEventMark" | "compositeHeader";
  support: TstlBox;
  /** Unchanged source geometry retains point Y AND every span boundary. A
   * Composite midpoint above is only an annotation anchor, never occurrence. */
  baselineShape: LayoutShape;
  collectionIds: readonly string[];
}
export interface TstlComparisonLayout {
  id: "B0" | "A";
  algorithmVersion: string;
  canonicalHash: string;
  geometryHash: string;
  events: TstlComparisonEvent[];
  regions: TstlRegion[];
  renderCommands: TstlRenderCommands;
  diagnosticRenderCommands: TstlRenderCommands;
  geometry: TstlGeometryInput;
  provisionalGeometry: TstlGeometryInput;
  temporal: TstlTemporalRecord[];
  memberships: Record<string, string[]>;
  ports: { eventId: string; compositeId: string }[];
  validation: {
    provisional: TstlGeometryResult;
    repaired: TstlGeometryResult;
    final: ReturnType<typeof validateTstlWorldGeometry>;
    incidence: ReturnType<typeof validateTstlIncidence>;
    render: ReturnType<typeof validateTstlRenderCommands>;
    diagnosticRender: ReturnType<typeof validateTstlRenderCommands>;
  };
  metrics: {
    totalEvents: number;
    totalComposites: number;
    totalLeaves: number;
    geometricScopeComposites: number;
    outsideScopeListOnlyComposites: number;
    provisionalRegions: number;
    semanticFilledRegions: number;
    fallbackComposites: number;
    membershipPorts: number;
    sourceYMismatchCount: number;
    multiRunBands: number;
    repairedPatchModes: number;
  };
  bounds: TstlBox;
  limitations: string[];
  order?: {
    anchorIds: string[];
    eventIds: string[];
    referenceX: Record<string, number>;
  };
  solver?: FixedYQpResult;
  repair?: {
    budget: number;
    attempts: { patchId: string; compositeIds: string[] }[];
    exhausted: boolean;
    menu: string;
  };
}
export interface TstlComparisonArtifact {
  formatVersion: "tstl-comparison/1";
  source: {
    worldId: string;
    revision: number;
    timeSystemId: string;
    sourceRootDigest: string;
    inputDigest: string;
  };
  snapshot: LabSnapshot;
  projection: TstlProjection;
  referenceFrame: TstlReferenceFrame;
  geometryScopeCompositeIds: string[];
  cases: typeof TSTL_CASES;
  parameters: typeof A_PARAMETERS;
  b0: TstlComparisonLayout;
  a: TstlComparisonLayout;
}

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Root identities and normalized shared-leaf incidence alone define X anchors.
 * Titles, comparison scope, selected Collections and view camera are absent. */
export function orderTstlRoots(projection: TstlProjection) {
  const rootIds = projection.eventIds.filter(
    (id) => projection.parents[id]!.length === 0
  );
  const rootSet = new Set(rootIds);
  const weights = new Map<string, number>();
  const key = (a: string, b: string) => JSON.stringify([a, b].sort(compareIds));
  for (const leaf of projection.leafIds) {
    const anchors = rootIds.filter(
      (root) => root === leaf || projection.ancestors[leaf]!.includes(root)
    );
    const pairs = (anchors.length * (anchors.length - 1)) / 2;
    for (let i = 0; i < anchors.length; i++)
      for (let j = i + 1; j < anchors.length; j++) {
        const pair = key(anchors[i]!, anchors[j]!);
        weights.set(pair, (weights.get(pair) ?? 0) + 1 / pairs);
      }
  }
  const score = (order: readonly string[]) =>
    order
      .slice(1)
      .reduce((sum, id, i) => sum + (weights.get(key(order[i]!, id)) ?? 0), 0);
  let anchorIds: string[] = [];
  for (const id of rootIds) {
    let best = [...anchorIds, id];
    let bestScore = score(best);
    for (let at = 0; at < anchorIds.length; at++) {
      const candidate = [...anchorIds.slice(0, at), id, ...anchorIds.slice(at)];
      const value = score(candidate);
      if (value > bestScore) {
        best = candidate;
        bestScore = value;
      }
    }
    anchorIds = best;
  }
  for (let pass = 0; pass < A_PARAMETERS.rootSwapPasses; pass++)
    for (let at = 0; at + 1 < anchorIds.length; at++) {
      const candidate = [...anchorIds];
      [candidate[at], candidate[at + 1]] = [candidate[at + 1]!, candidate[at]!];
      if (score(candidate) > score(anchorIds)) anchorIds = candidate;
    }
  const anchorX = new Map(
    anchorIds.map((id, i) => [
      id,
      (i - (anchorIds.length - 1) / 2) * A_PARAMETERS.anchorSpacing
    ])
  );
  const referenceX: Record<string, number> = {};
  for (const id of projection.eventIds) {
    const roots = rootSet.has(id)
      ? [id]
      : projection.ancestors[id]!.filter((parent) => rootSet.has(parent));
    if (roots.length === 0) throw Error("tstl_unanchored_event");
    referenceX[id] =
      roots.reduce((sum, root) => sum + anchorX.get(root)!, 0) / roots.length;
  }
  const eventIds = [...projection.eventIds].sort(
    (a, b) => referenceX[a]! - referenceX[b]! || compareIds(a, b)
  );
  return { anchorIds, eventIds, referenceX };
}

export interface FixedYConstraint {
  beforeId: string;
  afterId: string;
  gap: number;
}
export interface FixedYQpResult {
  status: "CONVERGED" | "BUDGET_EXHAUSTED" | "MODEL_INFEASIBLE";
  model: "min-squared-anchor-displacement-subject-to-fixed-order-separation";
  optimalityClaim: "none";
  positions: Record<string, number>;
  constraints: number;
  constraintVisits: number;
  maxViolation: number;
  usedFeasibleFallback: boolean;
  cycleEventIds: string[];
  objective: number;
}

/** Hildreth dual coordinate projection of a strictly convex, X-only QP.
 * Fixed work limits, no wall-clock termination. Positive-order cycles are a
 * restricted-model proof; they never cause time movement or Event duplication. */
export function solveFixedYQp(
  reference: Readonly<Record<string, number>>,
  constraints: readonly FixedYConstraint[],
  budget: number = A_PARAMETERS.constraintVisitBudget
): FixedYQpResult {
  const ids = Object.keys(reference).sort(compareIds);
  if (
    ids.length > A_PARAMETERS.maxEvents ||
    constraints.length > A_PARAMETERS.maxConstraints ||
    !Number.isSafeInteger(budget) ||
    budget < 0 ||
    ids.some((id) => !Number.isFinite(reference[id]))
  )
    throw Error("tstl_qp_input_or_work_limit");
  const edges = [...constraints].sort(
    (a, b) =>
      compareIds(a.beforeId, b.beforeId) ||
      compareIds(a.afterId, b.afterId) ||
      a.gap - b.gap
  );
  const outgoing = new Map(ids.map((id) => [id, [] as FixedYConstraint[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    if (
      !outgoing.has(edge.beforeId) ||
      !outgoing.has(edge.afterId) ||
      !Number.isFinite(edge.gap) ||
      edge.gap <= 0
    )
      throw Error("tstl_invalid_positive_order_constraint");
    outgoing.get(edge.beforeId)!.push(edge);
    indegree.set(edge.afterId, indegree.get(edge.afterId)! + 1);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const topological: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    topological.push(id);
    for (const edge of outgoing.get(id)!) {
      indegree.set(edge.afterId, indegree.get(edge.afterId)! - 1);
      if (indegree.get(edge.afterId) === 0) {
        ready.push(edge.afterId);
        ready.sort(compareIds);
      }
    }
  }
  const base = {
    model:
      "min-squared-anchor-displacement-subject-to-fixed-order-separation" as const,
    optimalityClaim: "none" as const,
    constraints: edges.length,
    constraintVisits: 0,
    maxViolation: 0,
    usedFeasibleFallback: false,
    cycleEventIds: [] as string[],
    objective: 0
  };
  if (topological.length !== ids.length)
    return {
      ...base,
      status: "MODEL_INFEASIBLE",
      positions: {},
      cycleEventIds: ids.filter((id) => indegree.get(id)! > 0)
    };
  const positions = { ...reference };
  const multipliers = new Float64Array(edges.length);
  let constraintVisits = 0;
  let converged = edges.length === 0;
  while (!converged && constraintVisits < budget) {
    let largestUpdate = 0;
    let completedThisPass = 0;
    for (
      let i = 0;
      i < edges.length && constraintVisits < budget;
      i++, constraintVisits++
    ) {
      const edge = edges[i]!;
      const next = Math.max(
        0,
        multipliers[i]! +
          (edge.gap - positions[edge.afterId]! + positions[edge.beforeId]!) / 2
      );
      const delta = next - multipliers[i]!;
      multipliers[i] = next;
      positions[edge.beforeId] = positions[edge.beforeId]! - delta;
      positions[edge.afterId] = positions[edge.afterId]! + delta;
      largestUpdate = Math.max(largestUpdate, Math.abs(delta));
      completedThisPass++;
    }
    const violation = edges.reduce(
      (max, e) =>
        Math.max(max, e.gap - positions[e.afterId]! + positions[e.beforeId]!),
      0
    );
    converged =
      completedThisPass === edges.length &&
      largestUpdate <= A_PARAMETERS.convergenceTolerance &&
      violation <= A_PARAMETERS.convergenceTolerance;
  }
  // A bounded numerical solve may not reach feasibility. Produce a disclosed
  // feasible DAG incumbent rather than accepting a residual or moving Y.
  const usedFeasibleFallback = !converged;
  if (usedFeasibleFallback)
    for (const id of ids) positions[id] = reference[id]!;
  for (const id of topological) {
    positions[id] = Math.ceil(positions[id]!);
    for (const edge of outgoing.get(id)!)
      positions[edge.afterId] = Math.max(
        positions[edge.afterId]!,
        positions[id]! + Math.ceil(edge.gap)
      );
  }
  const centerShift = ids.length
    ? Math.round(
        ids.reduce((sum, id) => sum + positions[id]! - reference[id]!, 0) /
          ids.length
      )
    : 0;
  for (const id of ids) positions[id] = positions[id]! - centerShift;
  return {
    ...base,
    status: converged ? "CONVERGED" : "BUDGET_EXHAUSTED",
    positions,
    constraintVisits,
    usedFeasibleFallback,
    maxViolation: edges.reduce(
      (max, e) =>
        Math.max(max, e.gap - positions[e.afterId]! + positions[e.beforeId]!),
      0
    ),
    objective: ids.reduce(
      (sum, id) => sum + (positions[id]! - reference[id]!) ** 2,
      0
    )
  };
}

function shapeAnchor(shape: LayoutShape) {
  if (shape.kind === "point") return shape.position;
  if (shape.kind === "segment")
    return {
      x: (shape.start.x + shape.end.x) / 2,
      y: (shape.start.y + shape.end.y) / 2
    };
  return {
    x: (shape.bounds.minX + shape.bounds.maxX) / 2,
    y: (shape.bounds.minY + shape.bounds.maxY) / 2
  };
}
function supportAt(x: number, referenceY: number): TstlBox {
  return {
    minX: Math.floor(x - 3.5),
    maxX: Math.ceil(x + 3.5),
    minY: Math.floor(referenceY - 3.5),
    maxY: Math.ceil(referenceY + 3.5)
  };
}
function makeEvents(
  snapshot: LabSnapshot,
  baseline: BaselineArtifact,
  projection: TstlProjection,
  frame: TstlReferenceFrame,
  positions?: Readonly<Record<string, number>>
): TstlComparisonEvent[] {
  const sourceShapes = new Map(
    baseline.layout.shapes.map((shape) => [shape.event_id, shape])
  );
  const sourceEvents = new Map(
    snapshot.events.map((event) => [event.id, event])
  );
  return projection.eventIds.map((eventId) => {
    const source = sourceEvents.get(eventId)!;
    const baselineShape = sourceShapes.get(eventId);
    if (!baselineShape)
      throw Error("tstl_missing_source_shape_requires_unplaced_adapter");
    const anchor = shapeAnchor(baselineShape);
    const x = positions?.[eventId] ?? anchor.x;
    const referenceY = (anchor.y - frame.sourceYOrigin) * frame.scale;
    return {
      eventId,
      title: source.title,
      x,
      sourceY: anchor.y,
      referenceY,
      role: projection.children[eventId]!.length
        ? "compositeHeader"
        : "memberEventMark",
      support: supportAt(x, referenceY),
      baselineShape,
      collectionIds: source.collectionIds
    };
  });
}
function sourceTime(
  snapshot: LabSnapshot,
  events: readonly TstlComparisonEvent[]
): TstlTemporalRecord[] {
  const extents = new Map(
    snapshot.input.explicitExtents.map((extent) => [extent.eventId, extent])
  );
  return events.map((event) => ({
    eventId: event.eventId,
    sourceY: event.sourceY,
    descriptors: [
      {
        kind: "legacy-scalar-only",
        minY: null,
        maxY: null,
        source: {
          baselineShape: event.baselineShape,
          scalarExtent: extents.get(event.eventId) ?? null
        },
        reason:
          event.role === "compositeHeader"
            ? "Bounds midpoint is an annotation anchor, not occurrence; temporal sidecar absent."
            : "Existing B0 display anchor only; temporal sidecar absent."
      }
    ]
  }));
}
function cleanRing(points: TstlPoint[]): TstlPoint[] {
  let result = points.filter(
    (point, i) =>
      i === 0 || point.x !== points[i - 1]!.x || point.y !== points[i - 1]!.y
  );
  if (
    result.length > 1 &&
    result[0]!.x === result.at(-1)!.x &&
    result[0]!.y === result.at(-1)!.y
  )
    result.pop();
  let changed = true;
  while (changed && result.length > 4) {
    changed = false;
    result = result.filter((point, i, values) => {
      const previous = values[(i + values.length - 1) % values.length]!;
      const next = values[(i + 1) % values.length]!;
      const redundant =
        (previous.x === point.x && point.x === next.x) ||
        (previous.y === point.y && point.y === next.y);
      if (redundant) changed = true;
      return !redundant;
    });
  }
  return result;
}

/** Single-run orthogonal envelopes. Real gaps and multi-run slabs have declared
 * list/port modes. Equal-mode, overlapping adjacent strips form one staircase;
 * this adds no obstacle mesh, split/rejoin algorithm, or B/C candidate. */
export function constructSingleRunContours(
  projection: TstlProjection,
  events: readonly TstlComparisonEvent[],
  scope: readonly string[]
): { geometry: TstlGeometryInput; multiRunBands: number } {
  const glyphs = events
    .filter((event) => event.role === "memberEventMark")
    .map((event) => ({ eventId: event.eventId, support: event.support }));
  const padding = A_PARAMETERS.padding;
  const ys = [
    ...new Set(
      glyphs.flatMap(({ support }) => [
        support.minY - padding,
        support.maxY + padding
      ])
    )
  ].sort((a, b) => a - b);
  if (ys.length > A_PARAMETERS.maxSlabs)
    throw Error("tstl_slab_budget_exhausted");
  const memberSets = new Map(
    scope.map((id) => [id, new Set(projection.leafMembers[id])])
  );
  type Strip = {
    minY: number;
    maxY: number;
    bands: { compositeId: string; minX: number; maxX: number }[];
  };
  const strips: Strip[] = [];
  let multiRunBands = 0;
  for (let row = 0; row + 1 < ys.length; row++) {
    const minY = ys[row]!;
    const maxY = ys[row + 1]!;
    const active = glyphs
      .filter(
        ({ support }) =>
          support.minY - padding < maxY && support.maxY + padding > minY
      )
      .sort(
        (a, b) =>
          a.support.minX - b.support.minX || compareIds(a.eventId, b.eventId)
      );
    const bands: Strip["bands"] = [];
    for (const compositeId of [...scope].sort(compareIds)) {
      const indices = active.flatMap((glyph, index) =>
        memberSets.get(compositeId)!.has(glyph.eventId) ? [index] : []
      );
      if (indices.length === 0) continue;
      if (indices.at(-1)! - indices[0]! + 1 !== indices.length) {
        multiRunBands++;
        continue;
      }
      const members = indices.map((index) => active[index]!);
      bands.push({
        compositeId,
        minX: Math.min(...members.map(({ support }) => support.minX)) - padding,
        maxX: Math.max(...members.map(({ support }) => support.maxX)) + padding
      });
    }
    strips.push({ minY, maxY, bands });
  }
  const groups: Strip[][] = [];
  for (const strip of strips) {
    const previous = groups.at(-1)?.at(-1);
    const sameMode =
      previous &&
      previous.bands.length === strip.bands.length &&
      previous.bands.every((band, i) => {
        const next = strip.bands[i]!;
        return (
          band.compositeId === next.compositeId &&
          Math.max(band.minX, next.minX) < Math.min(band.maxX, next.maxX)
        );
      });
    if (sameMode) groups.at(-1)!.push(strip);
    else groups.push([strip]);
  }
  const patches: TstlPatch[] = groups.map((group, index) => {
    const id = `a-patch-${index}`;
    const first = group[0]!;
    const last = group.at(-1)!;
    return {
      id,
      minY: first.minY,
      maxY: last.maxY,
      modeCue: true,
      areaCompositeIds: first.bands.map((band) => band.compositeId),
      regions: first.bands.map((band, at) => ({
        id: `${id}:${band.compositeId}`,
        compositeId: band.compositeId,
        points: cleanRing([
          ...group.flatMap((strip) => [
            { x: strip.bands[at]!.minX, y: strip.minY },
            { x: strip.bands[at]!.minX, y: strip.maxY }
          ]),
          ...[...group].reverse().flatMap((strip) => [
            { x: strip.bands[at]!.maxX, y: strip.maxY },
            { x: strip.bands[at]!.maxX, y: strip.minY }
          ])
        ])
      }))
    };
  });
  return {
    geometry: {
      complete: projection.status === "COMPLETE",
      carrierIds: projection.leafIds,
      placedCarrierIds: glyphs.map((glyph) => glyph.eventId),
      members: projection.leafMembers,
      glyphs,
      patches,
      padding,
      maxCells: A_PARAMETERS.arrangementCellBudget
    },
    multiRunBands
  };
}

function typedFallback(geometry: TstlGeometryInput): TstlGeometryInput {
  return {
    ...geometry,
    patches: geometry.patches.map((patch) => ({
      ...patch,
      areaCompositeIds: [],
      regions: [],
      modeCue: true
    }))
  };
}
function repairGeometry(input: TstlGeometryInput, first: TstlGeometryResult) {
  let geometry = input;
  let validation = first;
  const attempts: { patchId: string; compositeIds: string[] }[] = [];
  while (
    !validation.geometryValid &&
    attempts.length < A_PARAMETERS.repairBudget
  ) {
    const failure = [...validation.diagnostics]
      .sort((a, b) =>
        compareIds(
          JSON.stringify([
            a.code,
            a.patchId ?? "",
            a.compositeId ?? "",
            a.eventId ?? ""
          ]),
          JSON.stringify([
            b.code,
            b.patchId ?? "",
            b.compositeId ?? "",
            b.eventId ?? ""
          ])
        )
      )
      .find((diagnostic) => diagnostic.patchId);
    if (!failure?.patchId) break;
    const patch = geometry.patches.find(
      (value) => value.id === failure.patchId
    )!;
    const removed = failure.compositeId
      ? [failure.compositeId]
      : [...patch.areaCompositeIds];
    if (removed.length === 0) break;
    geometry = {
      ...geometry,
      patches: geometry.patches.map((value) =>
        value.id !== patch.id
          ? value
          : {
              ...value,
              areaCompositeIds: value.areaCompositeIds.filter(
                (id) => !removed.includes(id)
              ),
              regions: value.regions.filter(
                (region) => !removed.includes(region.compositeId)
              )
            }
      )
    };
    attempts.push({ patchId: patch.id, compositeIds: removed });
    validation = validateTstlGeometry(geometry);
  }
  return {
    geometry,
    validation,
    repair: {
      budget: A_PARAMETERS.repairBudget,
      attempts,
      exhausted:
        !validation.geometryValid &&
        attempts.length === A_PARAMETERS.repairBudget,
      menu: "Restricted A repair: deterministic implicated patch mode downgrade only; adjacent-order, connector-width and control-X repair are deferred."
    }
  };
}

function commands(
  events: readonly TstlComparisonEvent[],
  regions: readonly TstlRegion[],
  fill: "none" | "semantic"
): TstlRenderCommands {
  return {
    pipeline: "svg-linear",
    clipping: "viewport-only",
    regions: regions.map((region) => ({
      regionId: region.id,
      points: region.points,
      fill,
      strokeWidth: fill === "semantic" ? 0 : 1
    })),
    glyphs: events.map((event) => ({
      eventId: event.eventId,
      hitTargetId: `event:${event.eventId}`,
      body: {
        minX: event.x - 3,
        maxX: event.x + 3,
        minY: event.referenceY - 3,
        maxY: event.referenceY + 3
      },
      strokeWidth: 1
    }))
  };
}
function bounds(
  events: readonly TstlComparisonEvent[],
  regions: readonly TstlRegion[]
): TstlBox {
  const points = [
    ...events.flatMap(({ support }) => [
      { x: support.minX, y: support.minY },
      { x: support.maxX, y: support.maxY }
    ]),
    ...regions.flatMap((region) => region.points)
  ];
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}
function makeLayout(
  id: "B0" | "A",
  algorithmVersion: string,
  events: TstlComparisonEvent[],
  projection: TstlProjection,
  expectedTemporal: TstlTemporalRecord[],
  frame: TstlReferenceFrame,
  provisionalGeometry: TstlGeometryInput,
  scope: readonly string[],
  multiRunBands: number,
  allowRepair: boolean
): TstlComparisonLayout {
  const expectedTimeById = new Map(
    expectedTemporal.map((record) => [record.eventId, record])
  );
  const temporal = events.map((event) => {
    const expected = expectedTimeById.get(event.eventId)!;
    return {
      eventId: event.eventId,
      sourceY: event.sourceY,
      descriptors: expected.descriptors.map((descriptor) => ({
        ...descriptor,
        source: {
          ...(descriptor.source as Record<string, unknown>),
          baselineShape: event.baselineShape
        }
      }))
    };
  });
  const provisional = validateTstlGeometry(provisionalGeometry);
  const repaired = allowRepair
    ? repairGeometry(provisionalGeometry, provisional)
    : {
        geometry: provisionalGeometry,
        validation: provisional,
        repair: {
          budget: 0,
          attempts: [],
          exhausted: false,
          menu: "B0 is replayed unchanged; no baseline geometry repairs."
        }
      };
  const temporalGate = validateTstlTemporal(
    expectedTemporal,
    temporal,
    projection.eventIds
  );
  const geometry =
    temporalGate.semanticFillEligible && repaired.validation.geometryValid
      ? repaired.geometry
      : typedFallback(repaired.geometry);
  const final = validateTstlWorldGeometry(
    projection,
    expectedTemporal,
    temporal,
    geometry,
    frame
  );
  const regions = provisionalGeometry.patches.flatMap((patch) => [
    ...patch.regions
  ]);
  const finalRegions = geometry.patches.flatMap((patch) => [...patch.regions]);
  const renderCommands = commands(events, finalRegions, "semantic");
  const diagnosticRenderCommands = commands(events, regions, "none");
  const ports = projection.eventIds.flatMap((eventId) =>
    projection.ancestors[eventId]!.map((compositeId) => ({
      eventId,
      compositeId
    }))
  );
  const incidence = validateTstlIncidence(projection, {
    memberships: projection.ancestors,
    ports,
    hitTargets: renderCommands.glyphs.map(({ eventId, hitTargetId }) => ({
      eventId,
      hitTargetId
    })),
    omitted: []
  });
  const expectedY = new Map(
    expectedTemporal.map((record) => [record.eventId, record.sourceY])
  );
  const renderGlyphs = events.map((event) => ({
    eventId: event.eventId,
    support: event.support,
    anchor: {
      x: event.x,
      y: (expectedY.get(event.eventId)! - frame.sourceYOrigin) * frame.scale
    }
  }));
  const render = validateTstlRenderCommands(
    {
      regions: finalRegions,
      glyphs: renderGlyphs,
      semanticFillEligible: final.semanticFillEligible
    },
    renderCommands
  );
  const diagnosticRender = validateTstlRenderCommands(
    { regions, glyphs: renderGlyphs, semanticFillEligible: false },
    diagnosticRenderCommands
  );
  if (
    !final.valid ||
    !incidence.valid ||
    !render.valid ||
    !diagnosticRender.valid
  )
    throw Error(
      `tstl_final_contract_failed:${JSON.stringify({ final: final.diagnostics, geometry: final.geometry.diagnostics, incidence: incidence.diagnostics, render: render.diagnostics, diagnosticRender: diagnosticRender.diagnostics })}`
    );
  const geometryHash = digest({ geometry, renderCommands });
  const canonicalHash = digest({
    algorithmVersion,
    events,
    temporal,
    geometryHash,
    provisionalGeometry,
    diagnosticRenderCommands,
    scope,
    parameters: A_PARAMETERS
  });
  return {
    id,
    algorithmVersion,
    canonicalHash,
    geometryHash,
    events,
    regions,
    renderCommands,
    diagnosticRenderCommands,
    geometry,
    provisionalGeometry,
    temporal,
    memberships: projection.ancestors,
    ports,
    validation: {
      provisional,
      repaired: repaired.validation,
      final,
      incidence,
      render,
      diagnosticRender
    },
    metrics: {
      totalEvents: events.length,
      totalComposites: projection.compositeIds.length,
      totalLeaves: projection.leafIds.length,
      geometricScopeComposites: scope.length,
      outsideScopeListOnlyComposites:
        projection.compositeIds.length - scope.length,
      provisionalRegions: regions.length,
      semanticFilledRegions: finalRegions.length,
      fallbackComposites:
        projection.compositeIds.length -
        new Set(finalRegions.map((region) => region.compositeId)).size,
      membershipPorts: ports.length,
      sourceYMismatchCount: temporalGate.diagnostics.filter(
        (diagnostic) => diagnostic.code === "TEMPORAL_SOURCE_MISMATCH"
      ).length,
      multiRunBands,
      repairedPatchModes: repaired.repair.attempts.length
    },
    bounds: bounds(events, regions),
    repair: repaired.repair,
    limitations: [
      "history-r56 is legacy-scalar-only: no semantic fill or recovered exact/uncertain/duration claim.",
      "Five requested Composite contours are compared; all 109 Composites remain accessible through exact membership lists.",
      "Diagnostic outlines are unverified geometry, not membership boundaries. Actual memberships are explicit ports and lists.",
      "Composite bounds midpoint is an annotation anchor; original bounds are retained.",
      ...(id === "A"
        ? [
            "Restricted Event-X QP and orthogonal single-run envelopes; joint boundary/move/bend optimization and full local repair menu are not implemented.",
            "No global optimality, mobile performance, temporal completeness or human comprehension claim."
          ]
        : [
            "Current global-incidence/1 and compiled contains hull replay; sloped legacy hulls are outside the exact orthogonal validator model."
          ])
    ]
  };
}

export function buildTstlComparison(
  snapshot: LabSnapshot,
  baseline: BaselineArtifact
): {
  artifact: TstlComparisonArtifact;
  measurements: Record<string, number | string>;
} {
  const started = performance.now();
  const projection = projectTstlSemantics({
    events: snapshot.events.map((event) => ({
      id: event.id,
      worldId: snapshot.worldId
    })),
    contains: snapshot.relations
      .filter((relation) => relation.type === "contains")
      .map((relation) => ({
        parentId: relation.sourceId,
        childId: relation.targetId
      })),
    complete: true
  });
  if (projection.status !== "COMPLETE")
    throw Error("tstl_invalid_source_graph");
  if (
    baseline.layout.world_id !== snapshot.worldId ||
    baseline.layout.revision !== snapshot.sourceRevision ||
    baseline.layout.time_system_id !== snapshot.timeSystemId ||
    baseline.provenance.sourceRootDigest !== snapshot.sourceRootDigest ||
    baseline.provenance.snapshotInputDigest !== snapshot.inputDigest
  )
    throw Error("tstl_baseline_revision_mismatch");
  const scope: string[] = Object.values(TSTL_CASES).sort(compareIds);
  if (scope.some((id) => !projection.compositeIds.includes(id)))
    throw Error("tstl_required_history_case_missing");
  const sourceYs = baseline.layout.shapes.map((shape) => shapeAnchor(shape).y);
  const sourceYOrigin = Math.min(...sourceYs);
  const range = Math.max(...sourceYs) - sourceYOrigin;
  const referenceFrame = {
    sourceYOrigin,
    scale: range === 0 ? 1 : A_PARAMETERS.referenceHeight / range,
    nominalHalfHeight: 3.5
  };
  const b0Events = makeEvents(snapshot, baseline, projection, referenceFrame);
  const expectedTemporal = sourceTime(snapshot, b0Events);
  const projectionMs = performance.now() - started;
  const orderStart = performance.now();
  const order = orderTstlRoots(projection);
  const orderMs = performance.now() - orderStart;
  const qpStart = performance.now();
  const byId = new Map(b0Events.map((event) => [event.eventId, event]));
  const constraints: FixedYConstraint[] = [];
  // One global order means interval-overlap constraints cannot contradict one
  // another. The solver still rejects cycles from alternative order proposals.
  for (let i = 0; i < order.eventIds.length; i++)
    for (let j = i + 1; j < order.eventIds.length; j++) {
      const left = byId.get(order.eventIds[i]!)!;
      const right = byId.get(order.eventIds[j]!)!;
      if (
        left.support.minY - 3 < right.support.maxY + 3 &&
        right.support.minY - 3 < left.support.maxY + 3
      )
        constraints.push({
          beforeId: left.eventId,
          afterId: right.eventId,
          gap: A_PARAMETERS.separation
        });
    }
  const solver = solveFixedYQp(order.referenceX, constraints);
  if (solver.status === "MODEL_INFEASIBLE" || solver.maxViolation > 0)
    throw Error("tstl_fixed_y_solver_failed");
  const aEvents = makeEvents(
    snapshot,
    baseline,
    projection,
    referenceFrame,
    solver.positions
  );
  const qpMs = performance.now() - qpStart;
  const contourStart = performance.now();
  const constructed = constructSingleRunContours(projection, aEvents, scope);
  const contourMs = performance.now() - contourStart;
  const validationStart = performance.now();
  const a = makeLayout(
    "A",
    "tstl-a-restricted/1",
    aEvents,
    projection,
    expectedTemporal,
    referenceFrame,
    constructed.geometry,
    scope,
    constructed.multiRunBands,
    true
  );
  a.order = order;
  a.solver = solver;
  const aValidationMs = performance.now() - validationStart;
  const baselineStart = performance.now();
  const b0Regions: TstlRegion[] = baseline.primitives
    .filter(
      (primitive) =>
        primitive.entity.kind !== "relation" &&
        scope.includes(primitive.entity.id)
    )
    .flatMap((primitive) =>
      primitive.geometry.kind === "polygon"
        ? primitive.geometry.rings.map((ring, index) => ({
            id: `b0:${primitive.id}:${index}`,
            compositeId: primitive.entity.id,
            points: ring.map((point) => ({
              x: point.x,
              y: (point.y - referenceFrame.sourceYOrigin) * referenceFrame.scale
            }))
          }))
        : []
    );
  const b0Bounds = bounds(b0Events, b0Regions);
  const b0Geometry: TstlGeometryInput = {
    complete: true,
    carrierIds: projection.leafIds,
    placedCarrierIds: projection.leafIds,
    members: projection.leafMembers,
    glyphs: b0Events
      .filter((event) => event.role === "memberEventMark")
      .map((event) => ({ eventId: event.eventId, support: event.support })),
    padding: 3,
    patches: [
      {
        id: "b0-world",
        minY: Math.floor(b0Bounds.minY) - 3,
        maxY: Math.ceil(b0Bounds.maxY) + 3,
        modeCue: true,
        areaCompositeIds: scope,
        regions: b0Regions
      }
    ]
  };
  const b0 = makeLayout(
    "B0",
    baseline.layout.algorithm_version,
    b0Events,
    projection,
    expectedTemporal,
    referenceFrame,
    b0Geometry,
    scope,
    0,
    false
  );
  const b0ValidationMs = performance.now() - baselineStart;
  return {
    artifact: {
      formatVersion: "tstl-comparison/1",
      source: {
        worldId: snapshot.worldId,
        revision: snapshot.sourceRevision,
        timeSystemId: snapshot.timeSystemId,
        sourceRootDigest: snapshot.sourceRootDigest,
        inputDigest: snapshot.inputDigest
      },
      snapshot,
      projection,
      referenceFrame,
      geometryScopeCompositeIds: scope,
      cases: TSTL_CASES,
      parameters: A_PARAMETERS,
      b0,
      a
    },
    measurements: {
      projectionMs,
      orderMs,
      qpMs,
      contourMs,
      aValidationMs,
      b0ValidationMs,
      totalMs: performance.now() - started,
      measurementScope:
        "Node offline comparison only; browser, device, mesh and GPU not measured here"
    }
  };
}
