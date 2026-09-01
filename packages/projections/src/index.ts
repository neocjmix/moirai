import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicNarrative,
  PublicRelation,
  PublicSearchEntry,
  PublicTemporalPlacement,
  PublicTimeSystem,
  PublicWorld
} from "@moirai/contracts";

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
        )
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
    }
  ];
}
