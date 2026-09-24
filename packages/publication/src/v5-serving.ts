/** A complete v5 pointer authenticator. The staged artifact builder cannot
 * produce `complete`, so no current public v5 data can enter this path yet. */
import { createHash } from "node:crypto";
import type { V5PublicationPointer } from "@moirai/contracts/v5";
import { PUBLICATION_FORMAT_VERSION } from "@moirai/contracts";
import type { ObjectStore } from "./index.js";
import {
  publishV5StagedArtifacts,
  verifyV5StagedIndex,
  type V5StagedArtifacts
} from "./v5-staging.js";

/** A3-only handoff primitive. The caller must independently pin the live DB
 * Revision and quiesce writes; A2 exercises this with an isolated fake store.
 * Immutable objects are uploaded first, then one conditional current.json
 * swap. A failed upload never changes the public pointer. */
export async function publishV5CompleteArtifacts(
  store: ObjectStore,
  artifacts: V5StagedArtifacts,
  generatedAt: string
): Promise<V5PublicationPointer> {
  verifyV5StagedIndex(artifacts);
  const root = JSON.parse(artifacts.root.body) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.completeness !== "complete" ||
    artifacts.root.key !==
      `worlds/${root.world_id}/revisions/${root.revision}/v5/complete/manifest.json` ||
    !Number.isFinite(Date.parse(generatedAt))
  )
    throw Error("v5_complete_pointer_input_invalid");
  const pointer: V5PublicationPointer = {
    format_version: "v5-publication/1",
    world_id: root.world_id,
    served_revision: root.revision,
    current_revision: root.revision,
    publication_target_revision: root.revision,
    projection_status: "ready",
    manifest_key: artifacts.root.key,
    manifest_sha256: createHash("sha256")
      .update(artifacts.root.body)
      .digest("hex"),
    generated_at: generatedAt
  };
  await publishV5StagedArtifacts(store, artifacts);
  const rootRead = await store.get(artifacts.root.key);
  if (rootRead.status !== 200 || rootRead.body !== artifacts.root.body)
    throw Error("v5_complete_root_readback_failed");
  const key = `worlds/${root.world_id}/current.json`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.get(key);
    if (![200, 404].includes(current.status))
      throw Error("v5_complete_pointer_read_failed");
    if (current.status === 200) {
      if (!current.body || !current.etag)
        throw Error("v5_complete_pointer_precondition_missing");
      const previous = JSON.parse(current.body) as {
        format_version?: string;
        world_id?: string;
        served_revision?: number;
        current_revision?: number;
        publication_target_revision?: number;
        manifest_sha256?: string;
      };
      if (
        ![PUBLICATION_FORMAT_VERSION, "v5-publication/1"].includes(
          previous.format_version ?? ""
        ) ||
        previous.world_id !== root.world_id ||
        !Number.isSafeInteger(previous.served_revision) ||
        !Number.isSafeInteger(previous.current_revision) ||
        !Number.isSafeInteger(previous.publication_target_revision) ||
        previous.current_revision! > root.revision ||
        previous.publication_target_revision! > root.revision
      )
        throw Error("v5_complete_pointer_previous_invalid");
      if (previous.served_revision! >= root.revision) {
        if (
          previous.format_version === "v5-publication/1" &&
          previous.served_revision === root.revision &&
          previous.manifest_sha256 === pointer.manifest_sha256
        )
          return pointer;
        throw Error("v5_complete_pointer_revision_conflict");
      }
    }
    const swapped = await store.put(
      key,
      JSON.stringify(pointer),
      current.status === 200
        ? { ifMatch: current.etag! }
        : { ifNoneMatch: true }
    );
    if (swapped.status === 200 || swapped.status === 201) return pointer;
    if (swapped.status !== 412) throw Error("v5_complete_pointer_swap_failed");
  }
  throw Error("v5_complete_pointer_contended");
}

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
