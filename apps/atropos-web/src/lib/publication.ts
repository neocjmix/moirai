import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
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
    if (
      process.env.LOCAL_PUBLICATION_FIXTURE_DIR &&
      key.startsWith(`worlds/${TEMPORAL_EXPRESSIVENESS_WORLD_ID}/`)
    ) {
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
  subjectArtifacts: readonly PublicSubjectArtifactReference[];
  temporalArtifact: { key: string; algorithm_version: string };
  graphScopeArtifact: {
    key: string;
    algorithm_version: string;
    scope: "canon";
    lod: "overview";
  };
}> {
  assertPublicId(canonId);
  const { pointer } = selected ?? (await selectPublication(worldId));
  const document = await readJson<{
    canon: PublicCanon;
    events: readonly PublicEvent[];
    narratives: readonly PublicNarrative[];
    subject_artifacts?: readonly PublicSubjectArtifactReference[];
    temporal_artifact: { key: string; algorithm_version: string };
    graph_scope_artifact: {
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
    events: document.events,
    narratives: document.narratives,
    subjectArtifacts: document.subject_artifacts ?? [],
    temporalArtifact: document.temporal_artifact,
    graphScopeArtifact: document.graph_scope_artifact
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

export async function readEvent(
  worldId: string,
  canonId: string,
  eventId: string,
  selected?: SelectedPublication
): Promise<{
  pointer: PublicationPointer;
  event: PublicEvent;
  narratives: readonly PublicNarrative[];
  relations: readonly PublicRelation[];
  relatedEvents: readonly PublicEvent[];
}> {
  assertPublicId(canonId);
  assertPublicId(eventId);
  const publication = selected ?? (await selectPublication(worldId));
  const { pointer } = publication;
  const document = await readJson<{
    event: PublicEvent;
    narratives: readonly PublicNarrative[];
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
    PublicRelationalTemporalProjection & { served_revision: number }
  >(reference.key);
  if (
    document.world_id !== worldId ||
    document.canon_id !== canonId ||
    document.source_revision !== revision ||
    document.served_revision !== revision ||
    document.algorithm_version !== reference.algorithm_version
  )
    throw new Error("mixed Publication revisions");
  return document;
}
