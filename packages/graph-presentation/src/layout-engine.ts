/** Browser-safe shared layout computation for Lachesis and research.
 * No canonical queries or publication writers. */
import {
  buildGraphShellChartPlane,
  type TemporalConstraint
} from "./urdr-chart-plane.js";
import type {
  Dataset,
  GraphShellChartPlane,
  GraphShellChronologyBoard
} from "./urdr-layout-types.js";
import {
  relaxIncidence,
  defaults as incidenceDefaults,
  type IncidenceMetadata
} from "./collection-incidence.js";
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
  /** World-wide membership and authored graph, independent of viewer selection.
   * Optional only for historical snapshots and legacy research candidates. */
  readonly incidence?: IncidenceMetadata;
}
export type LayoutParameters = Readonly<Record<string, number | string>>;
export type ParameterDefinition = Readonly<
  {
    key: string;
    label: string;
    description: string;
  } & (
    | {
        kind: "number";
        default: number;
        min: number;
        max: number;
        step: number;
      }
    | {
        kind: "select";
        default: string;
        options: readonly { value: string; label: string }[];
      }
  )
>;
export interface LayoutSelection {
  readonly algorithm: string;
  readonly algorithmVersion: string;
  readonly parameters: LayoutParameters;
  readonly seed: null;
}
export interface LayoutAlgorithm {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly parameters: readonly ParameterDefinition[];
  compute(input: LayoutInput, parameters: LayoutParameters): LayoutOutput;
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
const numberParameter = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  description: string
): ParameterDefinition => ({
  key,
  label,
  kind: "number",
  default: value,
  min,
  max,
  step,
  description
});
const baseline: LayoutAlgorithm = {
  id: "legacy-force",
  version: "1",
  title: "Legacy force baseline",
  description:
    "Existing publication X force. Coefficients interact through step clipping and cooling. Temporal placement is fixed. V5 causes use temporalAttraction; causesAttraction is retained as an explicit no-op for this adapter.",
  parameters: [
    numberParameter(
      "iterations",
      "Iterations",
      32,
      0,
      256,
      1,
      "More synchronous steps also change the linear cooling schedule."
    ),
    numberParameter(
      "repulsion",
      "Repulsion",
      0.03,
      0,
      1,
      0.005,
      "Inverse-square X separation; clipped by maxStep. Not a collision guarantee."
    ),
    numberParameter(
      "causesAttraction",
      "Structural causes attraction (v5 no-op)",
      0.22,
      0,
      2,
      0.01,
      "Only structural CAUSES links use this. Current v5 causes are semantic links and use temporalAttraction."
    ),
    numberParameter(
      "temporalAttraction",
      "Temporal / v5 causes attraction",
      0.12,
      0,
      2,
      0.01,
      "Linear edge attraction competes with repulsion; duplicate endpoint pairs use the highest weight."
    ),
    numberParameter(
      "maxStep",
      "Maximum step (lane units)",
      0.22,
      0,
      2,
      0.01,
      "Clips force after cooling; can conceal coefficient changes when saturated."
    ),
    {
      key: "repulsionMode",
      label: "Repulsion peers",
      kind: "select",
      default: "auto",
      options: [
        { value: "auto", label: "Auto (>500 Events: bounded)" },
        { value: "all", label: "All point pairs" },
        { value: "bounded", label: "Bounded temporal peers" }
      ],
      description:
        "Production auto counts all World Events, including Composite and unplaced Events."
    },
    numberParameter(
      "neighborsPerSide",
      "Neighbors per side",
      24,
      1,
      128,
      1,
      "Bounded mode's maximum temporal peers on each side."
    ),
    numberParameter(
      "windowYears",
      "Peer temporal window",
      10,
      0,
      10000,
      0.1,
      "Bounded repulsion window in display-year units; repaired temporal positions determine membership."
    )
  ],
  compute(input, params) {
    const bounded =
      params.repulsionMode === "bounded" ||
      (params.repulsionMode === "auto" && input.dataset.events.length > 500);
    const chart = buildGraphShellChartPlane(input.dataset, input.board, {
      ...chartOptions(input),
      xForceLayout: {
        iterations: Number(params.iterations),
        repulsion: Number(params.repulsion),
        causesAttraction: Number(params.causesAttraction),
        temporalAttraction: Number(params.temporalAttraction),
        maxStep: Number(params.maxStep)
      },
      ...(bounded
        ? {
            boundedRepulsion: {
              neighborsPerSide: Number(params.neighborsPerSide),
              windowYears: Number(params.windowYears)
            }
          }
        : {})
    });
    return finish(
      input,
      chart,
      bounded ? "v5-world-layout/2" : "v5-world-layout/1"
    );
  }
};
const slots: LayoutAlgorithm = {
  id: "deterministic-slots",
  version: "1",
  title: "Deterministic slots reference",
  description:
    "Greedy temporal slots, ordered by placed year then Event ID. Reuses the first available slot. Changes only X before Composite envelopes are derived.",
  parameters: [
    numberParameter(
      "slotSpacing",
      "Slot spacing (world units)",
      110,
      1,
      1000,
      1,
      "Horizontal separation between slots."
    ),
    numberParameter(
      "collisionWindowYears",
      "Temporal collision window",
      0.1,
      0,
      1000,
      0.01,
      "A slot is reusable after this display-year gap. This is a reference rule, not a label/hull collision solver."
    )
  ],
  compute(input, params) {
    const chart = buildGraphShellChartPlane(input.dataset, input.board, {
      ...chartOptions(input),
      placePointX(points) {
        const lastYear: number[] = [];
        const positions = new Map<string, number>();
        const ordered = [...points].sort(
          (a, b) =>
            a.year - b.year ||
            (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
        );
        for (const point of ordered) {
          if (point.fixed) {
            positions.set(point.eventId, 0);
            continue;
          }
          let lane = lastYear.findIndex(
            (year) => point.year - year > Number(params.collisionWindowYears)
          );
          if (lane < 0) lane = lastYear.length;
          lastYear[lane] = point.year;
          positions.set(point.eventId, lane * Number(params.slotSpacing));
        }
        return positions;
      }
    });
    return finish(input, chart, "deterministic-slots/1");
  }
};
const globalIncidence: LayoutAlgorithm = {
  id: "global-incidence",
  version: "1",
  title: "Global incidence · data-derived centers",
  description:
    "World-wide overlapping Collection membership and authored Composite/graph cohesion. Changes X only; no predetermined Collection lanes. Cold deterministic publication solve.",
  parameters: [
    numberParameter(
      "iterations",
      "Iterations",
      90,
      0,
      256,
      1,
      "Bounded relaxation budget."
    ),
    numberParameter(
      "windowYears",
      "Relation time scale",
      24,
      0.001,
      10000,
      0.1,
      "Temporal attenuation of authored links and primitive repulsion; Collection hubs remain global."
    ),
    numberParameter(
      "spacing",
      "Primitive X scale",
      32,
      0.001,
      10000,
      0.1,
      "World X separation scale; hub gaps also depend on mass and overlap."
    ),
    numberParameter(
      "cohesion",
      "Membership cohesion",
      0.7,
      0,
      10,
      0.01,
      "Normalized Event-to-Collection attraction."
    ),
    numberParameter(
      "relation",
      "Authored graph cohesion",
      0.35,
      0,
      10,
      0.01,
      "Contains, causes and precedes attraction."
    )
  ],
  compute(input, parameters) {
    if (
      !input.incidence ||
      input.incidence.formatVersion !== "collection-incidence/1"
    )
      throw Error("layout_membership_input_missing");
    const base = baseline.compute(input, {
      ...defaultLayoutSelection("legacy-force").parameters,
      iterations: 0
    });
    return relaxIncidence(
      { ...input.incidence, input },
      "global-incidence",
      { ...incidenceDefaults, ...parameters } as typeof incidenceDefaults,
      base
    ).output;
  }
};
export const layoutAlgorithms: readonly LayoutAlgorithm[] = [
  baseline,
  slots,
  globalIncidence
];
export function getLayoutAlgorithm(id: string): LayoutAlgorithm {
  const algorithm = layoutAlgorithms.find((candidate) => candidate.id === id);
  if (!algorithm) throw Error("layout_algorithm_unknown");
  return algorithm;
}
export function defaultLayoutSelection(id = "legacy-force"): LayoutSelection {
  const algorithm = getLayoutAlgorithm(id);
  return {
    algorithm: algorithm.id,
    algorithmVersion: algorithm.version,
    parameters: Object.fromEntries(
      algorithm.parameters.map((parameter) => [
        parameter.key,
        parameter.default
      ])
    ),
    seed: null
  };
}
/** Fixed publication configuration. Lab selections never mutate this object. */
export const CANONICAL_LAYOUT_SELECTION: LayoutSelection = Object.freeze({
  ...defaultLayoutSelection("global-incidence"),
  parameters: Object.freeze({
    ...defaultLayoutSelection("global-incidence").parameters
  })
});
export function validateLayoutSelection(selection: LayoutSelection): void {
  const algorithm = getLayoutAlgorithm(selection.algorithm);
  if (
    selection.algorithmVersion !== algorithm.version ||
    selection.seed !== null
  )
    throw Error("layout_algorithm_version_or_seed_invalid");
  const keys = Object.keys(selection.parameters);
  if (
    keys.length !== algorithm.parameters.length ||
    keys.some(
      (key) => !algorithm.parameters.some((parameter) => parameter.key === key)
    )
  )
    throw Error("layout_parameters_invalid");
  for (const parameter of algorithm.parameters) {
    const value = selection.parameters[parameter.key];
    if (parameter.kind === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < parameter.min ||
        value > parameter.max ||
        (parameter.step === 1 && !Number.isInteger(value))
      )
        throw Error(`layout_parameter_invalid:${parameter.key}`);
    } else if (
      typeof value !== "string" ||
      !parameter.options.some((option) => option.value === value)
    )
      throw Error(`layout_parameter_invalid:${parameter.key}`);
  }
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
  return getLayoutAlgorithm(selection.algorithm).compute(
    input,
    selection.parameters
  );
}
