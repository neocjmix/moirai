/** Active Lachesis v5 geometry producer. The World owns one layout per selected Time
 * System; Collections select Event IDs later and cannot move a shared Event.
 * URDR's canonId below is a private renderer scope token, not ontology. */
import type { CanonicalState } from "@moirai/contracts/v5";
import type {
  CanonicalEventReference,
  PublicTemporalPosition
} from "@moirai/contracts";
import type { projectV5WorldTemporal } from "@moirai/projections";
import { temporalAdapterRegistry } from "@moirai/domain";
import {
  computeLayout,
  CANONICAL_LAYOUT_SELECTION,
  type LayoutInput,
  type LayoutOutput,
  type LayoutSelection
} from "./layout-engine.js";
import type { Dataset } from "./urdr-layout-types.js";

export type V5LayoutCanonicalInput = Pick<
  CanonicalState,
  "world" | "events" | "relations" | "timeSystems"
> &
  Partial<Pick<CanonicalState, "collections" | "eventCollectionMemberships">>;
export interface V5LayoutTemporalInput {
  readonly world_id: string;
  readonly source_revision: number;
  readonly semantic_digest: string;
  readonly composites: readonly { readonly event_id: string }[];
  readonly positions: readonly (Pick<
    PublicTemporalPosition,
    "event_id" | "kind" | "time_event"
  > & {
    readonly lower?: { readonly time_event: CanonicalEventReference } | null;
    readonly upper?: { readonly time_event: CanonicalEventReference } | null;
  })[];
}
export type V5WorldLayout = LayoutOutput;

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

export function prepareV5LayoutInput(
  state: V5LayoutCanonicalInput,
  temporal: V5LayoutTemporalInput,
  timeSystemId: string
): LayoutInput {
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
  const collectionIds = [...(state.collections ?? [])].map((c) => c.id).sort();
  const eventIds = new Set(events.map((e) => e.id));
  const selectedBy = new Map<string, Set<string>>();
  const members = new Map(collectionIds.map((id) => [id, new Set<string>()]));
  for (const m of state.eventCollectionMemberships ?? []) {
    if (!eventIds.has(m.event_id) || !members.has(m.collection_id))
      throw Error("v5_layout_membership_invalid");
    members.get(m.collection_id)!.add(m.event_id);
    const selected = selectedBy.get(m.event_id) ?? new Set<string>();
    selected.add(m.collection_id);
    selectedBy.set(m.event_id, selected);
  }
  return {
    formatVersion: "layout-input/1",
    worldId: state.world.id,
    revision: temporal.source_revision,
    timeSystemId,
    temporalDigest: temporal.semantic_digest,
    dataset,
    board: {
      axis: {
        startYear: 0,
        endYear: 0,
        timeSystemId,
        compatibilityKey: String(system.definition.coordinate_codec)
      }
    },
    explicitExtents: [...extents].map(([eventId, extent]) => ({
      eventId,
      ...extent
    })),
    temporalConstraints: constraints,
    visibleEventIds: [...visible],
    incidence: {
      formatVersion: "collection-incidence/1",
      events: events.map((e) => ({
        id: e.id,
        childIds: [...(children.get(e.id) ?? [])].sort(),
        collectionIds: [...(selectedBy.get(e.id) ?? [])].sort()
      })),
      collections: collectionIds.map((id) => ({
        id,
        eventIds: [...members.get(id)!].sort()
      })),
      relations: relations.flatMap((r) =>
        r.source_ref.kind === "event" && r.target_ref.kind === "event"
          ? [
              {
                id: r.id,
                type: r.type,
                sourceId: r.source_ref.event_id,
                targetId: r.target_ref.event_id
              }
            ]
          : []
      )
    }
  };
}

/** Production and research execute the same pure implementation. Only this
 * fixed selection is used by Lachesis; Lab presets never promote themselves. */
export function buildV5WorldLayout(
  state: CanonicalState,
  temporal: ReturnType<typeof projectV5WorldTemporal>,
  timeSystemId: string,
  selection: LayoutSelection = CANONICAL_LAYOUT_SELECTION
): V5WorldLayout {
  return computeLayout(
    prepareV5LayoutInput(state, temporal, timeSystemId),
    selection
  );
}
