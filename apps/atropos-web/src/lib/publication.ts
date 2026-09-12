import {
  normalizePublicEvent,
  normalizePublicRelation,
  type LegacyPublicEvent,
  type LegacyPublicRelation
} from "@moirai/graph-query";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  LEGACY_PUBLICATION_FORMAT_VERSION,
  EVENT_MEMBERSHIP_PUBLICATION_FORMAT_VERSION,
  PUBLICATION_FORMAT_VERSION,
  TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  type PublicGraphScopeArtifact,
  type PublicRelationalTemporalProjection,
  type PublicCanon,
  type PublicEvent,
  type PublicNarrative,
  type PublicRelation,
  type PublicSearchEntry,
  type PublicSubjectArtifactReference,
  type PublicSubjectHandleDocument,
  type PublicTimeSystem,
  type PublicationManifest,
  type PublicationPointer,
  type PublicWorld
} from "@moirai/contracts";
import {
  currentKey,
  S3ObjectStore,
  type ObjectRead
} from "@moirai/publication";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let objectStore: S3ObjectStore | undefined;

export type PublishedWorldObservation =
  | {
      readonly availability: "ready";
      readonly worldId: string;
      readonly pointer: PublicationPointer;
      readonly world: PublicWorld;
      readonly canons: readonly PublicCanon[];
    }
  | {
      readonly availability: "unavailable";
      readonly worldId: string;
    };

export function hasPublicationStoreConfig(): boolean {
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
  if (!hasPublicationStoreConfig()) {
    if (process.env.LOCAL_PUBLICATION_FIXTURE_DIR) {
      try {
        const body = await readFile(
          join(process.env.LOCAL_PUBLICATION_FIXTURE_DIR, key),
          "utf8"
        );
        return { status: 200, body, etag: '"local-temporal-fixture"' };
      } catch {
        return { status: 404, body: null, etag: null };
      }
    }
    throw new Error("Publication Store is not configured");
  }
  objectStore ??= new S3ObjectStore();
  return objectStore.get(key);
}

export async function readPublishedWorlds(): Promise<
  readonly PublishedWorldObservation[]
> {
  if (!hasPublicationStoreConfig()) {
    if (process.env.LOCAL_PUBLICATION_FIXTURE_DIR) {
      const publication = await readWorld(TEMPORAL_EXPRESSIVENESS_WORLD_ID);
      return [
        {
          availability: "ready",
          worldId: publication.world.id,
          ...publication
        }
      ];
    }
    throw new Error("Publication Store is not configured");
  }
  objectStore ??= new S3ObjectStore();
  const { prefixes } = await objectStore.listCommonPrefixes("worlds/");
  const worldIds = prefixes.flatMap((prefix) => {
    const match = prefix.match(/^worlds\/([^/]+)\/$/);
    return match?.[1] && UUID.test(match[1]) ? [match[1]] : [];
  });
  const observations = await Promise.all(
    worldIds.map(async (worldId): Promise<PublishedWorldObservation> => {
      try {
        const publication = await readWorld(worldId);
        return {
          availability: "ready",
          worldId,
          ...publication
        };
      } catch {
        return { availability: "unavailable", worldId };
      }
    })
  );
  return observations.toSorted((left, right) =>
    left.worldId.localeCompare(right.worldId)
  );
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
    ![
      PUBLICATION_FORMAT_VERSION,
      EVENT_MEMBERSHIP_PUBLICATION_FORMAT_VERSION,
      LEGACY_PUBLICATION_FORMAT_VERSION
    ].includes(manifest.format_version) ||
    pointer.format_version !== manifest.format_version ||
    manifest.completeness !== "complete"
  ) {
    throw new Error("Publication manifest mismatch");
  }
  return { pointer, manifest };
}

/** Historical stable detail selection keeps current status metadata distinct from served content. */
export async function selectPublicationRevision(
  worldId: string,
  revision: number
) {
  assertPublicId(worldId);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("invalid_publication_revision");
  const current = await selectPublication(worldId);
  if (current.pointer.served_revision === revision) return current;
  const key = `worlds/${worldId}/revisions/${revision}/manifest.json`;
  const manifest = await readJson<PublicationManifest>(key);
  if (
    manifest.world_id !== worldId ||
    manifest.served_revision !== revision ||
    manifest.completeness !== "complete" ||
    ![
      PUBLICATION_FORMAT_VERSION,
      EVENT_MEMBERSHIP_PUBLICATION_FORMAT_VERSION,
      LEGACY_PUBLICATION_FORMAT_VERSION
    ].includes(manifest.format_version)
  )
    throw Error("historical_publication_mismatch");
  return {
    manifest,
    pointer: {
      ...current.pointer,
      served_revision: revision,
      manifest_key: key,
      format_version: manifest.format_version,
      generated_at: manifest.generated_at
    }
  };
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
  const publication = selected ?? (await selectPublication(worldId));
  const { pointer } = publication;
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
  subjectArtifacts: readonly PublicSubjectArtifactReference[];
  temporalArtifact: { key: string; algorithm_version: string };
  graphScopeArtifact: {
    key: string;
    algorithm_version: string;
    scope: "canon";
    lod: "overview";
  } | null;
}> {
  assertPublicId(canonId);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    canon: PublicCanon;
    events: readonly (PublicEvent | LegacyPublicEvent)[];
    narratives: readonly PublicNarrative[];
    time_systems?: readonly PublicTimeSystem[];
    subject_artifacts?: readonly PublicSubjectArtifactReference[];
    temporal_artifact: { key: string; algorithm_version: string };
    graph_scope_artifact?: {
      key: string;
      algorithm_version: string;
      scope: "canon";
      lod: "overview";
    };
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
    events: document.events.map((event) =>
      normalizePublicEvent(event, worldId)
    ),
    narratives: document.narratives,
    timeSystems: document.time_systems ?? [],
    subjectArtifacts: document.subject_artifacts ?? [],
    temporalArtifact: document.temporal_artifact,
    graphScopeArtifact: document.graph_scope_artifact ?? null
  };
}

export async function readGraphScope(
  worldId: string,
  canonId: string,
  reference: {
    key: string;
    algorithm_version: string;
    scope: "canon";
    lod: "overview";
  },
  selected: SelectedPublication
): Promise<PublicGraphScopeArtifact> {
  assertPublicId(canonId);
  const revision = selected.pointer.served_revision;
  if (
    selected.pointer.world_id !== worldId ||
    reference.scope !== "canon" ||
    reference.lod !== "overview" ||
    reference.key !==
      `worlds/${worldId}/revisions/${revision}/graph/canons/${canonId}/scope-overview.json`
  )
    throw new Error("invalid graph scope artifact key");
  const document = await readJson<PublicGraphScopeArtifact>(reference.key);
  if (
    document.world_id !== worldId ||
    document.canon_id !== canonId ||
    document.source_revision !== revision ||
    document.served_revision !== revision ||
    document.scope.kind !== "canon" ||
    document.scope.id !== canonId ||
    document.lod !== "overview" ||
    document.algorithm_version !== reference.algorithm_version ||
    document.nodes.some(
      (node) =>
        node.layout_basis !== "inferred_chronology" ||
        !node.chronology ||
        node.chronology.placement_kind !== "inferred_layout"
    ) ||
    document.budget.visible_cells > document.budget.max_cells ||
    document.budget.visible_labels > document.budget.max_labels
  )
    throw new Error("mixed Publication revisions");
  return document;
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

async function readEventDocument(
  worldId: string,
  eventId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  event: PublicEvent;
  narratives: readonly PublicNarrative[];
  relations: readonly PublicRelation[];
  relatedEvents: readonly PublicEvent[];
}> {
  assertPublicId(eventId);
  const publication = selected ?? (await selectPublication(worldId));
  const { pointer } = publication;
  const document = await readJson<{
    event: PublicEvent | LegacyPublicEvent;
    narratives: readonly PublicNarrative[];
    relations: readonly PublicRelation[];
    related_events: readonly (PublicEvent | LegacyPublicEvent)[];
    served_revision: number;
  }>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/events/${eventId}.json`
  );
  const event = normalizePublicEvent(document.event, worldId);
  if (
    document.served_revision !== pointer.served_revision ||
    event.world_id !== worldId
  )
    throw new Error("mixed Publication revisions");
  return {
    pointer,
    event,
    narratives: document.narratives,
    relations: document.relations.map((relation) =>
      normalizePublicRelation(relation, worldId)
    ),
    relatedEvents: document.related_events.map((candidate) =>
      normalizePublicEvent(candidate, worldId)
    )
  };
}

export async function readWorldEvent(
  worldId: string,
  eventId: string,
  selected?: SelectedPublication
) {
  return readEventDocument(worldId, eventId, selected);
}

export async function readEvent(
  worldId: string,
  canonId: string,
  eventId: string,
  selected?: SelectedPublication
) {
  assertPublicId(canonId);
  const document = await readEventDocument(worldId, eventId, selected);
  if (!document.event.canon_memberships.includes(canonId))
    throw new Error("event is outside the requested Canon scope");
  return {
    ...document,
    narratives: document.narratives.filter(
      (narrative) => narrative.canon_id === canonId
    ),
    relations: document.relations.filter((relation) =>
      relation.canon_memberships.includes(canonId)
    )
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
    entries: readonly (
      | PublicSearchEntry
      | (Omit<PublicSearchEntry, "canon_ids"> & {
          readonly canon_id: string | null;
        })
    )[];
  }>(`worlds/${worldId}/revisions/${pointer.served_revision}/search/en.json`);
  if (document.served_revision !== pointer.served_revision)
    throw new Error("mixed Publication revisions");
  const terms = query
    .toLocaleLowerCase("en")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const normalizedEntries = document.entries.map((entry): PublicSearchEntry => {
    if ("canon_ids" in entry) return entry;
    const { canon_id: canonId, ...value } = entry;
    return { ...value, canon_ids: canonId ? [canonId] : [] };
  });
  const entries =
    terms.length === 0
      ? normalizedEntries
      : normalizedEntries.filter((entry) => {
          const haystack = `${entry.title} ${entry.text}`.toLocaleLowerCase(
            "en"
          );
          return terms.every((term) => haystack.includes(term));
        });
  return { pointer, entries };
}

export async function readRelationalTime(
  worldId: string,
  canonId: string,
  reference: { key: string; algorithm_version: string },
  selected: SelectedPublication
): Promise<PublicRelationalTemporalProjection> {
  assertPublicId(canonId);
  const revision = selected.pointer.served_revision;
  if (
    selected.pointer.world_id !== worldId ||
    reference.key !==
      `worlds/${worldId}/revisions/${revision}/graph/canons/${canonId}/temporal.json`
  )
    throw new Error("invalid temporal artifact key");
  const document = await readJson<
    Omit<PublicRelationalTemporalProjection, "relations"> & {
      readonly relations: readonly (PublicRelation | LegacyPublicRelation)[];
      readonly served_revision: number;
    }
  >(reference.key);
  if (
    document.world_id !== worldId ||
    document.canon_id !== canonId ||
    document.source_revision !== revision ||
    document.served_revision !== revision ||
    document.algorithm_version !== reference.algorithm_version
  )
    throw new Error("mixed Publication revisions");
  return {
    ...document,
    relations: document.relations.map((relation) =>
      normalizePublicRelation(relation, worldId)
    )
  };
}
