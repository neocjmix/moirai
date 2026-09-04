import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicNarrative,
  PublicRelation,
  PublicSearchEntry,
  PublicTimelineProjection,
  PublicTemporalPlacement,
  PublicTimeSystem,
  PublicWorld
} from "@moirai/contracts";
import { createHash } from "node:crypto";

export const TIMELINE_ALGORITHM_VERSION = "m4-timeline-v1";

export interface CanonicalRevisionView {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly events: readonly PublicEvent[];
  readonly temporalPlacements: readonly PublicTemporalPlacement[];
  readonly relations: readonly PublicRelation[];
  readonly narratives: readonly PublicNarrative[];
}

export interface ProjectionDocument {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface TimelineProjectionParameters {
  readonly canonId: string;
  readonly timeSystemId: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function stronglyConnectedComponents(
  eventIds: readonly string[],
  relations: readonly PublicRelation[]
): readonly (readonly string[])[] {
  const adjacency = new Map(eventIds.map((id) => [id, [] as string[]]));
  for (const relation of relations) {
    adjacency.get(relation.source_event_id)?.push(relation.target_event_id);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const components: string[][] = [];

  const visit = (eventId: string): void => {
    const index = nextIndex++;
    indices.set(eventId, index);
    lowLinks.set(eventId, index);
    stack.push(eventId);
    inStack.add(eventId);

    for (const targetId of adjacency.get(eventId) ?? []) {
      if (!indices.has(targetId)) {
        visit(targetId);
        lowLinks.set(
          eventId,
          Math.min(lowLinks.get(eventId)!, lowLinks.get(targetId)!)
        );
      } else if (inStack.has(targetId)) {
        lowLinks.set(
          eventId,
          Math.min(lowLinks.get(eventId)!, indices.get(targetId)!)
        );
      }
    }

    if (lowLinks.get(eventId) !== indices.get(eventId)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      inStack.delete(member);
      component.push(member);
      if (member === eventId) break;
    }
    components.push(component.sort());
  };

  for (const eventId of [...eventIds].sort()) {
    if (!indices.has(eventId)) visit(eventId);
  }
  return components.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

function structuralRanks(
  components: readonly (readonly string[])[],
  relations: readonly PublicRelation[]
): ReadonlyMap<string, number> {
  const componentByEvent = new Map<string, number>();
  components.forEach((component, index) => {
    for (const eventId of component) componentByEvent.set(eventId, index);
  });
  const outgoing = new Map<number, Set<number>>();
  const incoming = new Map<number, Set<number>>();
  components.forEach((_, index) => {
    outgoing.set(index, new Set());
    incoming.set(index, new Set());
  });
  for (const relation of relations) {
    const source = componentByEvent.get(relation.source_event_id)!;
    const target = componentByEvent.get(relation.target_event_id)!;
    if (source === target) continue;
    outgoing.get(source)!.add(target);
    incoming.get(target)!.add(source);
  }
  const remainingIncoming = new Map(
    [...incoming].map(([index, sources]) => [index, new Set(sources)])
  );
  const rank = new Map<number, number>();
  const ready = components
    .map((_, index) => index)
    .filter((index) => remainingIncoming.get(index)!.size === 0)
    .sort((left, right) =>
      components[left]![0]!.localeCompare(components[right]![0]!)
    );
  while (ready.length > 0) {
    const current = ready.shift()!;
    const predecessors = [...incoming.get(current)!];
    rank.set(
      current,
      predecessors.length === 0
        ? 0
        : Math.max(...predecessors.map((item) => rank.get(item) ?? 0)) + 1
    );
    for (const target of [...outgoing.get(current)!].sort((left, right) =>
      components[left]![0]!.localeCompare(components[right]![0]!)
    )) {
      remainingIncoming.get(target)!.delete(current);
      if (remainingIncoming.get(target)!.size === 0) {
        ready.push(target);
        ready.sort((left, right) =>
          components[left]![0]!.localeCompare(components[right]![0]!)
        );
      }
    }
  }
  return new Map(
    [...componentByEvent].map(([eventId, component]) => [
      eventId,
      rank.get(component) ?? 0
    ])
  );
}

export function projectTimeline(
  source: CanonicalRevisionView,
  sourceRevision: number,
  parameters: TimelineProjectionParameters
): PublicTimelineProjection {
  const canon = source.canons.find((item) => item.id === parameters.canonId);
  const timeSystem = source.timeSystems.find(
    (item) => item.id === parameters.timeSystemId
  );
  const linked = source.canonTimeSystems.some(
    (item) =>
      item.canon_id === parameters.canonId &&
      item.time_system_id === parameters.timeSystemId
  );
  if (!canon || !timeSystem || !linked || canon.world_id !== source.world.id) {
    throw new Error("timeline_projection_scope_invalid");
  }

  const events = sorted(
    source.events.filter((event) => event.canon_id === parameters.canonId)
  );
  const eventIds = new Set(events.map((event) => event.id));
  const precedence = sorted(
    source.relations.filter(
      (relation) =>
        relation.canon_id === parameters.canonId &&
        relation.type === "precedes" &&
        eventIds.has(relation.source_event_id) &&
        eventIds.has(relation.target_event_id)
    )
  );
  const placements = sorted(
    source.temporalPlacements.filter(
      (placement) =>
        placement.time_system_id === parameters.timeSystemId &&
        eventIds.has(placement.event_id)
    )
  );
  const placementsByEvent = new Map<string, PublicTemporalPlacement[]>();
  for (const placement of placements) {
    const current = placementsByEvent.get(placement.event_id) ?? [];
    current.push(placement);
    placementsByEvent.set(placement.event_id, current);
  }

  const authored = events
    .flatMap((event) => {
      const values = placementsByEvent.get(event.id) ?? [];
      if (values.length === 0) return [];
      return [
        {
          event,
          placements: values,
          start: Math.min(...values.map((item) => item.earliest_start.value)),
          end: Math.max(...values.map((item) => item.latest_start.value))
        }
      ];
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.event.id.localeCompare(right.event.id)
    );
  const authoredGroup = new Map<string, number>();
  let group = -1;
  let groupEnd = Number.NEGATIVE_INFINITY;
  for (const item of authored) {
    if (item.start > groupEnd) group += 1;
    authoredGroup.set(item.event.id, group);
    groupEnd = Math.max(groupEnd, item.end);
  }

  const components = stronglyConnectedComponents(
    events.map((event) => event.id),
    precedence
  );
  const ranks = structuralRanks(components, precedence);
  const structurallyConnected = new Set(
    precedence.flatMap((relation) => [
      relation.source_event_id,
      relation.target_event_id
    ])
  );
  const cycleComponents = components.filter(
    (component) =>
      component.length > 1 ||
      precedence.some(
        (relation) =>
          relation.source_event_id === component[0] &&
          relation.target_event_id === component[0]
      )
  );
  const unplacedIds = events
    .filter(
      (event) =>
        !placementsByEvent.has(event.id) && !structurallyConnected.has(event.id)
    )
    .map((event) => event.id);
  const items = events
    .map((event) => {
      const eventPlacements = placementsByEvent.get(event.id) ?? [];
      const eventRelations = precedence.filter(
        (relation) =>
          relation.source_event_id === event.id ||
          relation.target_event_id === event.id
      );
      if (eventPlacements.length > 0) {
        const rangeStart = Math.min(
          ...eventPlacements.map((item) => item.earliest_start.value)
        );
        const rangeEnd = Math.max(
          ...eventPlacements.map((item) => item.latest_start.value)
        );
        const certainty = eventPlacements.reduce<
          PublicTemporalPlacement["certainty"]
        >((leastCertain, placement) => {
          const certaintyRank = { exact: 0, approximate: 1, uncertain: 2 };
          return certaintyRank[placement.certainty] >
            certaintyRank[leastCertain]
            ? placement.certainty
            : leastCertain;
        }, "exact");
        return {
          event_id: event.id,
          placement_kind: "authored_coordinate" as const,
          range_start: rangeStart,
          range_end: rangeEnd,
          structural_rank: ranks.get(event.id) ?? null,
          unordered_group: `authored:${authoredGroup.get(event.id)}`,
          display_label:
            eventPlacements.length === 1
              ? eventPlacements[0]!.display_label
              : null,
          certainty,
          evidence_ids: [
            ...eventPlacements.map((item) => item.id),
            ...eventRelations.map((item) => item.id)
          ].sort()
        };
      }
      if (structurallyConnected.has(event.id)) {
        const rank = ranks.get(event.id) ?? 0;
        return {
          event_id: event.id,
          placement_kind: "structural_order" as const,
          range_start: null,
          range_end: null,
          structural_rank: rank,
          unordered_group: `structural:${rank}`,
          display_label: null,
          certainty: null,
          evidence_ids: eventRelations.map((item) => item.id).sort()
        };
      }
      return {
        event_id: event.id,
        placement_kind: "unplaced" as const,
        range_start: null,
        range_end: null,
        structural_rank: null,
        unordered_group: "unplaced",
        display_label: null,
        certainty: null,
        evidence_ids: []
      };
    })
    .sort((left, right) => {
      const kindOrder = {
        authored_coordinate: 0,
        structural_order: 1,
        unplaced: 2
      } as const;
      return (
        kindOrder[left.placement_kind] - kindOrder[right.placement_kind] ||
        (left.range_start ?? left.structural_rank ?? 0) -
          (right.range_start ?? right.structural_rank ?? 0) ||
        left.event_id.localeCompare(right.event_id)
      );
    });
  const diagnostics = [
    ...cycleComponents.map((component) => ({
      code: "timeline_cycle" as const,
      affected_ids: component
    })),
    ...(unplacedIds.length > 0
      ? [
          {
            code: "timeline_unplaced" as const,
            affected_ids: unplacedIds
          }
        ]
      : [])
  ];
  const semantic = {
    world_id: source.world.id,
    source_revision: sourceRevision,
    projection_type: "timeline" as const,
    algorithm_version: TIMELINE_ALGORITHM_VERSION,
    parameters_digest: digest({
      canon_id: parameters.canonId,
      time_system_id: parameters.timeSystemId
    }),
    canon_id: parameters.canonId,
    time_system_id: parameters.timeSystemId,
    items,
    evidence: [
      ...placements.map((item) => item.id),
      ...precedence.map((item) => item.id)
    ].sort(),
    diagnostics,
    completeness:
      diagnostics.length === 0 ? ("complete" as const) : ("partial" as const)
  };
  return { ...semantic, semantic_digest: digest(semantic) };
}

function sorted<T extends { readonly id: string }>(
  items: readonly T[]
): readonly T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function allowlistView(view: CanonicalRevisionView): CanonicalRevisionView {
  return {
    world: {
      id: view.world.id,
      slug: view.world.slug,
      title: view.world.title,
      description: view.world.description
    },
    canons: view.canons.map((item) => ({
      id: item.id,
      world_id: item.world_id,
      slug: item.slug,
      title: item.title,
      description: item.description
    })),
    timeSystems: view.timeSystems.map((item) => ({
      id: item.id,
      world_id: item.world_id,
      slug: item.slug,
      title: item.title,
      kind: item.kind,
      definition_version: item.definition_version,
      definition: item.definition
    })),
    canonTimeSystems: view.canonTimeSystems.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      time_system_id: item.time_system_id
    })),
    events: view.events.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      slug: item.slug,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      roles: item.roles,
      attributes: item.attributes
    })),
    temporalPlacements: view.temporalPlacements.map((item) => ({
      id: item.id,
      event_id: item.event_id,
      time_system_id: item.time_system_id,
      kind: item.kind,
      earliest_start: item.earliest_start,
      latest_start: item.latest_start,
      earliest_end: item.earliest_end,
      latest_end: item.latest_end,
      precision: item.precision,
      certainty: item.certainty,
      display_label: item.display_label
    })),
    relations: view.relations.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      type: item.type,
      source_event_id: item.source_event_id,
      target_event_id: item.target_event_id,
      direction: item.direction,
      attributes: item.attributes
    })),
    narratives: view.narratives.map((item) => ({
      id: item.id,
      canon_id: item.canon_id,
      scope_type: item.scope_type,
      scope_id: item.scope_id,
      locale: item.locale,
      kind: item.kind,
      title: item.title,
      body: item.body,
      public_references: item.public_references.map((reference) => ({
        label: reference.label,
        url: reference.url
      }))
    }))
  };
}

function narrativeText(
  narratives: readonly PublicNarrative[],
  scopeType: PublicNarrative["scope_type"],
  scopeId: string
): string {
  return narratives
    .filter(
      (item) => item.scope_type === scopeType && item.scope_id === scopeId
    )
    .flatMap((item) => [
      item.title ?? "",
      item.body,
      ...item.public_references.flatMap((reference) => [
        reference.label,
        reference.url
      ])
    ])
    .join(" ")
    .trim();
}

function searchEntries(
  view: CanonicalRevisionView,
  revision: number
): readonly PublicSearchEntry[] {
  const worldEntry: PublicSearchEntry = {
    target_id: view.world.id,
    target_type: "world",
    canonical_url: `/worlds/${view.world.id}`,
    world_id: view.world.id,
    canon_id: null,
    title: view.world.title,
    text: [view.world.title, view.world.description ?? ""].join(" ").trim(),
    served_revision: revision
  };
  const canonEntries = sorted(view.canons).map((canon): PublicSearchEntry => ({
    target_id: canon.id,
    target_type: "canon",
    canonical_url: `/worlds/${view.world.id}/canons/${canon.id}`,
    world_id: view.world.id,
    canon_id: canon.id,
    title: canon.title,
    text: [
      canon.title,
      canon.description ?? "",
      narrativeText(view.narratives, "canon", canon.id)
    ]
      .join(" ")
      .trim(),
    served_revision: revision
  }));
  const eventEntries = sorted(view.events).map((event): PublicSearchEntry => ({
    target_id: event.id,
    target_type: "event",
    canonical_url: `/worlds/${view.world.id}/canons/${event.canon_id}/events/${event.id}`,
    world_id: view.world.id,
    canon_id: event.canon_id,
    title: event.title,
    text: [
      event.title,
      event.summary ?? "",
      narrativeText(view.narratives, "event", event.id)
    ]
      .join(" ")
      .trim(),
    served_revision: revision
  }));
  return [worldEntry, ...canonEntries, ...eventEntries];
}

export function projectPublicDocuments(
  source: CanonicalRevisionView,
  revision: number,
  generatedAt: string
): readonly ProjectionDocument[] {
  const view = allowlistView(source);
  const prefix = `worlds/${view.world.id}/revisions/${revision}`;
  const metadata = {
    world_id: view.world.id,
    served_revision: revision,
    generated_at: generatedAt
  };
  const canons = sorted(view.canons);
  const events = sorted(view.events);
  const narratives = sorted(view.narratives);
  const timeSystems = sorted(view.timeSystems);
  const relations = sorted(view.relations);
  const temporalPlacements = sorted(view.temporalPlacements);
  const timelineDocuments = sorted(view.canonTimeSystems).flatMap((link) => {
    if (
      !canons.some((canon) => canon.id === link.canon_id) ||
      !timeSystems.some((timeSystem) => timeSystem.id === link.time_system_id)
    ) {
      return [];
    }
    const projection = projectTimeline(view, revision, {
      canonId: link.canon_id,
      timeSystemId: link.time_system_id
    });
    return [
      {
        key: `${prefix}/graph/canons/${link.canon_id}/timeline-${link.time_system_id}.json`,
        value: { ...metadata, ...projection }
      }
    ];
  });
  return [
    {
      key: `${prefix}/world.json`,
      value: {
        ...metadata,
        world: view.world,
        canons,
        search_key: `${prefix}/search/en.json`
      }
    },
    ...canons.map((canon) => ({
      key: `${prefix}/canons/${canon.id}.json`,
      value: {
        ...metadata,
        canon,
        narratives: narratives.filter(
          (item) => item.scope_type === "canon" && item.scope_id === canon.id
        ),
        events: events.filter((event) => event.canon_id === canon.id),
        time_systems: timeSystems.filter((timeSystem) =>
          view.canonTimeSystems.some(
            (link) =>
              link.canon_id === canon.id &&
              link.time_system_id === timeSystem.id
          )
        ),
        timeline_artifacts: timelineDocuments
          .filter((document) =>
            document.key.includes(`/graph/canons/${canon.id}/`)
          )
          .map((document) => ({
            time_system_id: String(document.value.time_system_id),
            key: document.key,
            algorithm_version: String(document.value.algorithm_version)
          }))
      }
    })),
    ...events.map((event) => {
      const eventRelations = relations.filter(
        (relation) =>
          relation.source_event_id === event.id ||
          relation.target_event_id === event.id
      );
      const relatedIds = new Set(
        eventRelations.flatMap((relation) => [
          relation.source_event_id,
          relation.target_event_id
        ])
      );
      relatedIds.delete(event.id);
      const placements = temporalPlacements.filter(
        (placement) => placement.event_id === event.id
      );
      const placementTimeIds = new Set(
        placements.map((placement) => placement.time_system_id)
      );
      return {
        key: `${prefix}/events/${event.id}.json`,
        value: {
          ...metadata,
          event,
          narratives: narratives.filter(
            (item) => item.scope_type === "event" && item.scope_id === event.id
          ),
          temporal_placements: placements,
          time_systems: timeSystems.filter((timeSystem) =>
            placementTimeIds.has(timeSystem.id)
          ),
          relations: eventRelations,
          related_events: events.filter((candidate) =>
            relatedIds.has(candidate.id)
          )
        }
      };
    }),
    {
      key: `${prefix}/search/en.json`,
      value: {
        ...metadata,
        locale: "en",
        entries: searchEntries(view, revision)
      }
    },
    ...timelineDocuments
  ];
}
