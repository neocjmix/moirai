import { createHash } from "node:crypto";
import type { PublicationManifest, PublicWorld } from "@moirai/contracts";
import { publicationSnapshots } from "@moirai/graph-query";
import { assertPublicId, readPublicationObject } from "./publication";
const cache = new Map<string, Promise<GraphRevision>>();
type GraphRevision = {
  manifest: PublicationManifest;
  world: PublicWorld;
  snapshots: ReturnType<typeof publicationSnapshots>;
};
/** Immutable query inputs shared by initial HTML, spatial filtering and detail. */
export async function readGraphRevision(
  worldId: string,
  revision: number
): Promise<GraphRevision> {
  assertPublicId(worldId);
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("invalid_graph_revision");
  const prefix = `worlds/${worldId}/revisions/${revision}/`;
  const existing = cache.get(prefix);
  if (existing) return existing;
  const promise = (async () => {
    const original = await readPublicationObject(`${prefix}manifest.json`);
    if (original.status !== 200 || !original.body)
      throw Error("graph_revision_unavailable");
    const manifest = JSON.parse(original.body) as PublicationManifest;
    if (
      manifest.world_id !== worldId ||
      manifest.served_revision !== revision ||
      manifest.completeness !== "complete"
    )
      throw Error("graph_revision_mismatch");
    const refs = manifest.documents.filter(
      (r) =>
        r.key === `${prefix}world.json` ||
        r.key.startsWith(`${prefix}canons/`) ||
        r.key.startsWith(`${prefix}subjects/`) ||
        (r.key.startsWith(prefix) &&
          (r.key.endsWith("/temporal.json") ||
            r.key.endsWith("/scope-overview.json")))
    );
    const documents = await Promise.all(
      refs.map(async (ref) => {
        const value = await readPublicationObject(ref.key);
        if (
          value.status !== 200 ||
          !value.body ||
          createHash("sha256").update(value.body).digest("hex") !== ref.sha256
        )
          throw Error("graph_source_digest_mismatch");
        return { key: ref.key, body: value.body };
      })
    );
    const worldDocument = JSON.parse(
      documents.find((d) => d.key === `${prefix}world.json`)?.body ?? "null"
    );
    if (
      worldDocument?.world?.id !== worldId ||
      worldDocument.served_revision !== revision
    )
      throw Error("graph_world_mismatch");
    return {
      manifest,
      world: worldDocument.world,
      snapshots: publicationSnapshots(original.body, documents).map(
        (snapshot) => {
          const canon = JSON.parse(
            documents.find(
              (d) => d.key === `${prefix}canons/${snapshot.canon.id}.json`
            )!.body
          );
          const graph = documents.find(
            (d) => d.key === canon.graph_scope_artifact?.key
          );
          return {
            ...snapshot,
            graphScope: graph ? JSON.parse(graph.body) : null
          };
        }
      )
    };
  })();
  cache.set(prefix, promise);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  try {
    return await promise;
  } catch (error) {
    if (cache.get(prefix) === promise) cache.delete(prefix);
    throw error;
  }
}
