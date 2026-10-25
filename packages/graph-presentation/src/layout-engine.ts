/** Frozen pre-Lab-v1 publication layout (4c726661).
 * Lab v2 uses a separate engine; this module has no experiment selectors. */
import {
  buildGraphShellChartPlane,
  type TemporalConstraint
} from "./urdr-chart-plane.js";
import type {
  Dataset,
  GraphShellChartPlane,
  GraphShellChronologyBoard
} from "./urdr-layout-types.js";
export { buildRenderConcaveHull } from "./v5-render-hull.js";

export type LayoutShape =
  | {
      readonly event_id: string;
      readonly kind: "point";
      readonly position: { readonly x: number; readonly y: number };
    }
  | {
      readonly event_id: string;
      readonly kind: "segment";
      readonly start: { readonly x: number; readonly y: number };
      readonly end: { readonly x: number; readonly y: number };
    }
  | {
      readonly event_id: string;
      readonly kind: "region";
      readonly bounds: {
        readonly minX: number;
        readonly maxX: number;
        readonly minY: number;
        readonly maxY: number;
      };
    };
export interface LayoutOutput {
  readonly world_id: string;
  readonly revision: number;
  readonly time_system_id: string;
  readonly algorithm_version: string;
  readonly temporal_digest: string;
  readonly shapes: readonly (LayoutShape & {
    readonly read_hint?: {
      readonly title: string;
      readonly collection_ids?: readonly string[];
    };
  })[];
  readonly unplaced_event_ids: readonly string[];
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}
export interface LayoutInput {
  readonly formatVersion: "layout-input/1";
  readonly worldId: string;
  readonly revision: number;
  readonly timeSystemId: string;
  readonly temporalDigest: string;
  readonly dataset: Dataset;
  readonly board: GraphShellChronologyBoard;
  readonly explicitExtents: readonly {
    readonly eventId: string;
    readonly minYear: number;
    readonly maxYear: number;
  }[];
  readonly temporalConstraints: readonly TemporalConstraint[];
  readonly visibleEventIds: readonly string[];
}
export interface LayoutSelection {
  readonly algorithm: string;
  readonly algorithmVersion: string;
  readonly parameters: Readonly<Record<string, number | string>>;
  readonly seed: null;
}
function finish(
  input: LayoutInput,
  chart: GraphShellChartPlane,
  version: string
): LayoutOutput {
  const included = new Set(input.dataset.events.map((event) => event.id));
  const visible = new Set(input.visibleEventIds);
  const shapes: LayoutShape[] = chart.entities
    .filter(
      (entity) =>
        entity.id === entity.eventId &&
        included.has(entity.eventId) &&
        visible.has(entity.eventId)
    )
    .map((entity): LayoutShape => {
      if (entity.geometryKind === "point")
        return {
          event_id: entity.eventId,
          kind: "point",
          position: entity.position
        };
      if (entity.geometryKind === "segment")
        return {
          event_id: entity.eventId,
          kind: "segment",
          start: entity.start,
          end: entity.end
        };
      return {
        event_id: entity.eventId,
        kind: "region",
        bounds: entity.worldBounds
      };
    })
    .sort((a, b) =>
      a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0
    );
  const drawn = new Set(shapes.map((shape) => shape.event_id));
  return {
    world_id: input.worldId,
    revision: input.revision,
    time_system_id: input.timeSystemId,
    algorithm_version: version,
    temporal_digest: input.temporalDigest,
    shapes,
    unplaced_event_ids: input.dataset.events
      .filter((event) => !drawn.has(event.id))
      .map((event) => event.id),
    diagnostics: chart.diagnostics.map(({ code, message }) => ({
      code,
      message
    }))
  };
}
function chartOptions(input: LayoutInput) {
  return {
    explicitExtents: new Map(
      input.explicitExtents.map(({ eventId, minYear, maxYear }) => [
        eventId,
        { minYear, maxYear }
      ])
    ),
    temporalConstraints: [...input.temporalConstraints]
  };
}
/** Exact published force defaults from before Lab v1. There is deliberately no
 * tunable production registry. Fixed-Y research belongs to Layout Lab v2. */
export const CANONICAL_LAYOUT_SELECTION: LayoutSelection = Object.freeze({
  algorithm: "legacy-force",
  algorithmVersion: "1",
  parameters: Object.freeze({
    iterations: 32,
    repulsion: 0.03,
    causesAttraction: 0.22,
    temporalAttraction: 0.12,
    maxStep: 0.22,
    repulsionMode: "auto",
    neighborsPerSide: 24,
    windowYears: 10
  }),
  seed: null
});
export function defaultLayoutSelection(id = "legacy-force"): LayoutSelection {
  if (id !== "legacy-force") throw Error("layout_algorithm_unknown");
  return CANONICAL_LAYOUT_SELECTION;
}
export function validateLayoutSelection(selection: LayoutSelection): void {
  if (
    selection.algorithm !== CANONICAL_LAYOUT_SELECTION.algorithm ||
    selection.algorithmVersion !==
      CANONICAL_LAYOUT_SELECTION.algorithmVersion ||
    selection.seed !== null ||
    Object.keys(selection.parameters).length !==
      Object.keys(CANONICAL_LAYOUT_SELECTION.parameters).length ||
    Object.entries(CANONICAL_LAYOUT_SELECTION.parameters).some(
      ([key, value]) => selection.parameters[key] !== value
    )
  )
    throw Error("layout_baseline_configuration_required");
}
export function computeLayout(
  input: LayoutInput,
  selection: LayoutSelection = CANONICAL_LAYOUT_SELECTION
): LayoutOutput {
  validateLayoutSelection(selection);
  if (
    input.formatVersion !== "layout-input/1" ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    input.board.axis.timeSystemId !== input.timeSystemId ||
    input.explicitExtents.some(
      (extent) =>
        !Number.isFinite(extent.minYear) ||
        !Number.isFinite(extent.maxYear) ||
        extent.minYear > extent.maxYear
    )
  )
    throw Error("layout_input_invalid");
  const bounded = input.dataset.events.length > 500;
  const chart = buildGraphShellChartPlane(input.dataset, input.board, {
    ...chartOptions(input),
    ...(bounded
      ? { boundedRepulsion: { neighborsPerSide: 24, windowYears: 10 } }
      : {})
  });
  return finish(
    input,
    chart,
    bounded ? "v5-world-layout/2" : "v5-world-layout/1"
  );
}
