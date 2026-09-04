import {
  SYNTHETIC_FIXTURE,
  type PublicCanon,
  type PublicEvent,
  type PublicNarrative,
  type PublicRelation,
  type PublicSearchEntry,
  type PublicSubjectArtifactReference,
  type PublicSubjectHandleDocument,
  type PublicTimelineArtifactReference,
  type PublicTimelineProjection,
  type PublicTemporalPlacement,
  type PublicTimeSystem,
  type PublicationManifest,
  type PublicationPointer,
  type PublicWorld
} from "@moirai/contracts";
import {
  buildPublicationArtifacts,
  currentKey,
  S3ObjectStore,
  type ObjectRead
} from "@moirai/publication";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function syntheticObjects(): ReadonlyMap<string, string> {
  const fixture = SYNTHETIC_FIXTURE;
  const events: PublicEvent[] = [
    {
      id: fixture.eventId,
      canon_id: fixture.canonId,
      slug: "first-lantern",
      kind: "atomic",
      title: fixture.eventTitle,
      summary: "At dusk, the archive keeper lights the first lantern.",
      roles: [],
      attributes: {}
    },
    {
      id: fixture.secondEventId,
      canon_id: fixture.canonId,
      slug: "eastern-lantern-answers",
      kind: "atomic",
      title: fixture.secondEventTitle,
      summary: "A second light answers from the archive's eastern tower.",
      roles: [],
      attributes: {}
    },
    {
      id: fixture.thirdEventId,
      canon_id: fixture.canonId,
      slug: "archive-opens",
      kind: "atomic",
      title: fixture.thirdEventTitle,
      summary: "The paired lights signal that the archive may open.",
      roles: [],
      attributes: {}
    }
  ];
  const timeSystem: PublicTimeSystem = {
    id: fixture.timeSystemId,
    world_id: fixture.worldId,
    slug: "ember-count",
    title: "Ember Count",
    kind: "ordinal",
    definition_version: "1",
    definition: { coordinate: "integer", unit: "bell" }
  };
  const artifacts = buildPublicationArtifacts(
    {
      world: {
        id: fixture.worldId,
        slug: "lantern-archive",
        title: fixture.worldTitle,
        description: "A synthetic World that proves Moirai's publication path."
      },
      canons: [
        {
          id: fixture.canonId,
          world_id: fixture.worldId,
          slug: "ember-canon",
          title: fixture.canonTitle,
          description: "One self-contained synthetic truth context."
        }
      ],
      timeSystems: [timeSystem],
      canonTimeSystems: [
        {
          id: fixture.canonTimeSystemId,
          canon_id: fixture.canonId,
          time_system_id: fixture.timeSystemId
        }
      ],
      events,
      temporalPlacements: [
        {
          id: fixture.firstPlacementId,
          event_id: fixture.eventId,
          time_system_id: fixture.timeSystemId,
          kind: "point",
          earliest_start: { value: 1 },
          latest_start: { value: 1 },
          earliest_end: null,
          latest_end: null,
          precision: "bell",
          certainty: "exact",
          display_label: "First bell"
        },
        {
          id: fixture.secondPlacementId,
          event_id: fixture.secondEventId,
          time_system_id: fixture.timeSystemId,
          kind: "point",
          earliest_start: { value: 2 },
          latest_start: { value: 2 },
          earliest_end: null,
          latest_end: null,
          precision: "bell",
          certainty: "exact",
          display_label: "Second bell"
        },
        {
          id: fixture.thirdPlacementId,
          event_id: fixture.thirdEventId,
          time_system_id: fixture.timeSystemId,
          kind: "point",
          earliest_start: { value: 3 },
          latest_start: { value: 4 },
          earliest_end: null,
          latest_end: null,
          precision: "bell",
          certainty: "approximate",
          display_label: "Between the third and fourth bell"
        }
      ],
      relations: [
        {
          id: fixture.causalRelationId,
          canon_id: fixture.canonId,
          type: "causes",
          source_event_id: fixture.eventId,
          target_event_id: fixture.secondEventId,
          direction: "directed",
          attributes: {}
        },
        {
          id: fixture.structuralRelationId,
          canon_id: fixture.canonId,
          type: "precedes",
          source_event_id: fixture.secondEventId,
          target_event_id: fixture.thirdEventId,
          direction: "directed",
          attributes: {}
        },
        {
          id: fixture.identityRelationId,
          canon_id: fixture.canonId,
          type: "identity_continues",
          source_event_id: fixture.eventId,
          target_event_id: fixture.secondEventId,
          direction: "directed",
          attributes: {}
        }
      ],
      narratives: [
        {
          id: fixture.canonNarrativeId,
          canon_id: fixture.canonId,
          scope_type: "canon",
          scope_id: fixture.canonId,
          locale: "en",
          kind: "primary",
          title: "When the lanterns answer",
          body: "Each evening begins with one deliberate flame. The answering light carries its signal across the archive, and the doors open only after both towers are visible.",
          public_references: []
        },
        {
          id: fixture.eventNarrativeId,
          canon_id: fixture.canonId,
          scope_type: "event",
          scope_id: fixture.secondEventId,
          locale: "en",
          kind: "primary",
          title: "An answer in the east",
          body: "The eastern keeper sees the first flame and raises a lantern in reply. The response is both acknowledgement and the next link in the opening sequence.",
          public_references: []
        }
      ]
    },
    2,
    "2026-08-31T00:00:00.000Z"
  );
  return new Map([
    ...artifacts.documents.map(({ key, body }) => [key, body] as const),
    [artifacts.manifestKey, artifacts.manifestBody],
    [currentKey(artifacts.worldId), JSON.stringify(artifacts.pointer)]
  ]);
}

const localObjects = syntheticObjects();
let objectStore: S3ObjectStore | undefined;

function hasS3Config(): boolean {
  return [
    "AWS_ACCESS_KEY_ID",
    "AWS_S3_BUCKET_NAME",
    "AWS_ENDPOINT_URL",
    "AWS_DEFAULT_REGION",
    "AWS_SECRET_ACCESS_KEY"
  ].every((name) => Boolean(process.env[name]));
}

export function assertPublicId(value: string): void {
  if (!UUID.test(value)) throw new Error("invalid public identifier");
}

export async function readPublicationObject(key: string): Promise<ObjectRead> {
  if (!/^[a-z0-9/._-]+$/i.test(key) || key.includes(".."))
    throw new Error("invalid publication key");
  if (!hasS3Config()) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_SYNTHETIC_PUBLICATION_FIXTURE !== "true"
    ) {
      throw new Error("Publication Store is not configured");
    }
    const body = localObjects.get(key);
    return body
      ? { status: 200, body, etag: '"local-m2"' }
      : { status: 404, body: null, etag: null };
  }
  objectStore ??= new S3ObjectStore();
  return objectStore.get(key);
}

async function readJson<T>(key: string): Promise<T> {
  const object = await readPublicationObject(key);
  if (object.status !== 200 || object.body === null)
    throw new Error(`publication object unavailable: ${object.status}`);
  return JSON.parse(object.body) as T;
}

export async function selectPublication(
  worldId: string
): Promise<{ pointer: PublicationPointer; manifest: PublicationManifest }> {
  assertPublicId(worldId);
  const pointer = await readJson<PublicationPointer>(currentKey(worldId));
  if (pointer.world_id !== worldId || pointer.served_revision < 1)
    throw new Error("invalid Publication pointer");
  const manifest = await readJson<PublicationManifest>(pointer.manifest_key);
  if (
    manifest.world_id !== worldId ||
    manifest.served_revision !== pointer.served_revision ||
    manifest.completeness !== "complete"
  ) {
    throw new Error("Publication manifest mismatch");
  }
  return { pointer, manifest };
}

export type SelectedPublication = Awaited<ReturnType<typeof selectPublication>>;

export async function readWorld(
  worldId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  world: PublicWorld;
  canons: readonly PublicCanon[];
}> {
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    world: PublicWorld;
    canons: readonly PublicCanon[];
    served_revision: number;
  }>(`worlds/${worldId}/revisions/${pointer.served_revision}/world.json`);
  if (document.served_revision !== pointer.served_revision)
    throw new Error("mixed Publication revisions");
  return { pointer, world: document.world, canons: document.canons };
}

export async function readCanon(
  worldId: string,
  canonId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  canon: PublicCanon;
  events: readonly PublicEvent[];
  narratives: readonly PublicNarrative[];
  timeSystems: readonly PublicTimeSystem[];
  timelineArtifacts: readonly PublicTimelineArtifactReference[];
  subjectArtifacts: readonly PublicSubjectArtifactReference[];
}> {
  assertPublicId(canonId);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    canon: PublicCanon;
    events: readonly PublicEvent[];
    narratives: readonly PublicNarrative[];
    time_systems: readonly PublicTimeSystem[];
    timeline_artifacts?: readonly PublicTimelineArtifactReference[];
    subject_artifacts?: readonly PublicSubjectArtifactReference[];
    served_revision: number;
  }>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/canons/${canonId}.json`
  );
  if (
    document.served_revision !== pointer.served_revision ||
    document.canon.world_id !== worldId
  )
    throw new Error("mixed Publication revisions");
  return {
    pointer,
    canon: document.canon,
    events: document.events,
    narratives: document.narratives,
    timeSystems: document.time_systems,
    timelineArtifacts: document.timeline_artifacts ?? [],
    subjectArtifacts: document.subject_artifacts ?? []
  };
}

export async function readSubject(
  worldId: string,
  canonId: string,
  subjectHandleId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  document: PublicSubjectHandleDocument;
}> {
  assertPublicId(canonId);
  assertPublicId(subjectHandleId);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<PublicSubjectHandleDocument>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/subjects/${subjectHandleId}.json`
  );
  if (
    document.world_id !== worldId ||
    document.served_revision !== pointer.served_revision ||
    document.handle.canon_id !== canonId ||
    document.handle.id !== subjectHandleId
  ) {
    throw new Error("mixed Publication revisions");
  }
  return { pointer, document };
}

export async function readTimeline(
  worldId: string,
  canonId: string,
  reference: PublicTimelineArtifactReference,
  selected?: SelectedPublication
): Promise<PublicTimelineProjection> {
  assertPublicId(canonId);
  assertPublicId(reference.time_system_id);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const expectedKey = `worlds/${worldId}/revisions/${pointer.served_revision}/graph/canons/${canonId}/timeline-${reference.time_system_id}.json`;
  if (reference.key !== expectedKey) throw new Error("invalid Timeline key");
  const document = await readJson<PublicTimelineProjection>(reference.key);
  if (
    document.world_id !== worldId ||
    document.canon_id !== canonId ||
    document.time_system_id !== reference.time_system_id ||
    document.source_revision !== pointer.served_revision ||
    document.algorithm_version !== reference.algorithm_version
  ) {
    throw new Error("mixed Publication revisions");
  }
  return document;
}

export async function readEvent(
  worldId: string,
  canonId: string,
  eventId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  event: PublicEvent;
  narratives: readonly PublicNarrative[];
  temporalPlacements: readonly PublicTemporalPlacement[];
  timeSystems: readonly PublicTimeSystem[];
  relations: readonly PublicRelation[];
  relatedEvents: readonly PublicEvent[];
}> {
  assertPublicId(canonId);
  assertPublicId(eventId);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    event: PublicEvent;
    narratives: readonly PublicNarrative[];
    temporal_placements: readonly PublicTemporalPlacement[];
    time_systems: readonly PublicTimeSystem[];
    relations: readonly PublicRelation[];
    related_events: readonly PublicEvent[];
    served_revision: number;
  }>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/events/${eventId}.json`
  );
  if (
    document.served_revision !== pointer.served_revision ||
    document.event.canon_id !== canonId
  )
    throw new Error("mixed Publication revisions");
  return {
    pointer,
    event: document.event,
    narratives: document.narratives,
    temporalPlacements: document.temporal_placements,
    timeSystems: document.time_systems,
    relations: document.relations,
    relatedEvents: document.related_events
  };
}

export async function searchWorld(
  worldId: string,
  query: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  entries: readonly PublicSearchEntry[];
}> {
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    served_revision: number;
    entries: readonly PublicSearchEntry[];
  }>(`worlds/${worldId}/revisions/${pointer.served_revision}/search/en.json`);
  if (document.served_revision !== pointer.served_revision)
    throw new Error("mixed Publication revisions");
  const terms = query
    .toLocaleLowerCase("en")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const entries =
    terms.length === 0
      ? document.entries
      : document.entries.filter((entry) => {
          const haystack = `${entry.title} ${entry.text}`.toLocaleLowerCase(
            "en"
          );
          return terms.every((term) => haystack.includes(term));
        });
  return { pointer, entries };
}
