import type { CanonicalState } from "@moirai/contracts/v5";
import type { ObjectStore } from "@moirai/publication";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import type { LayoutSelection } from "@moirai/graph-presentation/layout-engine";
import {
  buildV5RenderGeneration,
  publishV5RenderGeneration,
  readV5RenderGeneration,
  readV5ServedRoot
} from "@moirai/publication/v5";

type Document = Readonly<{ key: string; body: string }>;

/** Exact served Revision only. Canonical Publication objects and pointer are untouched. */
export async function backfillV5RenderGeneration(input: {
  state: CanonicalState;
  revision: number;
  store: ObjectStore;
  layoutSelection?: LayoutSelection;
  rollbackSnapshotKey?: string;
}): Promise<{ generation: string; documentCount: number; bytes: number }> {
  const { state, revision, store } = input;
  const { pointer } = await readV5ServedRoot(store, state.world.id);
  if (pointer.served_revision !== revision || !state.timeSystems.length)
    throw Error("render_backfill_revision_mismatch");
  const { artifacts } = await buildV5WorldCompleteArtifacts(
    state,
    revision,
    undefined,
    {
      renderPublication: true,
      ...(input.layoutSelection
        ? { layoutSelection: input.layoutSelection }
        : {})
    }
  );
  const render = state.timeSystems.map((system) => {
    const prefix = `worlds/${state.world.id}/revisions/${revision}/v5/render/${system.id}/`;
    const documents = artifacts.documents.filter((doc) =>
      doc.key.startsWith(prefix)
    );
    const manifestKey = `${prefix}manifest.json`;
    const manifest = documents.find((doc) => doc.key === manifestKey);
    if (!manifest) throw Error("render_backfill_manifest_missing");
    return {
      timeSystemId: system.id,
      manifest,
      documents: documents.filter(
        (doc) => doc.key !== manifestKey && doc.key !== `${prefix}viewport.json`
      )
    };
  });
  const generation = buildV5RenderGeneration({
    worldId: state.world.id,
    revision,
    sourceRootSha256: pointer.manifest_sha256,
    render
  });
  // Keep the first prior pointer for this explicit operator run. Never write
  // any canonical object; the immutable backup also pins the source digest.
  if (input.rollbackSnapshotKey) {
    if (
      !input.rollbackSnapshotKey.startsWith(
        `worlds/${state.world.id}/render-rollbacks/`
      ) ||
      !/^[a-zA-Z0-9/._-]+$/.test(input.rollbackSnapshotKey) ||
      input.rollbackSnapshotKey.includes("..")
    )
      throw Error("render_rollback_key_invalid");
    const key = input.rollbackSnapshotKey;
    const saved = await store.get(key);
    if (saved.status === 404) {
      const prior = await store.get(
        `worlds/${state.world.id}/render-current.json`
      );
      if (![200, 404].includes(prior.status))
        throw Error("render_rollback_pointer_unavailable");
      const body = JSON.stringify({
        format: "render-rollout-rollback/1",
        worldId: state.world.id,
        revision,
        sourceRootSha256: pointer.manifest_sha256,
        expectedGeneration: generation.generation,
        previousPointer: prior.status === 200 ? JSON.parse(prior.body!) : null
      });
      const written = await store.put(key, body, { immutable: true });
      if (![200, 201].includes(written.status))
        throw Error("render_rollback_backup_failed");
    } else if (saved.status === 200 && saved.body) {
      const backup = JSON.parse(saved.body);
      if (
        backup.format !== "render-rollout-rollback/1" ||
        backup.worldId !== state.world.id ||
        backup.revision !== revision ||
        backup.sourceRootSha256 !== pointer.manifest_sha256 ||
        backup.expectedGeneration !== generation.generation
      )
        throw Error("render_rollback_backup_conflict");
    } else throw Error("render_rollback_backup_unavailable");
  }
  await publishV5RenderGeneration(store, generation);
  const published = await readV5RenderGeneration(store, state.world.id);
  if (
    published.generation !== generation.generation ||
    published.manifests.length !== state.timeSystems.length
  )
    throw Error("render_backfill_readback_mismatch");
  for (const item of published.manifests)
    await published.read(item.key, item.sha256);
  return {
    generation: generation.generation,
    documentCount: generation.documents.length + 1,
    bytes: [...generation.documents, generation.root].reduce(
      (sum, doc: Document) => sum + Buffer.byteLength(doc.body),
      0
    )
  };
}
