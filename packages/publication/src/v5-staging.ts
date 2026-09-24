/** Inactive v5 artifact index. The v4 pointer and manifest are deliberately
 * untouched; this tree cannot be served until all read shards are complete. */
import { createHash } from "node:crypto";
import type { ObjectStore } from "./index.js";
import {
  buildV5ContentPages,
  buildV5TemporalDetailPages,
  projectV5WorldTemporal
} from "@moirai/projections";

const FANOUT = 128;
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

/** Writes a verified immutable rehearsal tree. It never publishes current.json:
 * content-and-temporal-detail-only cannot yet serve a complete viewport. */
export async function publishV5StagedArtifacts(
  store: ObjectStore,
  artifacts: V5StagedArtifacts
): Promise<string> {
  verifyV5StagedIndex(artifacts);
  for (const { key, body } of [
    ...artifacts.documents,
    ...artifacts.index,
    artifacts.root
  ]) {
    const written = await store.put(key, body, { immutable: true });
    if (written.status === 412) {
      const existing = await store.get(key);
      if (existing.status !== 200 || existing.body !== body)
        throw Error("v5_immutable_conflict");
    } else if (written.status !== 200 && written.status !== 201) {
      throw Error("v5_immutable_write_failed");
    }
  }
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
  if (
    !/^[a-zA-Z0-9-]+$/.test(worldId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw Error("v5_index_identity_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/`;
  const stagingPrefix = `${prefix}staging/${completeness}/`;
  // Use the same ordinal ordering as range checks and object-store keys;
  // locale collation can order uppercase/punctuation differently.
  const documents = [...input].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
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
      offset += FANOUT
    ) {
      const key = `${stagingPrefix}index/${level}/${next.length}.json`;
      const node: Node = {
        kind: level === 0 ? "leaf" : "branch",
        world_id: worldId,
        revision,
        entries: refs.slice(offset, offset + FANOUT)
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
  } while (refs.length > FANOUT);
  const root = {
    key: `${stagingPrefix}manifest.json`,
    body: JSON.stringify({
      format_version: "v5-staging-index/1",
      world_id: worldId,
      revision,
      completeness,
      fanout: FANOUT,
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
    root.fanout !== FANOUT ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.entries.length > FANOUT ||
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
      node.entries.length > FANOUT ||
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
    root.fanout !== FANOUT ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.entries.length > FANOUT ||
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
      node.entries.length > FANOUT ||
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
