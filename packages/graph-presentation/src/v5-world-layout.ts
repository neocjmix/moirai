/** Inactive v5 geometry producer. The World owns one layout per selected Time
 * System; Collections select Event IDs later and cannot move a shared Event.
 * URDR's canonId below is a private renderer scope token, not ontology. */
import type { CanonicalState } from "@moirai/contracts/v5";
import type { CanonicalEventReference } from "@moirai/contracts";
import type { projectV5WorldTemporal } from "@moirai/projections";
import { temporalAdapterRegistry } from "@moirai/domain";
import { buildGraphShellChartPlane } from "./urdr-chart-plane.js";
import type {
  Dataset,
  GraphShellChartPlaneEntity
} from "./urdr-layout-types.js";

type Temporal = ReturnType<typeof projectV5WorldTemporal>;
type Shape =
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

export interface V5WorldLayout {
  readonly world_id: string;
  readonly revision: number;
  readonly time_system_id: string;
  readonly algorithm_version: "v5-world-layout/1" | "v5-world-layout/2";
  readonly temporal_digest: string;
  readonly shapes: readonly Shape[];
  readonly unplaced_event_ids: readonly string[];
  readonly diagnostics: readonly {
    readonly code: string;
    readonly message: string;
  }[];
}

/** Presentation coordinate, never a canonical Time Event or duration. A
 * different/unsupported Time System is unplaced, not silently translated. */
function scalar(
  ref: CanonicalEventReference,
  timeSystemId: string,
  registry: ReturnType<typeof temporalAdapterRegistry>,
  gregorian: boolean
): number | null {
  if (
    ref.kind !== "time_event" ||
    ref.time_system_ref.time_system_id !== timeSystemId
  )
    return null;
  const adapter = registry.get(timeSystemId, ref.definition_version);
  if (!adapter?.difference) return null;
  try {
    const difference = adapter.difference(
      gregorian ? "0000-01-01T00:00:00.000000000000Z" : "0",
      ref.coordinate
    );
    if (gregorian && difference.unit !== "picosecond") return null;
    const number =
      Number(difference.value) / (gregorian ? 31_556_952 * 1e12 : 1);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function shape(entity: GraphShellChartPlaneEntity): Shape {
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
}

export function buildV5WorldLayout(
  state: CanonicalState,
  temporal: Temporal,
  timeSystemId: string
): V5WorldLayout {
  if (temporal.world_id !== state.world.id || temporal.source_revision < 1)
    throw Error("v5_layout_revision_mismatch");
  const system = state.timeSystems.find((item) => item.id === timeSystemId);
  if (!system || system.world_id !== state.world.id)
    throw Error("v5_layout_time_system_missing");
  const gregorian =
    system.definition.coordinate_codec === "yyyy-iso-fields-fraction12-z-v1";
  const registry = temporalAdapterRegistry(state.timeSystems);
  const compositeIds = new Set(
    temporal.composites.map((item) => item.event_id)
  );
  const events = [...state.events].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const relations = [...state.relations].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const included = new Set(events.map((event) => event.id));
  const children = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (
      relation.type !== "contains" ||
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    )
      continue;
    const ids = children.get(relation.source_ref.event_id) ?? new Set<string>();
    ids.add(relation.target_ref.event_id);
    children.set(relation.source_ref.event_id, ids);
  }
  const extents = new Map<string, { minYear: number; maxYear: number }>();
  for (const position of temporal.positions) {
    const lower =
      position.kind === "exact"
        ? position.time_event
        : position.lower?.time_event;
    const upper =
      position.kind === "exact"
        ? position.time_event
        : position.upper?.time_event;
    const lo = lower ? scalar(lower, timeSystemId, registry, gregorian) : null;
    const hi = upper ? scalar(upper, timeSystemId, registry, gregorian) : null;
    // A one-sided fact has no finite span in the chart plane. Do not pass an
    // infinite renderer extent or invent its missing boundary; it stays
    // navigable by direct Event/adjacency reads but unplaced on this axis.
    if (lo !== null && hi !== null)
      extents.set(position.event_id, { minYear: lo, maxYear: hi });
  }
  const constraints = relations.flatMap((relation) => {
    if (
      !(["precedes", "not_after", "coincides"] as string[]).includes(
        relation.type
      ) ||
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    )
      return [];
    return [
      {
        beforeId: relation.source_ref.event_id,
        afterId: relation.target_ref.event_id,
        source: relation.id,
        minGapYears: relation.type === "precedes" ? 0.001 : 0
      }
    ];
  });
  const dataset: Dataset = {
    events: events.map((event) => ({
      id: event.id,
      canonId: state.world.id,
      title: event.title,
      type: compositeIds.has(event.id) ? "composite" : "instant"
    })),
    canons: [],
    timeSystems: [],
    structuralLinks: [],
    semanticLinks: [
      ...[...children].flatMap(([parent, members]) =>
        [...members].sort().map((child) => ({
          id: `contains:${parent}:${child}`,
          type: "contains",
          fromId: parent,
          toId: child
        }))
      ),
      ...relations
        .filter(
          (relation) =>
            relation.type === "causes" &&
            relation.source_ref.kind === "event" &&
            relation.target_ref.kind === "event"
        )
        .map((relation) => ({
          id: relation.id,
          type: "causes",
          fromId: (relation.source_ref as { event_id: string }).event_id,
          toId: (relation.target_ref as { event_id: string }).event_id
        }))
    ]
  };
  const chart = buildGraphShellChartPlane(
    dataset,
    {
      axis: {
        startYear: 0,
        endYear: 0,
        timeSystemId,
        compatibilityKey: String(system.definition.coordinate_codec)
      }
    },
    {
      explicitExtents: extents,
      temporalConstraints: constraints,
      ...(state.events.length > 500
        ? { boundedRepulsion: { neighborsPerSide: 24, windowYears: 10 } }
        : {})
    }
  );
  // The renderer can invent fallback positions for unconstrained records.
  // Never present these as Gregorian facts: only anchored Events and regions
  // enclosing an anchored World child enter the calendar plane.
  const anchored = new Set(extents.keys());
  const visible = new Set<string>(anchored);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [parent, members] of children)
      if (
        !visible.has(parent) &&
        [...members].some((child) => visible.has(child))
      ) {
        visible.add(parent);
        changed = true;
      }
  }
  const shapes = chart.entities
    // The renderer also emits Relation line entities whose eventId points to
    // an endpoint. A line is not a second World Event node: Relation detail
    // and adjacency own its identity, while this index contains one Event
    // geometry per World Event.
    .filter(
      (item) =>
        item.id === item.eventId &&
        included.has(item.eventId) &&
        visible.has(item.eventId)
    )
    .map(shape)
    .sort((a, b) =>
      a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0
    );
  const drawn = new Set(shapes.map((item) => item.event_id));
  return {
    world_id: state.world.id,
    revision: temporal.source_revision,
    time_system_id: timeSystemId,
    algorithm_version:
      state.events.length > 500 ? "v5-world-layout/2" : "v5-world-layout/1",
    temporal_digest: temporal.semantic_digest,
    shapes,
    unplaced_event_ids: events
      .filter((event) => !drawn.has(event.id))
      .map((event) => event.id),
    diagnostics: chart.diagnostics.map(({ code, message }) => ({
      code,
      message
    }))
  };
}
