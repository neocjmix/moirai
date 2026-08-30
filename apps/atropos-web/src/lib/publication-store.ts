import {
  MILESTONE_ZERO_WORLD,
  PUBLICATION_FORMAT_VERSION,
  SCHEMA_VERSION
} from "@moirai/contracts";

import { getObject, putObject } from "./s3";

export const REVISION_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CURRENT_CACHE_CONTROL = "public, max-age=30, must-revalidate";

const WORLD_ID = MILESTONE_ZERO_WORLD.world_id;
const REVISION = MILESTONE_ZERO_WORLD.served_revision;
const PREFIX = `worlds/${WORLD_ID}/revisions/${REVISION}`;
const SNAPSHOT_KEY = `${PREFIX}/snapshot.json`;
const MANIFEST_KEY = `${PREFIX}/manifest.json`;
const CURRENT_KEY = `worlds/${WORLD_ID}/current.json`;

const snapshot = JSON.stringify({
  schema_version: SCHEMA_VERSION,
  publication_format_version: PUBLICATION_FORMAT_VERSION,
  world: MILESTONE_ZERO_WORLD
});

const manifest = JSON.stringify({
  world_id: WORLD_ID,
  revision: REVISION,
  format_version: PUBLICATION_FORMAT_VERSION,
  artifacts: [{ key: SNAPSHOT_KEY, media_type: "application/json" }]
});

const pointer = JSON.stringify({
  world_id: WORLD_ID,
  served_revision: REVISION,
  manifest_key: MANIFEST_KEY,
  format_version: PUBLICATION_FORMAT_VERSION
});

async function ensureImmutable(key: string, content: string): Promise<void> {
  const existing = await getObject(key);
  if (existing.ok) return;
  if (existing.status !== 404)
    throw new Error(`publication read failed: ${existing.status}`);

  const created = await putObject(key, content, { immutable: true });
  if (!created.ok && created.status !== 412) {
    throw new Error(`publication write failed: ${created.status}`);
  }
}

export async function rebuildSyntheticPublication(): Promise<void> {
  await ensureImmutable(SNAPSHOT_KEY, snapshot);
  await ensureImmutable(MANIFEST_KEY, manifest);

  const current = await getObject(CURRENT_KEY);
  if (current.ok && (await current.text()) === pointer) return;

  const swapped = await putObject(CURRENT_KEY, pointer);
  if (!swapped.ok) throw new Error(`pointer swap failed: ${swapped.status}`);
}

export async function readSyntheticRevision(): Promise<Response> {
  await rebuildSyntheticPublication();
  return getObject(SNAPSHOT_KEY);
}

export async function readSyntheticPointer(): Promise<Response> {
  await rebuildSyntheticPublication();
  return getObject(CURRENT_KEY);
}
