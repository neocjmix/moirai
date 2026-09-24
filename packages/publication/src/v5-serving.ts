/** A complete v5 pointer authenticator. The staged artifact builder cannot
 * produce `complete`, so no current public v5 data can enter this path yet. */
import { createHash } from "node:crypto";
import type { V5PublicationPointer } from "@moirai/contracts/v5";
import type { ObjectStore } from "./index.js";

export async function readV5ServedRoot(
  store: Pick<ObjectStore, "get">,
  worldId: string
): Promise<{ pointer: V5PublicationPointer; rootBody: string }> {
  if (!/^[a-zA-Z0-9-]+$/.test(worldId))
    throw Error("v5_publication_world_invalid");
  const pointerRead = await store.get(`worlds/${worldId}/current.json`);
  if (pointerRead.status !== 200 || !pointerRead.body)
    throw Error("v5_publication_pointer_unavailable");
  const pointer = JSON.parse(pointerRead.body) as V5PublicationPointer;
  const rootKey = `worlds/${worldId}/revisions/${pointer.served_revision}/v5/complete/manifest.json`;
  if (
    pointer.format_version !== "v5-publication/1" ||
    pointer.world_id !== worldId ||
    !Number.isSafeInteger(pointer.served_revision) ||
    pointer.served_revision < 1 ||
    pointer.current_revision !== pointer.served_revision ||
    pointer.publication_target_revision !== pointer.served_revision ||
    pointer.projection_status !== "ready" ||
    pointer.manifest_key !== rootKey ||
    !/^[0-9a-f]{64}$/.test(pointer.manifest_sha256) ||
    !Number.isFinite(Date.parse(pointer.generated_at))
  )
    throw Error("v5_publication_pointer_invalid");
  const rootRead = await store.get(rootKey);
  if (rootRead.status !== 200 || !rootRead.body)
    throw Error("v5_publication_root_unavailable");
  if (
    createHash("sha256").update(rootRead.body).digest("hex") !==
    pointer.manifest_sha256
  )
    throw Error("v5_publication_root_digest_mismatch");
  const root = JSON.parse(rootRead.body) as {
    format_version: string;
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.format_version !== "v5-staging-index/1" ||
    root.world_id !== worldId ||
    root.revision !== pointer.served_revision ||
    root.completeness !== "complete"
  )
    throw Error("v5_publication_incomplete");
  return { pointer, rootBody: rootRead.body };
}
