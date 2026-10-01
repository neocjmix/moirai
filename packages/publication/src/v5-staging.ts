/** Inactive v5 artifact index. The v4 pointer and manifest are deliberately
 * untouched; this tree cannot be served until all read shards are complete. */
import { createHash } from "node:crypto";
import type { ObjectStore } from "./index.js";
import { renderReadSummary } from "./v5-render-index.js";
import type { CanonicalState } from "@moirai/contracts/v5";
import {
  buildV5ContentPages,
  buildV5TemporalDetailPages,
  projectV5WorldTemporal
} from "@moirai/projections";

const SMALL_FANOUT = 128;
const LARGE_FANOUT = 32;
const LARGE_INDEX_DOCUMENTS = 10_000;
const validFanout = (fanout: number) =>
  fanout === SMALL_FANOUT || fanout === LARGE_FANOUT;
const hash = (body: string) => createHash("sha256").update(body).digest("hex");

export interface V5StagedObject {
  readonly key: string;
  readonly body: string;
}

interface Ref {
  readonly key: string;
  readonly sha256: string;
  readonly first_key: string;
  readonly last_key: string;
}

interface Node {
  readonly kind: "leaf" | "branch";
  readonly world_id: string;
  readonly revision: number;
  readonly entries: readonly Ref[];
}

type Completeness =
  | "content-only"
  | "content-and-temporal-detail-only"
  | "content-temporal-and-spatial-staged"
  | "complete";
// The generic builder must never assert serving completeness; a future
// dedicated builder has to prove every read/scale/privacy invariant first.
type StagedCompleteness = Exclude<Completeness, "complete">;
const COMPLETENESS: readonly string[] = [
  "content-only",
  "content-and-temporal-detail-only",
  "content-temporal-and-spatial-staged",
  "complete"
];

export interface V5StagedArtifacts {
  readonly documents: readonly V5StagedObject[];
  readonly index: readonly V5StagedObject[];
  readonly root: V5StagedObject;
}

/** Attach a fully checked render sidecar to an already complete v5 tree.
 * No pointer is written here; the existing atomic serving path uploads and
 * authenticates these documents with the same revision root. */
export function attachV5RenderDocuments(
  state: CanonicalState,
  complete: V5StagedArtifacts,
  render: readonly {
    readonly timeSystemId: string;
    readonly manifest: V5StagedObject;
    readonly documents: readonly V5StagedObject[];
  }[]
): V5StagedArtifacts {
  verifyV5StagedIndex(complete);
  const root = JSON.parse(complete.root.body) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.completeness !== "complete" ||
    root.world_id !== state.world.id ||
    render.length !== state.timeSystems.length ||
    new Set(render.map((item) => item.timeSystemId)).size !== render.length ||
    render.some(
      (item) =>
        !state.timeSystems.some((system) => system.id === item.timeSystemId)
    )
  )
    throw Error("v5_render_system_coverage_invalid");
  const attached: V5StagedObject[] = [];
  for (const item of render) {
    const prefix = `worlds/${root.world_id}/revisions/${root.revision}/v5/render/${item.timeSystemId}/`;
    if (item.manifest.key !== `${prefix}manifest.json`)
      throw Error("v5_render_manifest_invalid");
    const manifest = JSON.parse(item.manifest.body) as {
      format?: string;
      worldId?: string;
      revision?: number;
      timeSystemId?: string;
      tiles?: {
        key: string;
        sha256: string;
        level: number;
        x: number;
        y: number;
        bucketKind?: "overflow";
      }[];
      geometry?: { key: string; sha256: string }[];
    };
    if (
      !["render-publication/1", "render-publication/2"].includes(
        manifest.format ?? ""
      ) ||
      manifest.worldId !== root.world_id ||
      manifest.revision !== root.revision ||
      manifest.timeSystemId !== item.timeSystemId ||
      !Array.isArray(manifest.tiles) ||
      !Array.isArray(manifest.geometry)
    )
      throw Error("v5_render_manifest_invalid");
    const summary =
      manifest.format === "render-publication/2"
        ? renderReadSummary(manifest)
        : null;
    const expected = [...manifest.tiles, ...manifest.geometry];
    const geometryRefs = new Map(
      manifest.geometry.map((ref) => [ref.key, ref.sha256])
    );
    const bodies = new Map(
      item.documents.map((document) => [document.key, document.body])
    );
    if (
      bodies.size !== item.documents.length ||
      bodies.size !== expected.length ||
      new Set(expected.map((ref) => ref.key)).size !== expected.length
    )
      throw Error("v5_render_asset_set_invalid");
    for (const ref of expected) {
      const body = bodies.get(ref.key);
      if (
        !body ||
        !ref.key.startsWith(prefix) ||
        !/^[0-9a-f]{64}$/.test(ref.sha256) ||
        hash(body) !== ref.sha256
      )
        throw Error("v5_render_asset_digest_invalid");
      const document = JSON.parse(body) as {
        format?: string;
        worldId?: string;
        revision?: number;
        timeSystemId?: string;
      };
      if (
        document.worldId !== root.world_id ||
        document.revision !== root.revision ||
        document.timeSystemId !== item.timeSystemId ||
        document.format !==
          (ref.key.includes("/geometry/")
            ? "render-geometry/1"
            : manifest.format === "render-publication/2"
              ? "render-tile/2"
              : "render-tile/1")
      )
        throw Error("v5_render_asset_identity_invalid");
      if (!ref.key.includes("/geometry/")) {
        const tileRef = ref as (typeof manifest.tiles)[number];
        const tile = document as typeof document & {
          level?: number;
          x?: number;
          y?: number;
          bucketKind?: "overflow";
          primitives?: {
            geometry?: { kind?: string; key?: string; sha256?: string };
          }[];
        };
        if (
          !Number.isInteger(tileRef.level) ||
          tileRef.level < (summary?.spatialFrame.minLevel ?? 0) ||
          tileRef.level > (summary?.maxLevel ?? 16) ||
          (tileRef.bucketKind !== undefined &&
            tileRef.bucketKind !== "overflow") ||
          (tileRef.bucketKind === "overflow" &&
            (!summary || !summary.overflowLevels.includes(tileRef.level))) ||
          !Number.isSafeInteger(tileRef.x) ||
          !Number.isSafeInteger(tileRef.y) ||
          (manifest.format === "render-publication/1" &&
            (tileRef.level > 16 ||
              tileRef.x < 0 ||
              tileRef.y < 0 ||
              tileRef.x >= 2 ** tileRef.level ||
              tileRef.y >= 2 ** tileRef.level)) ||
          ref.key !==
            `${prefix}${tileRef.bucketKind === "overflow" ? "overflow/" : ""}${tileRef.level}/${tileRef.x}/${tileRef.y}.json` ||
          tile.bucketKind !== tileRef.bucketKind ||
          tile.level !== tileRef.level ||
          tile.x !== tileRef.x ||
          tile.y !== tileRef.y ||
          !Array.isArray(tile.primitives) ||
          tile.primitives.some(
            (primitive) =>
              primitive.geometry?.kind === "external" &&
              (!primitive.geometry.key ||
                geometryRefs.get(primitive.geometry.key) !==
                  primitive.geometry.sha256)
          )
        )
          throw Error("v5_render_tile_reference_invalid");
      }
    }
    attached.push(item.manifest, ...item.documents);
    if (manifest.format === "render-publication/2")
      attached.push({
        key: `${prefix}viewport.json`,
        body: JSON.stringify({
          ...summary!,
          worldId: root.world_id,
          revision: root.revision,
          timeSystemId: item.timeSystemId
        })
      });
  }
  const result = buildV5Index(
    root.world_id,
    root.revision,
    [...complete.documents, ...attached],
    "complete"
  );
  verifyV5StagedIndex(result);
  return result;
}

/** Internal finalization primitive. Only the graph-presentation producer may
 * call this after exhausting its canonical selection/viewport proof. It does
 * not upload objects or change the serving pointer. */
export function finalizeV5VerifiedSpatialArtifacts(
  state: CanonicalState,
  staged: V5StagedArtifacts
): V5StagedArtifacts {
  verifyV5StagedIndex(staged);
  const root = JSON.parse(staged.root.body) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (root.completeness !== "content-temporal-and-spatial-staged")
    throw Error("v5_complete_spatial_proof_required");
  if (root.world_id !== state.world.id)
    throw Error("v5_complete_world_invalid");
  const prefix = `worlds/${root.world_id}/revisions/${root.revision}/v5/`;
  const documents = new Map(
    staged.documents.map(({ key, body }) => [key, body])
  );
  const temporal = projectV5WorldTemporal(state, root.revision);
  const expectedPages = [
    ...buildV5ContentPages(state, root.revision),
    ...buildV5TemporalDetailPages(temporal)
  ];
  const expectedKeys = new Set(expectedPages.map((page) => page.key));
  for (const { key, value } of expectedPages) {
    if (documents.get(key) !== JSON.stringify(value))
      throw Error("v5_complete_content_invalid");
  }
  const eventIds = new Set(state.events.map((event) => event.id));
  const titles = new Map(state.events.map((event) => [event.id, event.title]));
  const memberships = new Map<string, string[]>();
  for (const member of state.eventCollectionMemberships) {
    const ids = memberships.get(member.event_id) ?? [];
    ids.push(member.collection_id);
    memberships.set(member.event_id, ids);
  }
  for (const ids of memberships.values()) ids.sort();
  for (const system of state.timeSystems) {
    const spatialPrefix = `${prefix}spatial/${system.id}/`;
    const manifest = JSON.parse(
      documents.get(`${spatialPrefix}manifest.json`) ?? "null"
    ) as {
      temporal_digest?: string;
      shape_count?: number;
      unplaced_count?: number;
    } | null;
    const seen = new Set<string>();
    for (const { key, body } of staged.documents) {
      if (!key.startsWith(`${spatialPrefix}nodes/0/`)) continue;
      const leaf = JSON.parse(body) as {
        kind: string;
        entries: {
          shape: {
            event_id: string;
            read_hint?: { title: string; collection_ids?: string[] };
          };
        }[];
      };
      if (leaf.kind !== "leaf" || !Array.isArray(leaf.entries))
        throw Error("v5_complete_spatial_invalid");
      for (const entry of leaf.entries) {
        if (
          !eventIds.has(entry.shape?.event_id) ||
          seen.has(entry.shape.event_id)
        )
          throw Error("v5_complete_spatial_invalid");
        const hint = entry.shape.read_hint;
        if (hint !== undefined) {
          const ids = memberships.get(entry.shape.event_id) ?? [];
          if (
            hint.title !== titles.get(entry.shape.event_id) ||
            (hint.collection_ids !== undefined &&
              (ids.length > 8 ||
                JSON.stringify(hint.collection_ids) !== JSON.stringify(ids)))
          )
            throw Error("v5_complete_spatial_hint_invalid");
        }
        seen.add(entry.shape.event_id);
      }
    }
    if (
      manifest?.temporal_digest !== temporal.semantic_digest ||
      manifest.shape_count !== seen.size ||
      seen.size + (manifest.unplaced_count ?? -1) !== eventIds.size
    )
      throw Error("v5_complete_spatial_invalid");
  }
  const expectedSpatial = new Set(state.timeSystems.map((system) => system.id));
  if (
    staged.documents.some((item) => {
      if (!item.key.startsWith(`${prefix}spatial/`))
        return !expectedKeys.has(item.key);
      return !expectedSpatial.has(
        item.key.slice(`${prefix}spatial/`.length).split("/")[0]!
      );
    })
  )
    throw Error("v5_complete_spatial_invalid");
  const complete = buildV5Index(
    root.world_id,
    root.revision,
    staged.documents,
    "complete"
  );
  verifyV5StagedIndex(complete);
  return complete;
}

/** Writes a verified immutable rehearsal tree. It never publishes current.json:
 * content-and-temporal-detail-only cannot yet serve a complete viewport. */
export async function publishV5StagedArtifacts(
  store: ObjectStore,
  artifacts: V5StagedArtifacts,
  assertActive?: () => Promise<void>
): Promise<string> {
  verifyV5StagedIndex(artifacts);
  const count = artifacts.documents.length + artifacts.index.length;
  const write = async ({ key, body }: { key: string; body: string }) => {
    const written = await store.put(key, body, { immutable: true });
    if (written.status === 412) {
      const existing = await store.get(key);
      if (existing.status !== 200 || existing.body !== body)
        throw Error("v5_immutable_conflict");
    } else if (written.status !== 200 && written.status !== 201) {
      throw Error("v5_immutable_write_failed");
    }
  };
  // Small bounded batches hide per-object request latency without buffering a
  // second World or leaving writes running after a rejected publication.
  for (let offset = 0; offset < count; offset += 8) {
    if (offset % 1024 === 0) await assertActive?.();
    const batch = Array.from(
      { length: Math.min(8, count - offset) },
      (_, item) => {
        const i = offset + item;
        return write(
          i < artifacts.documents.length
            ? artifacts.documents[i]!
            : artifacts.index[i - artifacts.documents.length]!
        );
      }
    );
    const results = await Promise.allSettled(batch);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
  await assertActive?.();
  await write(artifacts.root);
  return artifacts.root.key;
}

/** The only current producer: validated v5 content, not a served Publication. */
export function buildV5ContentStagedArtifacts(
  state: Parameters<typeof buildV5ContentPages>[0],
  revision: number
): V5StagedArtifacts {
  return buildV5StagedIndex(
    state.world.id,
    revision,
    buildV5ContentPages(state, revision).map(({ key, value }) => ({
      key,
      body: JSON.stringify(value)
    }))
  );
}

/** The temporal truth is World-wide, regardless of Collection visibility.
 * This still cannot serve a viewport without spatial/scale indexes. */
export function buildV5ContentAndTemporalStagedArtifacts(
  state: Parameters<typeof buildV5ContentPages>[0],
  revision: number
): V5StagedArtifacts {
  const documents = [
    ...buildV5ContentPages(state, revision),
    ...buildV5TemporalDetailPages(projectV5WorldTemporal(state, revision))
  ];
  return buildV5StagedIndex(
    state.world.id,
    revision,
    documents.map(({ key, value }) => ({ key, body: JSON.stringify(value) })),
    "content-and-temporal-detail-only"
  );
}

/** Offline composition seam: the presentation package produces spatial
 * documents, while Publication owns the sole immutable digest tree. A
 * complete serving pointer still requires scale/query and privacy gates. */
export function buildV5SpatialStagedArtifacts(
  state: Parameters<typeof buildV5ContentPages>[0],
  revision: number,
  spatial: readonly {
    readonly time_system_id: string;
    readonly temporal_digest: string;
    readonly documents: readonly V5StagedObject[];
    readonly manifest: V5StagedObject;
  }[]
): V5StagedArtifacts {
  const temporal = projectV5WorldTemporal(state, revision);
  const systems = state.timeSystems.map((system) => system.id).sort();
  if (
    JSON.stringify(spatial.map((item) => item.time_system_id).sort()) !==
      JSON.stringify(systems) ||
    new Set(spatial.map((item) => item.time_system_id)).size !== systems.length
  )
    throw Error("v5_spatial_system_coverage_invalid");
  for (const item of spatial) {
    const prefix = `worlds/${state.world.id}/revisions/${revision}/v5/spatial/${item.time_system_id}/`;
    const manifest = JSON.parse(item.manifest.body) as {
      format_version: string;
      world_id: string;
      revision: number;
      time_system_id: string;
      temporal_digest: string;
      shape_count: number;
      unplaced_count: number;
    };
    if (
      !systems.includes(item.time_system_id) ||
      item.temporal_digest !== temporal.semantic_digest ||
      item.manifest.key !== `${prefix}manifest.json` ||
      manifest.format_version !== "v5-world-spatial/1" ||
      manifest.world_id !== state.world.id ||
      manifest.revision !== revision ||
      manifest.time_system_id !== item.time_system_id ||
      manifest.temporal_digest !== temporal.semantic_digest ||
      !Number.isSafeInteger(manifest.shape_count) ||
      !Number.isSafeInteger(manifest.unplaced_count) ||
      manifest.shape_count + manifest.unplaced_count !== state.events.length ||
      item.documents.some(
        (document) => !document.key.startsWith(`${prefix}nodes/`)
      )
    )
      throw Error("v5_spatial_manifest_invalid");
  }
  const pages = [
    ...buildV5ContentPages(state, revision),
    ...buildV5TemporalDetailPages(temporal)
  ].map(({ key, value }) => ({ key, body: JSON.stringify(value) }));
  return buildV5StagedIndex(
    state.world.id,
    revision,
    [
      ...pages,
      ...spatial.flatMap((item) => [...item.documents, item.manifest])
    ],
    "content-temporal-and-spatial-staged"
  );
}

/** Root and every branch have bounded fanout. Leaf refs cover all documents,
 * including details and adjacency pages, without putting their keys in root. */
export function buildV5StagedIndex(
  worldId: string,
  revision: number,
  input: readonly V5StagedObject[],
  completeness: StagedCompleteness = "content-only"
): V5StagedArtifacts {
  return buildV5Index(worldId, revision, input, completeness);
}

function buildV5Index(
  worldId: string,
  revision: number,
  input: readonly V5StagedObject[],
  completeness: Completeness
): V5StagedArtifacts {
  if (
    !/^[a-zA-Z0-9-]+$/.test(worldId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw Error("v5_index_identity_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/`;
  const stagingPrefix =
    completeness === "complete"
      ? `${prefix}complete/`
      : `${prefix}staging/${completeness}/`;
  // Use the same ordinal ordering as range checks and object-store keys;
  // locale collation can order uppercase/punctuation differently.
  const documents = [...input].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
  // Shallow pages serve small Worlds cheaply. Narrow pages keep the extra
  // branch levels of a large World within the same local read-byte budget.
  const fanout =
    documents.length > LARGE_INDEX_DOCUMENTS ? LARGE_FANOUT : SMALL_FANOUT;
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i]!;
    if (
      !document.key.startsWith(prefix) ||
      document.key.startsWith(`${prefix}index/`) ||
      document.key.startsWith(`${prefix}staging/`) ||
      document.key.startsWith(`${prefix}complete/`) ||
      document.key === `${prefix}manifest.json` ||
      (i > 0 && documents[i - 1]!.key === document.key)
    )
      throw Error("v5_index_document_invalid");
  }
  const index: V5StagedObject[] = [];
  let level = 0;
  let refs: Ref[] = documents.map(({ key, body }) => ({
    key,
    sha256: hash(body),
    first_key: key,
    last_key: key
  }));
  do {
    const next: Ref[] = [];
    for (
      let offset = 0;
      offset < refs.length || offset === 0;
      offset += fanout
    ) {
      const key = `${stagingPrefix}index/${level}/${next.length}.json`;
      const node: Node = {
        kind: level === 0 ? "leaf" : "branch",
        world_id: worldId,
        revision,
        entries: refs.slice(offset, offset + fanout)
      };
      const body = JSON.stringify(node);
      index.push({ key, body });
      next.push({
        key,
        sha256: hash(body),
        first_key: node.entries[0]?.first_key ?? "",
        last_key: node.entries.at(-1)?.last_key ?? ""
      });
    }
    refs = next;
    level++;
  } while (refs.length > fanout);
  const root = {
    key: `${stagingPrefix}manifest.json`,
    body: JSON.stringify({
      format_version: "v5-staging-index/1",
      world_id: worldId,
      revision,
      completeness,
      fanout,
      document_count: documents.length,
      index_depth: level,
      entries: refs
    })
  };
  return { documents, index, root };
}

function select(entries: readonly Ref[], key: string): Ref | undefined {
  return entries.find(
    (entry) => entry.first_key <= key && key <= entry.last_key
  );
}

/** A bounded lookup seam for the eventual v5 reader. The root must first be
 * authenticated by a complete Publication pointer; this function never
 * changes the active v4 pointer or fetches unselected branches. */
export async function readV5StagedDocument(
  rootBody: string,
  documentKey: string,
  get: (key: string) => Promise<string | null>
): Promise<string | null> {
  const root = JSON.parse(rootBody) as {
    format_version: string;
    world_id: string;
    revision: number;
    completeness: string;
    fanout: number;
    index_depth: number;
    entries: Ref[];
  };
  const prefix = `worlds/${root.world_id}/revisions/${root.revision}/v5/`;
  const indexPrefix = `${prefix}${root.completeness === "complete" ? "complete/" : `staging/${root.completeness}/`}index/`;
  if (
    !documentKey.startsWith(prefix) ||
    root.format_version !== "v5-staging-index/1" ||
    !COMPLETENESS.includes(root.completeness) ||
    !validFanout(root.fanout) ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.entries.length > root.fanout ||
    !orderedRanges(root.entries)
  )
    throw Error("v5_index_lookup_invalid");
  let refs: readonly Ref[] = root.entries;
  for (let level = root.index_depth - 1; level >= 0; level--) {
    const selected = select(refs, documentKey);
    if (!selected) return null;
    if (!selected.key.startsWith(`${indexPrefix}${level}/`))
      throw Error("v5_index_depth_invalid");
    const body = await get(selected.key);
    if (body === null || hash(body) !== selected.sha256)
      throw Error("v5_index_digest_mismatch");
    const node = JSON.parse(body) as Node;
    if (
      node.world_id !== root.world_id ||
      node.revision !== root.revision ||
      node.kind !== (level === 0 ? "leaf" : "branch") ||
      node.entries.length > root.fanout ||
      !orderedRanges(node.entries) ||
      selected.first_key !== (node.entries[0]?.first_key ?? "") ||
      selected.last_key !== (node.entries.at(-1)?.last_key ?? "")
    )
      throw Error("v5_index_node_invalid");
    refs = node.entries;
  }
  const selected = select(refs, documentKey);
  if (!selected || selected.key !== documentKey) return null;
  const body = await get(selected.key);
  if (body === null || hash(body) !== selected.sha256)
    throw Error("v5_index_digest_mismatch");
  return body;
}

function orderedRanges(entries: readonly Ref[]): boolean {
  return entries.every(
    (entry, index) =>
      entry.first_key <= entry.last_key &&
      (index === 0 || entries[index - 1]!.last_key < entry.first_key)
  );
}

/** Offline integrity check, not a public reader. It traverses every branch
 * and refuses missing, extra, cross-revision or modified content. */
export function verifyV5StagedIndex(artifacts: V5StagedArtifacts): void {
  const root = JSON.parse(artifacts.root.body) as {
    format_version: string;
    world_id: string;
    revision: number;
    completeness: string;
    fanout: number;
    document_count: number;
    index_depth: number;
    entries: Ref[];
  };
  const prefix = `worlds/${root.world_id}/revisions/${root.revision}/v5/`;
  const namespace =
    root.completeness === "complete"
      ? "complete/"
      : `staging/${root.completeness}/`;
  const indexPrefix = `${prefix}${namespace}index/`;
  const rootKey = `${prefix}${namespace}manifest.json`;
  if (
    root.format_version !== "v5-staging-index/1" ||
    !COMPLETENESS.includes(root.completeness) ||
    !validFanout(root.fanout) ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.entries.length > root.fanout ||
    !orderedRanges(root.entries) ||
    artifacts.root.key !== rootKey
  )
    throw Error("v5_index_root_invalid");
  const objects = new Map(
    [...artifacts.documents, ...artifacts.index].map((object) => [
      object.key,
      object.body
    ])
  );
  if (objects.size !== artifacts.documents.length + artifacts.index.length)
    throw Error("v5_index_duplicate_object");
  const visited = new Set<string>();
  const checkedDocuments = new Set<string>();
  const visit = (ref: Ref, level: number): void => {
    if (!ref.key.startsWith(prefix) || visited.has(ref.key))
      throw Error("v5_index_reference_invalid");
    if (level === -1 && (ref.first_key !== ref.key || ref.last_key !== ref.key))
      throw Error("v5_index_range_invalid");
    const body = objects.get(ref.key);
    if (body === undefined || hash(body) !== ref.sha256)
      throw Error("v5_index_digest_mismatch");
    visited.add(ref.key);
    if (!ref.key.startsWith(indexPrefix)) {
      if (level !== -1) throw Error("v5_index_depth_invalid");
      checkedDocuments.add(ref.key);
      return;
    }
    if (!ref.key.startsWith(`${indexPrefix}${level}/`) || level < 0)
      throw Error("v5_index_depth_invalid");
    const node = JSON.parse(body) as Node;
    if (
      node.world_id !== root.world_id ||
      node.revision !== root.revision ||
      node.kind !== (level === 0 ? "leaf" : "branch") ||
      !["leaf", "branch"].includes(node.kind) ||
      node.entries.length > root.fanout ||
      !orderedRanges(node.entries) ||
      ref.first_key !== (node.entries[0]?.first_key ?? "") ||
      ref.last_key !== (node.entries.at(-1)?.last_key ?? "") ||
      (node.kind === "leaf" &&
        node.entries.some((entry) => entry.key.startsWith(indexPrefix))) ||
      (node.kind === "branch" &&
        node.entries.some((entry) => !entry.key.startsWith(indexPrefix)))
    )
      throw Error("v5_index_node_invalid");
    for (const entry of node.entries) visit(entry, level - 1);
  };
  for (const entry of root.entries) visit(entry, root.index_depth - 1);
  if (
    checkedDocuments.size !== root.document_count ||
    visited.size !== objects.size
  )
    throw Error("v5_index_incomplete");
}
