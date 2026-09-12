// Source: neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760
// shared/domain/src/chart-plane-projection.ts. Local type/anchor imports only.
import type {
  ChartPlaneDiagnostic,
  GraphEntityEditorial,
  Dataset,
  EventRecord,
  GraphShellChartPlane,
  GraphShellChartPlanePointEntity,
  GraphShellChartPlaneRegionEntity,
  GraphShellChartPlaneSegmentEntity,
  GraphShellChronologyBoard,
  ChartPlaneWorldBounds
} from "./urdr-layout-types.js";
import {
  getTemporalDirectionForRelationType,
  getTemporalDirectionForStructuralLinkKind
} from "./urdr-layout-types.js";

import { getEventAnchorsWithComputedCompatibility } from "./urdr-layout-types.js";

export const CHRONOLOGY_YEAR_SPACING = 140;
export const LANE_SPACING = 110;
const ORDER_MIN_GAP_YEARS = 0.001;
const ONE_SIDED_OFFSET_YEARS = 0.75;
// Retained verbatim for pinned-source parity; unused in the original producer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LANE_X_CONFLICT_YEARS = 0.65;
const DENSE_LANE_WARNING_THRESHOLD = 8;
const SAME_SPAN_DISTRIBUTION_PADDING_RATIO = 0.08;
const FORCEGRAPH_X_ITERATIONS = 32;
const FORCEGRAPH_X_REPULSION = 0.03;
const FORCEGRAPH_X_CAUSES_ATTRACTION = 0.22;
const FORCEGRAPH_X_TEMPORAL_ATTRACTION = 0.12;
const FORCEGRAPH_X_MAX_STEP = 0.22;

export type ChartPlaneXForceLayoutOptions = {
  iterations: number;
  repulsion: number;
  causesAttraction: number;
  temporalAttraction: number;
  maxStep: number;
};

export const DEFAULT_CHART_PLANE_X_FORCE_LAYOUT: ChartPlaneXForceLayoutOptions =
  {
    iterations: FORCEGRAPH_X_ITERATIONS,
    repulsion: FORCEGRAPH_X_REPULSION,
    causesAttraction: FORCEGRAPH_X_CAUSES_ATTRACTION,
    temporalAttraction: FORCEGRAPH_X_TEMPORAL_ATTRACTION,
    maxStep: FORCEGRAPH_X_MAX_STEP
  };

type PrimitiveGeometry =
  | GraphShellChartPlanePointEntity
  | GraphShellChartPlaneSegmentEntity
  | GraphShellChartPlaneRegionEntity;

function toGraphEntityEditorial(
  event: EventRecord
): GraphEntityEditorial | undefined {
  const classification = event.editorial?.classification;
  if (!classification) {
    return undefined;
  }

  return {
    role: classification.role,
    importance: classification.importance,
    contentDensity: classification.contentDensity,
    certaintyPosture: classification.certaintyPosture
  };
}

function createPointBounds(point: {
  x: number;
  y: number;
}): ChartPlaneWorldBounds {
  return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
}

function createSegmentBounds(
  start: { x: number; y: number },
  end: { x: number; y: number }
): ChartPlaneWorldBounds {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y)
  };
}

function mergeWorldBounds(
  bounds: ChartPlaneWorldBounds[]
): ChartPlaneWorldBounds {
  const first = bounds[0]!;
  return bounds.slice(1).reduce(
    (current, next) => ({
      minX: Math.min(current.minX, next.minX),
      minY: Math.min(current.minY, next.minY),
      maxX: Math.max(current.maxX, next.maxX),
      maxY: Math.max(current.maxY, next.maxY)
    }),
    { ...first }
  );
}

function getGeometryWorldBounds(
  geometry: PrimitiveGeometry
): ChartPlaneWorldBounds {
  if (geometry.geometryKind === "point") {
    return createPointBounds(geometry.position);
  }
  if (geometry.geometryKind === "segment") {
    return createSegmentBounds(geometry.start, geometry.end);
  }
  return geometry.worldBounds;
}

type ProcessRegionDerivationInput = {
  event: EventRecord;
  childGeometries: PrimitiveGeometry[];
  contains: string[];
  containedBy?: string | undefined;
  validationState: "ok" | "warning" | "error";
};

type ProcessRegionDerivationResult = {
  entity: GraphShellChartPlaneRegionEntity;
  diagnostics: ChartPlaneDiagnostic[];
};

export interface ProcessRegionDerivationStrategy {
  readonly id: string;
  deriveRegion(
    input: ProcessRegionDerivationInput
  ): ProcessRegionDerivationResult;
}

class ContainedChildEnvelopeRegionStrategy implements ProcessRegionDerivationStrategy {
  readonly id = "contained-child-envelope/v1";

  deriveRegion(
    input: ProcessRegionDerivationInput
  ): ProcessRegionDerivationResult {
    if (input.childGeometries.length === 0) {
      const diagnostics: ChartPlaneDiagnostic[] = [
        {
          code: "missing-contained-geometry",
          severity: "warning",
          message: `Region ${input.event.id} has no solved child geometry yet, so a placeholder boundary was emitted.`
        }
      ];
      return {
        diagnostics,
        entity: {
          id: input.event.id,
          eventId: input.event.id,
          canonId: input.event.canonId,
          label: input.event.title,
          geometryKind: "region",
          validationState: input.validationState,
          contains: input.contains,
          containedBy: input.containedBy,
          diagnostics,
          viewportClass: "visible",
          editorial: toGraphEntityEditorial(input.event),
          worldBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
        }
      };
    }

    return {
      diagnostics: [],
      entity: {
        id: input.event.id,
        eventId: input.event.id,
        canonId: input.event.canonId,
        label: input.event.title,
        geometryKind: "region",
        validationState: input.validationState,
        contains: input.contains,
        containedBy: input.containedBy,
        diagnostics: [],
        viewportClass: "visible",
        editorial: toGraphEntityEditorial(input.event),
        worldBounds: mergeWorldBounds(
          input.childGeometries.map(getGeometryWorldBounds)
        )
      }
    };
  }
}

export type TemporalConstraint = {
  beforeId: string;
  afterId: string;
  source: string;
  minGapYears: number;
};

type ContainmentParentCandidate = {
  parentId: string;
  sourceKind: "structural" | "semantic";
  relationType: string;
};

type RenderEventKind = "anchor" | "instant" | "composite";

function toComparableGregorianYear(point: {
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  era?: "BCE" | "CE" | undefined;
}) {
  const baseYear =
    (point.era ?? "CE") === "BCE" ? -Math.abs(point.year) : point.year;
  const monthOffset = ((point.month ?? 1) - 1) / 12;
  const dayOffset = ((point.day ?? 1) - 1) / 365;
  const hourOffset = (point.hour ?? 0) / (24 * 365);
  const minuteOffset = (point.minute ?? 0) / (24 * 60 * 365);
  const secondOffset = (point.second ?? 0) / (24 * 60 * 60 * 365);

  return (
    baseYear +
    monthOffset +
    dayOffset +
    hourOffset +
    minuteOffset +
    secondOffset
  );
}

function getNextGregorianPoint(
  point: {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    era?: "BCE" | "CE" | undefined;
  },
  precision?: "year" | "month" | "day" | "hour" | "minute" | "second"
) {
  if (precision === "year") {
    return {
      year: point.year + 1,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      era: point.era,
      timezone: "UTC"
    };
  }

  if (precision === "month") {
    const month = point.month ?? 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? point.year + 1 : point.year;
    return {
      year: nextYear,
      month: nextMonth,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      era: point.era,
      timezone: "UTC"
    };
  }

  return null;
}

function getPrimaryGregorianExtent(event: EventRecord) {
  const authoredAnchors = getEventAnchorsWithComputedCompatibility(event)
    .filter((anchor) => anchor.scheme === "gregorian_utc")
    .map((anchor) => {
      const start = anchor.instant ?? anchor.range?.start;
      if (!start) {
        return null;
      }

      const explicitEnd = anchor.range?.end;
      const inferredEnd = explicitEnd
        ? null
        : getNextGregorianPoint(start, anchor.precision);

      return {
        minYear: toComparableGregorianYear(start),
        maxYear: toComparableGregorianYear(explicitEnd ?? inferredEnd ?? start)
      };
    })
    .filter((anchor): anchor is { minYear: number; maxYear: number } =>
      Boolean(anchor)
    )
    .sort((left, right) => left.minYear - right.minYear);

  return authoredAnchors[0];
}

export function chronologyYearToWorldY(
  board: GraphShellChronologyBoard,
  year: number
) {
  const centerYear = (board.axis.startYear + board.axis.endYear) / 2;
  return (year - centerYear) * CHRONOLOGY_YEAR_SPACING;
}

export function laneIndexToWorldX(index: number) {
  return index * LANE_SPACING;
}

function addConstraint(
  constraints: TemporalConstraint[],
  beforeId: string,
  afterId: string,
  source: string
) {
  if (!beforeId || !afterId || beforeId === afterId) {
    return;
  }

  constraints.push({
    beforeId,
    afterId,
    source,
    minGapYears: ORDER_MIN_GAP_YEARS
  });
}

function buildTemporalConstraints(dataset: Dataset): TemporalConstraint[] {
  const constraints: TemporalConstraint[] = [];

  for (const link of dataset.structuralLinks) {
    if (getTemporalDirectionForStructuralLinkKind(link.type) === "forward") {
      addConstraint(
        constraints,
        link.fromEventId,
        link.toEventId,
        `structural:${link.type}`
      );
    }
  }

  for (const link of dataset.semanticLinks) {
    const direction = getTemporalDirectionForRelationType(link.type);
    if (direction === "forward") {
      addConstraint(
        constraints,
        link.fromId,
        link.toId,
        `semantic:${link.type}`
      );
      continue;
    }

    if (direction === "reverse") {
      addConstraint(
        constraints,
        link.toId,
        link.fromId,
        `semantic:${link.type}`
      );
    }
  }

  return constraints;
}

function classifyEventKind(
  event: EventRecord,
  containsCount: number
): RenderEventKind {
  if (event.type === "temporal-anchor") {
    return "anchor";
  }

  if (event.type === "instant") {
    return "instant";
  }

  if (containsCount > 0 || event.type.toLowerCase().includes("composite")) {
    return "composite";
  }

  return "instant";
}

function addUniqueChild(
  childIdsByParent: Map<string, string[]>,
  parentId: string,
  childId: string
) {
  const children = childIdsByParent.get(parentId) ?? [];
  if (!children.includes(childId)) {
    children.push(childId);
    childIdsByParent.set(parentId, children);
  }
}

function addUniqueParent(
  parentIdsByChild: Map<string, string[]>,
  childId: string,
  parentId: string
) {
  const parents = parentIdsByChild.get(childId) ?? [];
  if (!parents.includes(parentId)) {
    parents.push(parentId);
  }
  parentIdsByChild.set(childId, parents);
}

function addParentCandidate(
  parentCandidatesByChild: Map<string, ContainmentParentCandidate[]>,
  childId: string,
  candidate: ContainmentParentCandidate
) {
  const existing = parentCandidatesByChild.get(childId) ?? [];
  const existingIndex = existing.findIndex(
    (entry) => entry.parentId === candidate.parentId
  );
  if (existingIndex >= 0) {
    const current = existing[existingIndex]!;
    if (
      current.sourceKind === "semantic" &&
      candidate.sourceKind === "structural"
    ) {
      existing[existingIndex] = candidate;
    }
    parentCandidatesByChild.set(childId, existing);
    return;
  }

  existing.push(candidate);
  parentCandidatesByChild.set(childId, existing);
}

function appendEventDiagnostic(
  store: Map<string, ChartPlaneDiagnostic[]>,
  eventId: string,
  diagnostic: ChartPlaneDiagnostic
) {
  const list = store.get(eventId) ?? [];
  const duplicate = list.some(
    (candidate) =>
      candidate.code === diagnostic.code &&
      candidate.severity === diagnostic.severity &&
      candidate.message === diagnostic.message
  );

  if (!duplicate) {
    list.push(diagnostic);
    store.set(eventId, list);
  }
}

function resolveFeasibleInterval(
  eventId: string,
  explicitExtent: { minYear: number; maxYear: number } | undefined,
  constraintsByAfterId: Map<string, TemporalConstraint[]>,
  constraintsByBeforeId: Map<string, TemporalConstraint[]>,
  placedYearByEventId: Map<string, number>
):
  | { state: "insufficient" }
  | { state: "contradiction"; minYear: number; maxYear: number }
  | { state: "ok"; minYear: number; maxYear: number } {
  let minYear = Number.NEGATIVE_INFINITY;
  let maxYear = Number.POSITIVE_INFINITY;
  let hasConstraint = false;

  if (explicitExtent) {
    minYear = Math.max(minYear, explicitExtent.minYear);
    maxYear = Math.min(maxYear, explicitExtent.maxYear);
    hasConstraint = true;
  }

  for (const constraint of constraintsByAfterId.get(eventId) ?? []) {
    const beforeYear = placedYearByEventId.get(constraint.beforeId);
    if (beforeYear === undefined) {
      continue;
    }

    minYear = Math.max(minYear, beforeYear + constraint.minGapYears);
    hasConstraint = true;
  }

  for (const constraint of constraintsByBeforeId.get(eventId) ?? []) {
    const afterYear = placedYearByEventId.get(constraint.afterId);
    if (afterYear === undefined) {
      continue;
    }

    maxYear = Math.min(maxYear, afterYear - constraint.minGapYears);
    hasConstraint = true;
  }

  if (!hasConstraint) {
    return { state: "insufficient" };
  }

  if (minYear >= maxYear) {
    return { state: "contradiction", minYear, maxYear };
  }

  return { state: "ok", minYear, maxYear };
}

function pickPlacementYear(minYear: number, maxYear: number) {
  const hasLower = Number.isFinite(minYear);
  const hasUpper = Number.isFinite(maxYear);

  if (hasLower && hasUpper) {
    return (minYear + maxYear) / 2;
  }

  if (hasLower) {
    return minYear + ONE_SIDED_OFFSET_YEARS;
  }

  if (hasUpper) {
    return maxYear - ONE_SIDED_OFFSET_YEARS;
  }

  return null;
}

function getIntervalPriority(minYear: number, maxYear: number) {
  const hasLower = Number.isFinite(minYear);
  const hasUpper = Number.isFinite(maxYear);

  if (hasLower && hasUpper) {
    return 0;
  }

  if (hasLower) {
    return 1;
  }

  if (hasUpper) {
    return 2;
  }

  return 3;
}

type PlacementCandidate = {
  eventId: string;
  year: number;
  minYear: number;
  maxYear: number;
  priority: number;
};

function buildPlacementIntervalKey(candidate: PlacementCandidate) {
  return `${candidate.priority}:${candidate.minYear.toFixed(6)}:${candidate.maxYear.toFixed(6)}`;
}

function intervalsOverlap(left: PlacementCandidate, right: PlacementCandidate) {
  return left.minYear <= right.maxYear && right.minYear <= left.maxYear;
}

function hasDirectConstraint(
  beforeId: string,
  afterId: string,
  constraintsByBeforeId: Map<string, TemporalConstraint[]>
) {
  return (constraintsByBeforeId.get(beforeId) ?? []).some(
    (constraint) => constraint.afterId === afterId
  );
}

function shouldClusterCandidates(
  left: PlacementCandidate,
  right: PlacementCandidate,
  constraintsByBeforeId: Map<string, TemporalConstraint[]>
) {
  if (buildPlacementIntervalKey(left) === buildPlacementIntervalKey(right)) {
    return true;
  }

  if (!intervalsOverlap(left, right)) {
    return false;
  }

  return (
    hasDirectConstraint(left.eventId, right.eventId, constraintsByBeforeId) ||
    hasDirectConstraint(right.eventId, left.eventId, constraintsByBeforeId)
  );
}

function buildCandidateClusters(
  candidates: PlacementCandidate[],
  constraintsByBeforeId: Map<string, TemporalConstraint[]>
) {
  const clusters: PlacementCandidate[][] = [];
  const visited = new Set<string>();

  for (const candidate of candidates) {
    if (visited.has(candidate.eventId)) {
      continue;
    }

    const cluster: PlacementCandidate[] = [];
    const queue = [candidate];
    visited.add(candidate.eventId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);

      for (const other of candidates) {
        if (visited.has(other.eventId)) {
          continue;
        }

        if (!shouldClusterCandidates(current, other, constraintsByBeforeId)) {
          continue;
        }

        visited.add(other.eventId);
        queue.push(other);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function topologicallyOrderCandidateCluster(
  cluster: PlacementCandidate[],
  constraintsByAfterId: Map<string, TemporalConstraint[]>
) {
  const clusterIds = new Set(cluster.map((candidate) => candidate.eventId));
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const originalIndexById = new Map(
    cluster.map((candidate, index) => [candidate.eventId, index])
  );

  for (const candidate of cluster) {
    adjacency.set(candidate.eventId, new Set<string>());
    indegree.set(candidate.eventId, 0);
  }

  for (const candidate of cluster) {
    for (const constraint of constraintsByAfterId.get(candidate.eventId) ??
      []) {
      if (!clusterIds.has(constraint.beforeId)) {
        continue;
      }

      const edges = adjacency.get(constraint.beforeId)!;
      if (edges.has(candidate.eventId)) {
        continue;
      }

      edges.add(candidate.eventId);
      indegree.set(
        candidate.eventId,
        (indegree.get(candidate.eventId) ?? 0) + 1
      );
    }
  }

  const queue = cluster
    .filter((candidate) => (indegree.get(candidate.eventId) ?? 0) === 0)
    .sort(
      (left, right) =>
        left.year - right.year ||
        (originalIndexById.get(left.eventId) ?? 0) -
          (originalIndexById.get(right.eventId) ?? 0)
    );
  const ordered: PlacementCandidate[] = [];

  while (queue.length > 0) {
    const next = queue.shift()!;
    ordered.push(next);

    for (const afterId of adjacency.get(next.eventId) ?? []) {
      const remaining = (indegree.get(afterId) ?? 0) - 1;
      indegree.set(afterId, remaining);
      if (remaining > 0) {
        continue;
      }

      const afterCandidate = cluster.find(
        (candidate) => candidate.eventId === afterId
      );
      if (!afterCandidate) {
        continue;
      }

      queue.push(afterCandidate);
      queue.sort(
        (left, right) =>
          left.year - right.year ||
          (originalIndexById.get(left.eventId) ?? 0) -
            (originalIndexById.get(right.eventId) ?? 0)
      );
    }
  }

  return ordered.length === cluster.length
    ? ordered
    : [...cluster].sort(
        (left, right) =>
          left.year - right.year ||
          (originalIndexById.get(left.eventId) ?? 0) -
            (originalIndexById.get(right.eventId) ?? 0)
      );
}

function redistributeCandidateClusterYears(
  cluster: PlacementCandidate[],
  constraintsByAfterId: Map<string, TemporalConstraint[]>
) {
  if (cluster.length < 2) {
    return cluster;
  }

  const minYear = Math.min(...cluster.map((candidate) => candidate.minYear));
  const maxYear = Math.max(...cluster.map((candidate) => candidate.maxYear));
  const span = maxYear - minYear;
  if (!Number.isFinite(span) || span <= ORDER_MIN_GAP_YEARS * cluster.length) {
    return cluster;
  }

  const ordered = topologicallyOrderCandidateCluster(
    cluster,
    constraintsByAfterId
  );
  const padding = span * SAME_SPAN_DISTRIBUTION_PADDING_RATIO;
  const paddedMin = minYear + padding;
  const paddedMax = maxYear - padding;
  const usableSpan = paddedMax - paddedMin;
  if (usableSpan <= ORDER_MIN_GAP_YEARS * cluster.length) {
    return cluster;
  }

  const step = usableSpan / Math.max(ordered.length - 1, 1);

  return ordered.map((candidate, index) => ({
    ...candidate,
    year:
      ordered.length === 1
        ? (paddedMin + paddedMax) / 2
        : paddedMin + step * index
  }));
}

function createPointEntity(
  event: EventRecord,
  year: number,
  lane: number,
  contains: string[],
  containedBy: string | undefined,
  validationState: "ok" | "warning" | "error",
  board: GraphShellChronologyBoard,
  diagnostics: ChartPlaneDiagnostic[]
): GraphShellChartPlanePointEntity {
  return {
    id: event.id,
    eventId: event.id,
    canonId: event.canonId,
    label: event.title,
    geometryKind: "point",
    validationState,
    contains,
    containedBy,
    diagnostics,
    viewportClass: "visible",
    editorial: toGraphEntityEditorial(event),
    position: {
      x: laneIndexToWorldX(lane),
      y: chronologyYearToWorldY(board, year)
    }
  };
}

function redistributePlacedPointClusters(
  context: ProjectionPreparedContext,
  chronologyBoard: GraphShellChronologyBoard,
  state: ProjectionMutableState
) {
  const pointCandidates = context.scopedEvents
    .filter((event) => {
      const kind = context.eventKindById.get(event.id);
      return kind === "instant" || kind === "anchor";
    })
    .map((event) => {
      const geometry = state.geometryByEventId.get(event.id);
      const year = state.placedYearByEventId.get(event.id);
      const extent = context.explicitExtentByEventId.get(event.id);
      if (
        !geometry ||
        geometry.geometryKind !== "point" ||
        year === undefined ||
        !extent
      ) {
        return null;
      }

      return {
        event,
        lane: Math.round(geometry.position.x / LANE_SPACING),
        candidate: {
          eventId: event.id,
          year,
          minYear: extent.minYear,
          maxYear: extent.maxYear,
          priority: getIntervalPriority(extent.minYear, extent.maxYear)
        } satisfies PlacementCandidate
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate)
    );

  const candidateClusters = buildCandidateClusters(
    pointCandidates.map((candidate) => candidate.candidate),
    context.constraintsByBeforeId
  );

  for (const redistributedClusterCandidates of candidateClusters) {
    const cluster = redistributedClusterCandidates
      .map((candidate) =>
        pointCandidates.find(
          (entry) => entry.candidate.eventId === candidate.eventId
        )
      )
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate)
      );

    if (cluster.length < 2) {
      continue;
    }

    const redistributed = redistributeCandidateClusterYears(
      cluster.map((candidate) => candidate.candidate),
      context.constraintsByAfterId
    );

    for (const candidate of redistributed) {
      const original = cluster.find(
        (entry) => entry.candidate.eventId === candidate.eventId
      );
      if (!original) {
        continue;
      }

      const entity = createPointEntity(
        original.event,
        candidate.year,
        original.lane,
        context.childIdsByParent.get(original.event.id) ?? [],
        (context.parentIdsByChild.get(original.event.id) ?? [])[0],
        context.validationStateFor(original.event.id),
        chronologyBoard,
        state.eventDiagnosticsById.get(original.event.id) ?? []
      );

      state.placedYearByEventId.set(original.event.id, candidate.year);
      state.geometryByEventId.set(original.event.id, entity);
    }
  }
}

type ProjectionPreparedContext = {
  strategy: ProcessRegionDerivationStrategy;
  validationStateFor: (recordId: string) => "ok" | "warning" | "error";
  scopedEvents: EventRecord[];
  scopedStructuralLinks: Dataset["structuralLinks"];
  scopedSemanticLinks: Dataset["semanticLinks"];
  eventById: Map<string, EventRecord>;
  childIdsByParent: Map<string, string[]>;
  parentIdsByChild: Map<string, string[]>;
  parentCandidatesByChild: Map<string, ContainmentParentCandidate[]>;
  constraintsByAfterId: Map<string, TemporalConstraint[]>;
  constraintsByBeforeId: Map<string, TemporalConstraint[]>;
  explicitExtentByEventId: Map<
    string,
    { minYear: number; maxYear: number } | undefined
  >;
  eventKindById: Map<string, RenderEventKind>;
};

type ProjectionMutableState = {
  diagnostics: ChartPlaneDiagnostic[];
  eventDiagnosticsById: Map<string, ChartPlaneDiagnostic[]>;
  geometryByEventId: Map<string, PrimitiveGeometry>;
  placedYearByEventId: Map<string, number>;
  laneYearsByIndex: Map<number, number[]>;
};

type BuildGraphShellChartPlaneOptions = {
  strategy?: ProcessRegionDerivationStrategy;
  getValidationState?: (recordId: string) => "ok" | "warning" | "error";
  xForceLayout?: Partial<ChartPlaneXForceLayoutOptions>;
  /** Moirai resolves lossless Canon semantics before entering legacy layout. */
  explicitExtents?: ReadonlyMap<string, { minYear: number; maxYear: number }>;
  temporalConstraints?: TemporalConstraint[];
};

type ForceLayoutPointNode = {
  eventId: string;
  x: number;
  fixed: boolean;
};

type ForceLayoutEdge = {
  leftId: string;
  rightId: string;
  weight: number;
};

function createProjectionMutableState(): ProjectionMutableState {
  return {
    diagnostics: [],
    eventDiagnosticsById: new Map<string, ChartPlaneDiagnostic[]>(),
    geometryByEventId: new Map<string, PrimitiveGeometry>(),
    placedYearByEventId: new Map<string, number>(),
    laneYearsByIndex: new Map<number, number[]>()
  };
}

type VerticalInterval = {
  minYear: number;
  maxYear: number;
};

function resolveEntityVerticalInterval(
  eventId: string,
  context: ProjectionPreparedContext,
  state: ProjectionMutableState,
  cache: Map<string, VerticalInterval | null>
): VerticalInterval | null {
  const cached = cache.get(eventId);
  if (cached !== undefined) {
    return cached;
  }

  const explicitExtent = context.explicitExtentByEventId.get(eventId);
  if (explicitExtent) {
    const interval = {
      minYear: explicitExtent.minYear,
      maxYear: explicitExtent.maxYear
    } satisfies VerticalInterval;
    cache.set(eventId, interval);
    return interval;
  }

  const placedYear = state.placedYearByEventId.get(eventId);
  if (placedYear !== undefined) {
    const interval = {
      minYear: placedYear,
      maxYear: placedYear
    } satisfies VerticalInterval;
    cache.set(eventId, interval);
    return interval;
  }

  const childIntervals = (context.childIdsByParent.get(eventId) ?? [])
    .map((childId) =>
      resolveEntityVerticalInterval(childId, context, state, cache)
    )
    .filter((interval): interval is VerticalInterval => Boolean(interval));
  if (childIntervals.length > 0) {
    const interval = {
      minYear: Math.min(
        ...childIntervals.map((candidate) => candidate.minYear)
      ),
      maxYear: Math.max(...childIntervals.map((candidate) => candidate.maxYear))
    } satisfies VerticalInterval;
    cache.set(eventId, interval);
    return interval;
  }

  cache.set(eventId, null);
  return null;
}

function chooseVisibleContainedBy(
  childId: string,
  context: ProjectionPreparedContext,
  state: ProjectionMutableState,
  cache: Map<string, VerticalInterval | null>
) {
  const candidates = context.parentCandidatesByChild.get(childId) ?? [];
  if (candidates.length === 0) {
    return { selectedParentId: undefined, suppressedParentIds: [] as string[] };
  }

  const structuralCandidates = candidates.filter(
    (candidate) => candidate.sourceKind === "structural"
  );
  const normalizedCandidates =
    structuralCandidates.length > 0 ? structuralCandidates : candidates;
  const childInterval = resolveEntityVerticalInterval(
    childId,
    context,
    state,
    cache
  );

  const scored = normalizedCandidates.map((candidate) => {
    const parentInterval = resolveEntityVerticalInterval(
      candidate.parentId,
      context,
      state,
      cache
    );
    const containsChild = Boolean(
      childInterval &&
      parentInterval &&
      parentInterval.minYear <= childInterval.minYear &&
      parentInterval.maxYear >= childInterval.maxYear
    );
    const span = parentInterval
      ? parentInterval.maxYear - parentInterval.minYear
      : Number.POSITIVE_INFINITY;
    const midpointDistance =
      childInterval && parentInterval
        ? Math.abs(
            (parentInterval.minYear + parentInterval.maxYear) / 2 -
              (childInterval.minYear + childInterval.maxYear) / 2
          )
        : Number.POSITIVE_INFINITY;

    return {
      ...candidate,
      containsChild,
      span,
      midpointDistance
    };
  });

  scored.sort((left, right) => {
    if (left.containsChild !== right.containsChild) {
      return left.containsChild ? -1 : 1;
    }
    if (left.span !== right.span) {
      return left.span - right.span;
    }
    if (left.midpointDistance !== right.midpointDistance) {
      return left.midpointDistance - right.midpointDistance;
    }
    return left.parentId.localeCompare(right.parentId);
  });

  const selectedParentId = scored[0]?.parentId;
  const suppressedParentIds = scored
    .slice(1)
    .map((candidate) => candidate.parentId);
  return { selectedParentId, suppressedParentIds };
}

function normalizeContainedByAssignments(
  context: ProjectionPreparedContext,
  state: ProjectionMutableState
) {
  const intervalCache = new Map<string, VerticalInterval | null>();

  for (const [eventId, geometry] of state.geometryByEventId) {
    const { selectedParentId, suppressedParentIds } = chooseVisibleContainedBy(
      eventId,
      context,
      state,
      intervalCache
    );
    state.geometryByEventId.set(eventId, {
      ...geometry,
      containedBy: selectedParentId
    } as PrimitiveGeometry);

    if (suppressedParentIds.length === 0 || !selectedParentId) {
      continue;
    }

    const warning: ChartPlaneDiagnostic = {
      code: "multiple-containment-parents",
      severity: "warning",
      message: `Event ${eventId} has multiple containment parents (${[selectedParentId, ...suppressedParentIds].join(", ")}); selected ${selectedParentId} as visible containedBy and suppressed ${suppressedParentIds.join(", ")}.`
    };
    state.diagnostics.push(warning);
    appendEventDiagnostic(state.eventDiagnosticsById, eventId, warning);
  }
}

function resolveChartPlaneXForceLayoutOptions(
  options: Partial<ChartPlaneXForceLayoutOptions> | undefined
): ChartPlaneXForceLayoutOptions {
  return {
    iterations: Math.max(
      0,
      Math.round(
        options?.iterations ?? DEFAULT_CHART_PLANE_X_FORCE_LAYOUT.iterations
      )
    ),
    repulsion: Math.max(
      0,
      options?.repulsion ?? DEFAULT_CHART_PLANE_X_FORCE_LAYOUT.repulsion
    ),
    causesAttraction: Math.max(
      0,
      options?.causesAttraction ??
        DEFAULT_CHART_PLANE_X_FORCE_LAYOUT.causesAttraction
    ),
    temporalAttraction: Math.max(
      0,
      options?.temporalAttraction ??
        DEFAULT_CHART_PLANE_X_FORCE_LAYOUT.temporalAttraction
    ),
    maxStep: Math.max(
      0,
      options?.maxStep ?? DEFAULT_CHART_PLANE_X_FORCE_LAYOUT.maxStep
    )
  };
}

function buildXForceEdges(
  context: ProjectionPreparedContext,
  nodeById: Map<string, ForceLayoutPointNode>,
  options: ChartPlaneXForceLayoutOptions
) {
  const edgeByKey = new Map<string, ForceLayoutEdge>();

  const registerEdge = (leftId: string, rightId: string, weight: number) => {
    if (!nodeById.has(leftId) || !nodeById.has(rightId) || leftId === rightId) {
      return;
    }

    const key =
      leftId < rightId ? `${leftId}::${rightId}` : `${rightId}::${leftId}`;
    const previous = edgeByKey.get(key);
    if (!previous || weight > previous.weight) {
      edgeByKey.set(key, {
        leftId: leftId < rightId ? leftId : rightId,
        rightId: leftId < rightId ? rightId : leftId,
        weight
      });
    }
  };

  for (const [beforeId, constraints] of context.constraintsByBeforeId) {
    for (const constraint of constraints) {
      registerEdge(beforeId, constraint.afterId, options.temporalAttraction);
    }
  }

  for (const link of context.scopedStructuralLinks) {
    if (link.type === "CAUSES") {
      registerEdge(link.fromEventId, link.toEventId, options.causesAttraction);
      continue;
    }

    if (link.type === "PRECEDES") {
      registerEdge(
        link.fromEventId,
        link.toEventId,
        options.temporalAttraction
      );
    }
  }

  for (const link of context.scopedSemanticLinks) {
    const direction = getTemporalDirectionForRelationType(link.type);
    if (!direction || direction === "none") {
      continue;
    }

    registerEdge(link.fromId, link.toId, options.temporalAttraction);
  }

  return [...edgeByKey.values()];
}

function optimizePointXPositions(
  context: ProjectionPreparedContext,
  state: ProjectionMutableState,
  options: ChartPlaneXForceLayoutOptions
) {
  const nodes = context.scopedEvents
    .map((event) => {
      const geometry = state.geometryByEventId.get(event.id);
      const year = state.placedYearByEventId.get(event.id);
      const kind = context.eventKindById.get(event.id);
      if (
        !geometry ||
        geometry.geometryKind !== "point" ||
        year === undefined ||
        !kind
      ) {
        return null;
      }

      return {
        eventId: event.id,
        x: kind === "anchor" ? 0 : geometry.position.x / LANE_SPACING,
        fixed: kind === "anchor"
      } satisfies ForceLayoutPointNode;
    })
    .filter((node): node is ForceLayoutPointNode => Boolean(node));

  if (nodes.length < 2) {
    return;
  }

  const nodeById = new Map(nodes.map((node) => [node.eventId, node]));
  const edges = buildXForceEdges(context, nodeById, options);

  const movableNodes = nodes.filter((node) => !node.fixed);
  if (movableNodes.length === 0) {
    return;
  }

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const cooling = 1 - iteration / Math.max(options.iterations, 1);
    const nextXByEventId = new Map<string, number>();

    for (const node of nodes) {
      if (node.fixed) {
        nextXByEventId.set(node.eventId, node.x);
        continue;
      }

      let force = 0;
      for (const other of nodes) {
        if (other.eventId === node.eventId || other.fixed) {
          continue;
        }

        const deltaX = node.x - other.x;
        const absoluteGap = Math.max(Math.abs(deltaX), 0.08);
        const direction =
          Math.abs(deltaX) < 0.0001
            ? node.eventId.localeCompare(other.eventId) < 0
              ? -1
              : 1
            : deltaX / Math.abs(deltaX);
        force += direction * (options.repulsion / (absoluteGap * absoluteGap));
      }

      for (const edge of edges) {
        if (edge.leftId !== node.eventId && edge.rightId !== node.eventId) {
          continue;
        }

        const otherId =
          edge.leftId === node.eventId ? edge.rightId : edge.leftId;
        const other = nodeById.get(otherId);
        if (!other) {
          continue;
        }

        force += (other.x - node.x) * edge.weight;
      }

      const step = Math.max(
        -options.maxStep,
        Math.min(options.maxStep, force * cooling)
      );
      nextXByEventId.set(node.eventId, node.x + step);
    }

    for (const node of nodes) {
      const nextX = nextXByEventId.get(node.eventId) ?? node.x;
      node.x = nextX;
    }
  }

  for (const node of nodes) {
    const geometry = state.geometryByEventId.get(node.eventId);
    if (!geometry || geometry.geometryKind !== "point") {
      continue;
    }

    state.geometryByEventId.set(node.eventId, {
      ...geometry,
      position: {
        ...geometry.position,
        x: laneIndexToWorldX(node.x)
      }
    });
  }
}

function prepareProjectionContext(
  dataset: Dataset,
  chronologyBoard: GraphShellChronologyBoard,
  options:
    | {
        strategy?: ProcessRegionDerivationStrategy;
        getValidationState?: (recordId: string) => "ok" | "warning" | "error";
        explicitExtents?: ReadonlyMap<
          string,
          { minYear: number; maxYear: number }
        >;
        temporalConstraints?: TemporalConstraint[];
      }
    | undefined,
  // Retained original signature for source parity.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  state: ProjectionMutableState
): ProjectionPreparedContext {
  const strategy =
    options?.strategy ?? new ContainedChildEnvelopeRegionStrategy();
  const validationStateFor = options?.getValidationState ?? (() => "ok");
  const timeSystemById = new Map(
    dataset.timeSystems.map((timeSystem) => [timeSystem.id, timeSystem])
  );
  const canonById = new Map(dataset.canons.map((canon) => [canon.id, canon]));

  const scopedEvents = dataset.events.filter((event) => {
    const canon = canonById.get(event.canonId);
    const timeSystem = canon
      ? timeSystemById.get(canon.timeSystemId)
      : undefined;
    if (!timeSystem) {
      return true;
    }

    return (
      timeSystem.compatibilityKey === chronologyBoard.axis.compatibilityKey
    );
  });

  const scopedEventIdSet = new Set(scopedEvents.map((event) => event.id));
  const scopedStructuralLinks = dataset.structuralLinks.filter(
    (link) =>
      scopedEventIdSet.has(link.fromEventId) &&
      scopedEventIdSet.has(link.toEventId)
  );
  const scopedSemanticLinks = dataset.semanticLinks.filter(
    (link) =>
      scopedEventIdSet.has(link.fromId) && scopedEventIdSet.has(link.toId)
  );
  const eventById = new Map(scopedEvents.map((event) => [event.id, event]));
  const childIdsByParent = new Map<string, string[]>();
  const parentIdsByChild = new Map<string, string[]>();
  const parentCandidatesByChild = new Map<
    string,
    ContainmentParentCandidate[]
  >();

  for (const link of scopedStructuralLinks.filter(
    (candidate) => candidate.type === "PART_OF_PROCESS"
  )) {
    if (
      !scopedEventIdSet.has(link.fromEventId) ||
      !scopedEventIdSet.has(link.toEventId)
    ) {
      continue;
    }

    addUniqueChild(childIdsByParent, link.toEventId, link.fromEventId);
    addUniqueParent(parentIdsByChild, link.fromEventId, link.toEventId);
    addParentCandidate(parentCandidatesByChild, link.fromEventId, {
      parentId: link.toEventId,
      sourceKind: "structural",
      relationType: link.type
    });
  }

  for (const link of scopedSemanticLinks) {
    const relationType = link.type.trim().toLowerCase();
    if (
      !scopedEventIdSet.has(link.fromId) ||
      !scopedEventIdSet.has(link.toId)
    ) {
      continue;
    }

    if (relationType === "contains") {
      addUniqueChild(childIdsByParent, link.fromId, link.toId);
      addUniqueParent(parentIdsByChild, link.toId, link.fromId);
      addParentCandidate(parentCandidatesByChild, link.toId, {
        parentId: link.fromId,
        sourceKind: "semantic",
        relationType: relationType
      });
      continue;
    }

    if (
      relationType === "starts" ||
      relationType === "ends" ||
      relationType === "belongs-to-existence"
    ) {
      addUniqueChild(childIdsByParent, link.toId, link.fromId);
      addUniqueParent(parentIdsByChild, link.fromId, link.toId);
      addParentCandidate(parentCandidatesByChild, link.fromId, {
        parentId: link.toId,
        sourceKind: "semantic",
        relationType: relationType
      });
    }
  }

  const constraints = (
    options?.temporalConstraints ?? buildTemporalConstraints(dataset)
  ).filter(
    (constraint) =>
      scopedEventIdSet.has(constraint.beforeId) &&
      scopedEventIdSet.has(constraint.afterId)
  );
  const constraintsByAfterId = new Map<string, TemporalConstraint[]>();
  const constraintsByBeforeId = new Map<string, TemporalConstraint[]>();
  for (const constraint of constraints) {
    const byAfter = constraintsByAfterId.get(constraint.afterId) ?? [];
    byAfter.push(constraint);
    constraintsByAfterId.set(constraint.afterId, byAfter);

    const byBefore = constraintsByBeforeId.get(constraint.beforeId) ?? [];
    byBefore.push(constraint);
    constraintsByBeforeId.set(constraint.beforeId, byBefore);
  }

  const explicitExtentByEventId = new Map(
    scopedEvents.map(
      (event) =>
        [
          event.id,
          options?.explicitExtents
            ? options.explicitExtents.get(event.id)
            : getPrimaryGregorianExtent(event)
        ] as const
    )
  );
  const eventKindById = new Map<string, RenderEventKind>();
  for (const event of scopedEvents) {
    eventKindById.set(
      event.id,
      classifyEventKind(event, (childIdsByParent.get(event.id) ?? []).length)
    );
  }

  return {
    strategy,
    validationStateFor,
    scopedEvents,
    scopedStructuralLinks,
    scopedSemanticLinks,
    eventById,
    childIdsByParent,
    parentIdsByChild,
    parentCandidatesByChild,
    constraintsByAfterId,
    constraintsByBeforeId,
    explicitExtentByEventId,
    eventKindById
  };
}

function placeSeedEvents(
  context: ProjectionPreparedContext,
  chronologyBoard: GraphShellChronologyBoard,
  state: ProjectionMutableState
) {
  let anchorLane = -2;
  const seedOrder = [...context.scopedEvents].sort((left, right) =>
    left.id.localeCompare(right.id)
  );

  for (const event of seedOrder) {
    const kind = context.eventKindById.get(event.id);
    if (!kind || kind === "composite") {
      continue;
    }

    const extent = context.explicitExtentByEventId.get(event.id);
    if (!extent) {
      continue;
    }

    const year = pickPlacementYear(extent.minYear, extent.maxYear);
    if (year === null) {
      continue;
    }

    const lane = kind === "anchor" ? anchorLane-- : 0;
    if (kind !== "anchor") {
      const laneYears = state.laneYearsByIndex.get(0) ?? [];
      laneYears.push(year);
      state.laneYearsByIndex.set(0, laneYears);
    }
    const contains = context.childIdsByParent.get(event.id) ?? [];
    const parentIds = context.parentIdsByChild.get(event.id) ?? [];
    const entity = createPointEntity(
      event,
      year,
      lane,
      contains,
      parentIds[0],
      context.validationStateFor(event.id),
      chronologyBoard,
      state.eventDiagnosticsById.get(event.id) ?? []
    );

    state.placedYearByEventId.set(event.id, year);
    state.geometryByEventId.set(event.id, entity);
  }
}

function placePropagatedInstantEvents(
  context: ProjectionPreparedContext,
  chronologyBoard: GraphShellChronologyBoard,
  state: ProjectionMutableState
) {
  const instantEventIds = context.scopedEvents
    .filter((event) => context.eventKindById.get(event.id) === "instant")
    .map((event) => event.id);
  const unresolvedInstantIds = new Set(
    instantEventIds.filter((eventId) => !state.geometryByEventId.has(eventId))
  );
  const contradictionEventIds = new Set<string>();

  while (true) {
    const batchCandidates: PlacementCandidate[] = [];

    for (const eventId of unresolvedInstantIds) {
      const interval = resolveFeasibleInterval(
        eventId,
        context.explicitExtentByEventId.get(eventId),
        context.constraintsByAfterId,
        context.constraintsByBeforeId,
        state.placedYearByEventId
      );

      if (interval.state === "insufficient") {
        continue;
      }

      if (interval.state === "contradiction") {
        contradictionEventIds.add(eventId);
        const diagnostic: ChartPlaneDiagnostic = {
          code: "temporal-contradiction",
          severity: "error",
          message: `Event ${eventId} has contradictory temporal constraints (min=${interval.minYear.toFixed(4)}, max=${interval.maxYear.toFixed(4)}).`
        };
        state.diagnostics.push(diagnostic);
        appendEventDiagnostic(state.eventDiagnosticsById, eventId, diagnostic);
        continue;
      }

      const year = pickPlacementYear(interval.minYear, interval.maxYear);
      if (year === null) {
        continue;
      }

      batchCandidates.push({
        eventId,
        year,
        minYear: interval.minYear,
        maxYear: interval.maxYear,
        priority: getIntervalPriority(interval.minYear, interval.maxYear)
      });
    }

    if (batchCandidates.length === 0) {
      break;
    }

    for (let index = 0; index < batchCandidates.length; index += 1) {
      const candidate = batchCandidates[index]!;
      const interval = resolveFeasibleInterval(
        candidate.eventId,
        context.explicitExtentByEventId.get(candidate.eventId),
        context.constraintsByAfterId,
        context.constraintsByBeforeId,
        state.placedYearByEventId
      );
      if (interval.state !== "ok") {
        continue;
      }

      batchCandidates[index] = {
        ...candidate,
        minYear: interval.minYear,
        maxYear: interval.maxYear,
        priority: getIntervalPriority(interval.minYear, interval.maxYear)
      };
    }

    batchCandidates.sort(
      (left, right) =>
        left.priority - right.priority ||
        left.year - right.year ||
        left.eventId.localeCompare(right.eventId)
    );

    const leadCandidate = batchCandidates[0]!;
    const clusters = buildCandidateClusters(
      batchCandidates,
      context.constraintsByBeforeId
    );
    const leadCluster = clusters.find((cluster) =>
      cluster.some((candidate) => candidate.eventId === leadCandidate.eventId)
    ) ?? [leadCandidate];
    const candidatesToPlace = redistributeCandidateClusterYears(
      leadCluster,
      context.constraintsByAfterId
    );

    for (const candidate of candidatesToPlace) {
      const event = context.eventById.get(candidate.eventId);
      if (!event || state.geometryByEventId.has(event.id)) {
        continue;
      }

      const lane = 0;
      const laneYears = state.laneYearsByIndex.get(0) ?? [];
      laneYears.push(candidate.year);
      state.laneYearsByIndex.set(0, laneYears);
      const contains = context.childIdsByParent.get(event.id) ?? [];
      const parentIds = context.parentIdsByChild.get(event.id) ?? [];
      const entity = createPointEntity(
        event,
        candidate.year,
        lane,
        contains,
        parentIds[0],
        context.validationStateFor(event.id),
        chronologyBoard,
        state.eventDiagnosticsById.get(event.id) ?? []
      );

      state.placedYearByEventId.set(event.id, candidate.year);
      state.geometryByEventId.set(event.id, entity);
      unresolvedInstantIds.delete(event.id);
    }
  }

  for (const eventId of unresolvedInstantIds) {
    if (contradictionEventIds.has(eventId)) {
      continue;
    }

    const diagnostic: ChartPlaneDiagnostic = {
      code: "insufficient-temporal-information",
      severity: "warning",
      message: `Event ${eventId} is not drawable yet because no feasible temporal interval can be computed from anchors or already placed events.`
    };
    state.diagnostics.push(diagnostic);
    appendEventDiagnostic(state.eventDiagnosticsById, eventId, diagnostic);
  }
}

function deriveCompositeRegions(
  context: ProjectionPreparedContext,
  state: ProjectionMutableState
) {
  const unresolvedCompositeIds = new Set(
    context.scopedEvents
      .filter((event) => context.eventKindById.get(event.id) === "composite")
      .map((event) => event.id)
  );

  while (true) {
    let progress = false;

    for (const eventId of [...unresolvedCompositeIds]) {
      const event = context.eventById.get(eventId);
      if (!event) {
        unresolvedCompositeIds.delete(eventId);
        continue;
      }

      const contains = context.childIdsByParent.get(eventId) ?? [];
      if (contains.length === 0) {
        const diagnostic: ChartPlaneDiagnostic = {
          code: "composite-missing-children",
          severity: "warning",
          message: `Composite event ${eventId} has no direct children, so no boundary was emitted.`
        };
        state.diagnostics.push(diagnostic);
        appendEventDiagnostic(state.eventDiagnosticsById, eventId, diagnostic);
        unresolvedCompositeIds.delete(eventId);
        progress = true;
        continue;
      }

      const childGeometries = contains
        .map((childId) => state.geometryByEventId.get(childId))
        .filter((geometry): geometry is PrimitiveGeometry => Boolean(geometry));
      if (childGeometries.length === 0) {
        continue;
      }
      const missingChildren = contains.filter(
        (childId) => !state.geometryByEventId.has(childId)
      );
      const parentIds = context.parentIdsByChild.get(eventId) ?? [];

      const result = context.strategy.deriveRegion({
        event,
        childGeometries,
        contains,
        containedBy: parentIds[0],
        validationState: context.validationStateFor(event.id)
      });

      for (const diagnostic of result.diagnostics) {
        state.diagnostics.push(diagnostic);
        appendEventDiagnostic(state.eventDiagnosticsById, event.id, diagnostic);
      }

      if (missingChildren.length > 0) {
        const diagnostic: ChartPlaneDiagnostic = {
          code: "composite-partial-children",
          severity: "warning",
          message: `Composite event ${eventId} rendered from solved children only; unresolved children were omitted: ${missingChildren.join(", ")}.`
        };
        state.diagnostics.push(diagnostic);
        appendEventDiagnostic(state.eventDiagnosticsById, event.id, diagnostic);
      }

      const eventDiagnostics = state.eventDiagnosticsById.get(event.id);
      if (
        eventDiagnostics &&
        eventDiagnostics.length > result.entity.diagnostics.length
      ) {
        result.entity = {
          ...result.entity,
          diagnostics: [...eventDiagnostics]
        };
      }

      state.geometryByEventId.set(eventId, result.entity);
      unresolvedCompositeIds.delete(eventId);
      progress = true;
    }

    if (!progress) {
      break;
    }
  }

  for (const eventId of unresolvedCompositeIds) {
    const missingChildren = (
      context.childIdsByParent.get(eventId) ?? []
    ).filter((childId) => !state.geometryByEventId.has(childId));
    const diagnostic: ChartPlaneDiagnostic = {
      code: "composite-not-drawable",
      severity: "warning",
      message: `Composite event ${eventId} is not drawable because required children are not solved: ${missingChildren.join(", ") || "unknown"}.`
    };
    state.diagnostics.push(diagnostic);
    appendEventDiagnostic(state.eventDiagnosticsById, eventId, diagnostic);
  }
}

function deriveRelationSegments(
  context: ProjectionPreparedContext,
  dataset: Dataset,
  state: ProjectionMutableState
) {
  const segments: GraphShellChartPlaneSegmentEntity[] = [];

  const addSegment = (
    id: string,
    fromId: string,
    toId: string,
    label: string,
    canonId: string | undefined,
    validationState: "ok" | "warning" | "error"
  ) => {
    const startEntity = state.geometryByEventId.get(fromId);
    const endEntity = state.geometryByEventId.get(toId);
    if (
      !startEntity ||
      !endEntity ||
      startEntity.geometryKind !== "point" ||
      endEntity.geometryKind !== "point"
    ) {
      return;
    }

    segments.push({
      id,
      eventId: fromId,
      canonId: canonId ?? context.eventById.get(fromId)?.canonId ?? "",
      label,
      geometryKind: "segment",
      validationState,
      contains: [fromId, toId],
      diagnostics: [],
      viewportClass: "visible",
      editorial: context.eventById.get(fromId)
        ? toGraphEntityEditorial(context.eventById.get(fromId)!)
        : undefined,
      start: startEntity.position,
      end: endEntity.position
    });
  };

  for (const link of dataset.structuralLinks) {
    if (
      getTemporalDirectionForStructuralLinkKind(link.type) !== "forward" ||
      !context.eventById.has(link.fromEventId) ||
      !context.eventById.has(link.toEventId)
    ) {
      continue;
    }

    addSegment(
      link.id,
      link.fromEventId,
      link.toEventId,
      link.type,
      link.canonId,
      context.validationStateFor(link.fromEventId)
    );
  }

  for (const link of dataset.semanticLinks) {
    const relationType = link.type.trim().toLowerCase();
    const direction = getTemporalDirectionForRelationType(link.type);
    if (
      ["contains", "starts", "ends", "belongs-to-existence"].includes(
        relationType
      )
    ) {
      continue;
    }

    if (
      !context.eventById.has(link.fromId) ||
      !context.eventById.has(link.toId)
    ) {
      continue;
    }

    if (direction === "reverse") {
      addSegment(
        link.id,
        link.toId,
        link.fromId,
        link.type,
        context.eventById.get(link.fromId)?.canonId,
        context.validationStateFor(link.fromId)
      );
      continue;
    }

    if (direction === "forward") {
      addSegment(
        link.id,
        link.fromId,
        link.toId,
        link.type,
        context.eventById.get(link.fromId)?.canonId,
        context.validationStateFor(link.fromId)
      );
    }
  }

  return segments;
}

function finalizeChartPlane(
  context: ProjectionPreparedContext,
  chronologyBoard: GraphShellChronologyBoard,
  dataset: Dataset,
  state: ProjectionMutableState
): GraphShellChartPlane {
  const laneCount = state.laneYearsByIndex.size;
  if (laneCount > DENSE_LANE_WARNING_THRESHOLD) {
    state.diagnostics.push({
      code: "dense-lane-allocation",
      severity: "warning",
      message: `Lane usage reached ${laneCount}, which may reduce readability.`
    });
  }

  const eventEntities = context.scopedEvents
    .map((event) => {
      const geometry = state.geometryByEventId.get(event.id);
      if (!geometry) {
        return null;
      }

      const eventDiagnostics = state.eventDiagnosticsById.get(event.id);
      if (!eventDiagnostics || eventDiagnostics.length === 0) {
        return geometry;
      }

      return {
        ...geometry,
        diagnostics: [...eventDiagnostics]
      } as PrimitiveGeometry;
    })
    .filter((entity): entity is PrimitiveGeometry => Boolean(entity));

  const relationSegments = deriveRelationSegments(context, dataset, state);

  return {
    compatibilityKey: chronologyBoard.axis.compatibilityKey,
    timeSystemId: chronologyBoard.axis.timeSystemId,
    entities: [...eventEntities, ...relationSegments],
    diagnostics: state.diagnostics
  };
}

export function buildGraphShellChartPlane(
  dataset: Dataset,
  chronologyBoard: GraphShellChronologyBoard,
  options?: BuildGraphShellChartPlaneOptions
): GraphShellChartPlane {
  const state = createProjectionMutableState();
  const context = prepareProjectionContext(
    dataset,
    chronologyBoard,
    options,
    state
  );
  const xForceLayout = resolveChartPlaneXForceLayoutOptions(
    options?.xForceLayout
  );

  placeSeedEvents(context, chronologyBoard, state);
  placePropagatedInstantEvents(context, chronologyBoard, state);
  redistributePlacedPointClusters(context, chronologyBoard, state);
  optimizePointXPositions(context, state, xForceLayout);
  deriveCompositeRegions(context, state);
  normalizeContainedByAssignments(context, state);

  return finalizeChartPlane(context, chronologyBoard, dataset, state);
}
