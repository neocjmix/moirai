import {
  SYNTHETIC_FIXTURE,
  type PublicCanon,
  type PublicEvent,
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
  const artifacts = buildPublicationArtifacts(
    {
      world: {
        id: SYNTHETIC_FIXTURE.worldId,
        slug: "lantern-archive",
        title: SYNTHETIC_FIXTURE.worldTitle,
        description:
          "A synthetic World that proves Moirai's first publication path."
      },
      canons: [
        {
          id: SYNTHETIC_FIXTURE.canonId,
          world_id: SYNTHETIC_FIXTURE.worldId,
          slug: "ember-canon",
          title: SYNTHETIC_FIXTURE.canonTitle,
          description: "One self-contained synthetic truth context."
        }
      ],
      events: [
        {
          id: SYNTHETIC_FIXTURE.eventId,
          canon_id: SYNTHETIC_FIXTURE.canonId,
          slug: "first-lantern",
          kind: "atomic",
          title: SYNTHETIC_FIXTURE.eventTitle,
          summary: "At dusk, the archive keeper lights the first lantern.",
          roles: [],
          attributes: {}
        }
      ]
    },
    1,
    "2026-08-30T00:00:00.000Z"
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
  if (!/^[a-z0-9/._-]+$/i.test(key) || key.includes("..")) {
    throw new Error("invalid publication key");
  }
  if (!hasS3Config()) {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_SYNTHETIC_PUBLICATION_FIXTURE !== "true"
    ) {
      throw new Error("Publication Store is not configured");
    }
    const body = localObjects.get(key);
    return body
      ? { status: 200, body, etag: '"local-m1"' }
      : { status: 404, body: null, etag: null };
  }
  objectStore ??= new S3ObjectStore();
  return objectStore.get(key);
}

async function readJson<T>(key: string): Promise<T> {
  const object = await readPublicationObject(key);
  if (object.status !== 200 || object.body === null) {
    throw new Error(`publication object unavailable: ${object.status}`);
  }
  return JSON.parse(object.body) as T;
}

export async function selectPublication(worldId: string): Promise<{
  pointer: PublicationPointer;
  manifest: PublicationManifest;
}> {
  assertPublicId(worldId);
  const pointer = await readJson<PublicationPointer>(currentKey(worldId));
  if (pointer.world_id !== worldId || pointer.served_revision < 1) {
    throw new Error("invalid Publication pointer");
  }
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

export async function readWorld(worldId: string): Promise<{
  pointer: PublicationPointer;
  world: PublicWorld;
  canons: readonly PublicCanon[];
}> {
  const { pointer } = await selectPublication(worldId);
  const document = await readJson<{
    world: PublicWorld;
    canons: readonly PublicCanon[];
    served_revision: number;
  }>(`worlds/${worldId}/revisions/${pointer.served_revision}/world.json`);
  if (document.served_revision !== pointer.served_revision) {
    throw new Error("mixed Publication revisions");
  }
  return { pointer, world: document.world, canons: document.canons };
}

export async function readCanon(
  worldId: string,
  canonId: string
): Promise<{
  pointer: PublicationPointer;
  canon: PublicCanon;
  events: readonly PublicEvent[];
}> {
  assertPublicId(canonId);
  const { pointer } = await selectPublication(worldId);
  const document = await readJson<{
    canon: PublicCanon;
    events: readonly PublicEvent[];
    served_revision: number;
  }>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/canons/${canonId}.json`
  );
  if (
    document.served_revision !== pointer.served_revision ||
    document.canon.world_id !== worldId
  ) {
    throw new Error("mixed Publication revisions");
  }
  return { pointer, canon: document.canon, events: document.events };
}

export async function readEvent(
  worldId: string,
  canonId: string,
  eventId: string
): Promise<{
  pointer: PublicationPointer;
  event: PublicEvent;
}> {
  assertPublicId(canonId);
  assertPublicId(eventId);
  const { pointer } = await selectPublication(worldId);
  const document = await readJson<{
    event: PublicEvent;
    served_revision: number;
  }>(
    `worlds/${worldId}/revisions/${pointer.served_revision}/events/${eventId}.json`
  );
  if (
    document.served_revision !== pointer.served_revision ||
    document.event.canon_id !== canonId
  ) {
    throw new Error("mixed Publication revisions");
  }
  return { pointer, event: document.event };
}
