import { createHash } from "node:crypto";
import type {
  PublicationManifest,
  PublicationPointer
} from "@moirai/contracts";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import {
  buildSpatialArtifacts,
  publishSpatialArtifacts,
  spatialPrefix,
  type SpatialObjectStore
} from "@moirai/graph-presentation/server";

export async function publishPresentation(
  store: SpatialObjectStore,
  manifestBody: string,
  documents: readonly { key: string; body: string }[]
): Promise<void> {
  const result = queryFromPublicationDocuments(manifestBody, documents);
  if (result)
    await publishSpatialArtifacts(
      store,
      buildSpatialArtifacts(result, manifestBody)
    );
}

/** Backfill the currently served immutable Publication, never canonical tables. */
export async function backfillPresentation(
  store: SpatialObjectStore & {
    listCommonPrefixes(
      prefix: string
    ): Promise<{ prefixes: readonly string[] }>;
  }
): Promise<void> {
  const worlds = await store.listCommonPrefixes("worlds/");
  for (const world of worlds.prefixes) {
    const pointerRead = await store.get(`${world}current.json`);
    if (pointerRead.status === 404) continue;
    if (pointerRead.status !== 200 || !pointerRead.body)
      throw new Error("spatial_backfill_pointer_unavailable");
    const pointer = JSON.parse(pointerRead.body) as PublicationPointer;
    if (world !== `worlds/${pointer.world_id}/`)
      throw new Error("spatial_backfill_world_mismatch");
    const existing = await store.get(
      `${spatialPrefix(pointer.world_id, pointer.served_revision)}/manifest.json`
    );
    if (existing.status === 200) continue;
    if (existing.status !== 404)
      throw new Error("spatial_backfill_manifest_unavailable");
    const manifestRead = await store.get(pointer.manifest_key);
    if (manifestRead.status !== 200 || !manifestRead.body)
      throw new Error("spatial_backfill_publication_unavailable");
    const manifest = JSON.parse(manifestRead.body) as PublicationManifest;
    if (
      manifest.world_id !== pointer.world_id ||
      manifest.served_revision !== pointer.served_revision
    )
      throw new Error("spatial_backfill_revision_mismatch");
    const prefix = `worlds/${manifest.world_id}/revisions/${manifest.served_revision}/`;
    const documents: { key: string; body: string }[] = [];
    for (const ref of manifest.documents) {
      if (!ref.key.startsWith(prefix))
        throw new Error("spatial_backfill_cross_revision");
      // Only public Canon, temporal, and Subject inputs are required by composer.
      if (
        !ref.key.startsWith(`${prefix}canons/`) &&
        !ref.key.startsWith(`${prefix}subjects/`) &&
        !ref.key.endsWith("/temporal.json")
      )
        continue;
      const doc = await store.get(ref.key);
      if (
        doc.status !== 200 ||
        !doc.body ||
        createHash("sha256").update(doc.body).digest("hex") !== ref.sha256
      )
        throw new Error("spatial_backfill_digest_mismatch");
      documents.push({ key: ref.key, body: doc.body });
    }
    await publishPresentation(store, manifestRead.body, documents);
    process.stdout.write(
      JSON.stringify({
        level: "info",
        service: "lachesis-worker",
        operation: "spatial_backfill",
        world_id: manifest.world_id,
        revision: manifest.served_revision,
        result_code: "served"
      }) + "\n"
    );
  }
}
