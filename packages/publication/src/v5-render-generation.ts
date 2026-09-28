import { createHash } from "node:crypto";
import type { ObjectStore } from "./index.js";
import { readV5ServedRoot } from "./v5-serving.js";

type Document = Readonly<{ key: string; body: string }>;
type RenderInput = Readonly<{
  timeSystemId: string;
  manifest: Document;
  documents: readonly Document[];
}>;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export type V5RenderGeneration = Readonly<{
  worldId: string;
  revision: number;
  sourceRootSha256: string;
  generation: string;
  root: Document;
  documents: readonly Document[];
}>;

/** Re-key a proved compiler output without modifying its canonical revision root.
 * This first generation format deliberately does not deduplicate tile payloads
 * across revisions; content-addressed reuse follows the stable-grid migration. */
export function buildV5RenderGeneration(input: {
  worldId: string;
  revision: number;
  sourceRootSha256: string;
  render: readonly RenderInput[];
}): V5RenderGeneration {
  const { worldId, revision, sourceRootSha256, render } = input;
  if (
    !/^[a-zA-Z0-9-]+$/.test(worldId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !/^[0-9a-f]{64}$/.test(sourceRootSha256) ||
    !render.length ||
    new Set(render.map((item) => item.timeSystemId)).size !== render.length
  )
    throw Error("render_generation_input_invalid");
  const source = render.flatMap((item) => [item.manifest, ...item.documents]);
  if (new Set(source.map((item) => item.key)).size !== source.length)
    throw Error("render_generation_duplicate_key");
  const generation = sha(
    JSON.stringify({
      worldId,
      revision,
      sourceRootSha256,
      source: source
        .map((item) => ({ key: item.key, sha256: sha(item.body) }))
        .sort((a, b) => a.key.localeCompare(b.key))
    })
  );
  const prefix = `worlds/${worldId}/render-generations/${generation}/`;
  const translated = new Map<string, string>();
  for (const item of render) {
    const original = `worlds/${worldId}/revisions/${revision}/v5/render/${item.timeSystemId}/`;
    if (
      !/^[a-zA-Z0-9-]+$/.test(item.timeSystemId) ||
      item.manifest.key !== `${original}manifest.json` ||
      item.documents.some((doc) => !doc.key.startsWith(original))
    )
      throw Error("render_generation_namespace_invalid");
    for (const doc of [item.manifest, ...item.documents])
      translated.set(
        doc.key,
        `${prefix}${item.timeSystemId}/${doc.key.slice(original.length)}`
      );
  }
  const documents: Document[] = [];
  const manifests: { timeSystemId: string; key: string; sha256: string }[] = [];
  for (const item of [...render].sort((a, b) =>
    a.timeSystemId.localeCompare(b.timeSystemId)
  )) {
    const parsed = JSON.parse(item.manifest.body) as {
      format: string;
      worldId: string;
      revision: number;
      timeSystemId: string;
      tiles: { key: string; sha256: string }[];
      geometry: { key: string; sha256: string }[];
      [key: string]: unknown;
    };
    if (
      parsed.format !== "render-publication/1" ||
      parsed.worldId !== worldId ||
      parsed.revision !== revision ||
      parsed.timeSystemId !== item.timeSystemId ||
      !Array.isArray(parsed.tiles) ||
      !Array.isArray(parsed.geometry)
    )
      throw Error("render_generation_manifest_invalid");
    const originals = new Map(item.documents.map((doc) => [doc.key, doc.body]));
    const refs = [...parsed.tiles, ...parsed.geometry];
    if (
      refs.length !== item.documents.length ||
      new Set(refs.map((ref) => ref.key)).size !== refs.length ||
      refs.some(
        (ref) =>
          !translated.has(ref.key) ||
          sha(originals.get(ref.key) ?? "") !== ref.sha256
      )
    )
      throw Error("render_generation_refs_invalid");
    for (const doc of item.documents) {
      const body = JSON.parse(doc.body) as {
        primitives?: { geometry?: { kind: string; key?: string } }[];
      };
      for (const primitive of body.primitives ?? []) {
        const geometry = primitive.geometry;
        if (geometry?.kind === "external") {
          const key = geometry.key && translated.get(geometry.key);
          if (!key) throw Error("render_generation_geometry_unlisted");
          geometry.key = key;
        }
      }
      const newKey = translated.get(doc.key)!;
      const newBody = JSON.stringify(body);
      documents.push({ key: newKey, body: newBody });
      const ref = refs.find((entry) => entry.key === doc.key)!;
      ref.key = newKey;
      ref.sha256 = sha(newBody);
    }
    const key = translated.get(item.manifest.key)!;
    const body = JSON.stringify(parsed);
    documents.push({ key, body });
    manifests.push({ timeSystemId: item.timeSystemId, key, sha256: sha(body) });
  }
  const root: Document = {
    key: `${prefix}index.json`,
    body: JSON.stringify({
      format: "render-generation/1",
      worldId,
      revision,
      sourceRootSha256,
      generation,
      manifests
    })
  };
  return { worldId, revision, sourceRootSha256, generation, root, documents };
}

/** Upload immutable assets first; a source-pinned CAS publishes them last. */
export async function publishV5RenderGeneration(
  store: ObjectStore,
  generation: V5RenderGeneration,
  assertActive?: () => Promise<void>
): Promise<void> {
  const before = await readV5ServedRoot(store, generation.worldId);
  if (
    before.pointer.served_revision !== generation.revision ||
    before.pointer.manifest_sha256 !== generation.sourceRootSha256
  )
    throw Error("render_generation_source_changed");
  const upload = async (doc: Document) => {
    const result = await store.put(doc.key, doc.body, { immutable: true });
    if (result.status === 412) {
      const existing = await store.get(doc.key);
      if (existing.status !== 200 || existing.body !== doc.body)
        throw Error("render_generation_immutable_conflict");
    } else if (result.status !== 200 && result.status !== 201)
      throw Error("render_generation_upload_failed");
  };
  const documents = [...generation.documents, generation.root];
  for (let offset = 0; offset < documents.length; offset += 8) {
    await assertActive?.();
    await Promise.all(documents.slice(offset, offset + 8).map(upload));
  }
  const readback = await store.get(generation.root.key);
  if (readback.status !== 200 || readback.body !== generation.root.body)
    throw Error("render_generation_readback_failed");
  const key = `worlds/${generation.worldId}/render-current.json`;
  const pointer = JSON.stringify({
    format: "render-generation-pointer/1",
    worldId: generation.worldId,
    revision: generation.revision,
    sourceRootSha256: generation.sourceRootSha256,
    generation: generation.generation,
    rootKey: generation.root.key,
    rootSha256: sha(generation.root.body)
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    await assertActive?.();
    const current = await readV5ServedRoot(store, generation.worldId);
    if (
      current.pointer.served_revision !== generation.revision ||
      current.pointer.manifest_sha256 !== generation.sourceRootSha256
    )
      throw Error("render_generation_source_changed");
    const previous = await store.get(key);
    if (![200, 404].includes(previous.status))
      throw Error("render_generation_pointer_read_failed");
    if (previous.status === 200 && previous.body === pointer) return;
    if (previous.status === 200 && (!previous.etag || !previous.body))
      throw Error("render_generation_pointer_invalid");
    const written = await store.put(
      key,
      pointer,
      previous.status === 200
        ? { ifMatch: previous.etag! }
        : { ifNoneMatch: true }
    );
    if ([200, 201].includes(written.status)) return;
    if (written.status !== 412)
      throw Error("render_generation_pointer_swap_failed");
  }
  throw Error("render_generation_pointer_contended");
}

export async function readV5RenderGeneration(
  store: Pick<ObjectStore, "get">,
  worldId: string
): Promise<{
  generation: string;
  revision: number;
  manifests: readonly { timeSystemId: string; key: string; sha256: string }[];
  read: (key: string, sha256: string) => Promise<string>;
}> {
  const served = await readV5ServedRoot(store, worldId);
  const pointerRead = await store.get(`worlds/${worldId}/render-current.json`);
  if (pointerRead.status === 404) throw Error("render_generation_unavailable");
  if (pointerRead.status !== 200 || !pointerRead.body)
    throw Error("render_generation_pointer_unavailable");
  const pointer = JSON.parse(pointerRead.body) as {
    format: string;
    worldId: string;
    revision: number;
    generation: string;
    sourceRootSha256: string;
    rootKey: string;
    rootSha256: string;
  };
  const prefix = `worlds/${worldId}/render-generations/${pointer.generation}/`;
  if (
    pointer.format !== "render-generation-pointer/1" ||
    pointer.worldId !== worldId ||
    pointer.revision !== served.pointer.served_revision ||
    pointer.sourceRootSha256 !== served.pointer.manifest_sha256 ||
    !/^[0-9a-f]{64}$/.test(pointer.generation) ||
    !/^[0-9a-f]{64}$/.test(pointer.rootSha256) ||
    pointer.rootKey !== `${prefix}index.json`
  )
    throw Error("render_generation_source_changed");
  const rootRead = await store.get(pointer.rootKey);
  if (
    rootRead.status !== 200 ||
    !rootRead.body ||
    sha(rootRead.body) !== pointer.rootSha256
  )
    throw Error("render_generation_root_invalid");
  const root = JSON.parse(rootRead.body) as {
    format: string;
    worldId: string;
    revision: number;
    generation: string;
    sourceRootSha256: string;
    manifests: { timeSystemId: string; key: string; sha256: string }[];
  };
  if (
    root.format !== "render-generation/1" ||
    root.worldId !== worldId ||
    root.revision !== pointer.revision ||
    root.generation !== pointer.generation ||
    root.sourceRootSha256 !== pointer.sourceRootSha256 ||
    !Array.isArray(root.manifests) ||
    new Set(root.manifests.map((item) => item.timeSystemId)).size !==
      root.manifests.length ||
    root.manifests.some(
      (item) =>
        !/^[a-zA-Z0-9-]+$/.test(item.timeSystemId) ||
        item.key !== `${prefix}${item.timeSystemId}/manifest.json` ||
        !/^[0-9a-f]{64}$/.test(item.sha256)
    )
  )
    throw Error("render_generation_root_invalid");
  return {
    generation: pointer.generation,
    revision: pointer.revision,
    manifests: root.manifests,
    read: async (key, digest) => {
      if (!key.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(digest))
        throw Error("render_generation_asset_unlisted");
      const value = await store.get(key);
      if (value.status !== 200 || !value.body || sha(value.body) !== digest)
        throw Error("render_generation_asset_invalid");
      return value.body;
    }
  };
}
