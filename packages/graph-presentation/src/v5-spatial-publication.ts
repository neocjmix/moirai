/** Offline composition at the permitted presentation -> Publication boundary. */
import type { CanonicalState } from "@moirai/contracts/v5";
import { createHash } from "node:crypto";
import { projectV5WorldTemporal } from "@moirai/projections";
import {
  buildV5SpatialStagedArtifacts,
  readV5StagedDocument
} from "@moirai/publication/v5";
import type { V5StagedArtifacts } from "@moirai/publication/v5";
import { buildV5WorldLayout } from "./v5-world-layout.js";
import { buildV5SpatialIndex } from "./v5-spatial-index.js";
import {
  readV5WorldViewport,
  type V5ViewportCursor
} from "./v5-spatial-read.js";

export function buildV5WorldSpatialStagedArtifacts(
  state: CanonicalState,
  revision: number
): V5StagedArtifacts {
  const temporal = projectV5WorldTemporal(state, revision);
  return buildV5SpatialStagedArtifacts(
    state,
    revision,
    [...state.timeSystems]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((system) => {
        const layout = buildV5WorldLayout(state, temporal, system.id);
        return {
          time_system_id: system.id,
          temporal_digest: temporal.semantic_digest,
          ...buildV5SpatialIndex(layout)
        };
      })
  );
}

/** The root must itself be authenticated by a future serving pointer. Each
 * node is fetched via the outer digest index; stop before the object budget. */
export async function readV5AuthenticatedViewport(
  rootBody: string,
  worldId: string,
  revision: number,
  timeSystemId: string,
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  limit: number,
  cursor: V5ViewportCursor | null,
  get: (key: string) => Promise<string | null>,
  spatialObjectReserve = 208
) {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
    index_depth: number;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    root.completeness !== "content-temporal-and-spatial-staged" ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.index_depth > 8 ||
    !Number.isSafeInteger(spatialObjectReserve) ||
    spatialObjectReserve < 16 ||
    spatialObjectReserve > 208 ||
    !/^[a-zA-Z0-9-]+$/.test(timeSystemId)
  )
    throw Error("v5_viewport_root_invalid");
  const manifestKey = `worlds/${worldId}/revisions/${revision}/v5/spatial/${timeSystemId}/manifest.json`;
  let objectReads = 0;
  const measuredGet = async (key: string) => {
    objectReads++;
    if (objectReads > 256) throw Error("v5_viewport_object_budget_exceeded");
    return get(key);
  };
  const manifest = await readV5StagedDocument(
    rootBody,
    manifestKey,
    measuredGet
  );
  if (manifest === null) throw Error("v5_viewport_manifest_missing");
  // Reserve the outer index traversal for each spatial node and future
  // selected-content checks; this is a cap, not a latency SLO assertion.
  const maxNodes = Math.min(
    48,
    Math.floor(spatialObjectReserve / (root.index_depth + 1)) - 1
  );
  const result = await readV5WorldViewport(
    manifest,
    viewport,
    limit,
    cursor,
    (key) => readV5StagedDocument(rootBody, key, measuredGet),
    maxNodes
  );
  return { ...result, object_reads: objectReads };
}

export interface V5SelectedViewportCursor {
  readonly selection_digest: string;
  readonly spatial: V5ViewportCursor;
}

/** Exact selection against inverse membership postings. Work is bounded by
 * raw spatial candidates, not by full World/Collection cardinality. An empty
 * result with a continuation means this spatial page had no selected Events. */
export async function readV5SelectedViewport(
  rootBody: string,
  worldId: string,
  revision: number,
  timeSystemId: string,
  viewport: { minX: number; maxX: number; minY: number; maxY: number },
  collectionIds: readonly string[],
  cursor: V5SelectedViewportCursor | null,
  get: (key: string) => Promise<string | null>
) {
  const root = JSON.parse(rootBody) as { index_depth: number };
  if (
    collectionIds.length > 8 ||
    collectionIds.some(
      (id, index) =>
        !/^[a-zA-Z0-9-]+$/.test(id) ||
        (index > 0 && collectionIds[index - 1]! >= id)
    )
  )
    throw Error("v5_viewport_selection_invalid");
  const digest = createHash("sha256")
    .update(JSON.stringify([rootBody, timeSystemId, viewport, collectionIds]))
    .digest("hex");
  if (cursor && (cursor.selection_digest !== digest || !cursor.spatial))
    throw Error("v5_viewport_selection_cursor_invalid");
  if (collectionIds.length === 0)
    return { shapes: [], next_cursor: null, object_reads: 0 };
  const perLookup = root.index_depth + 1;
  const rawLimit = Math.max(
    1,
    Math.min(4, Math.floor(80 / (collectionIds.length * perLookup)))
  );
  let reads = 0;
  const countedGet = async (key: string) => {
    reads++;
    if (reads > 256) throw Error("v5_viewport_object_budget_exceeded");
    return get(key);
  };
  for (const collectionId of collectionIds) {
    const key = `worlds/${worldId}/revisions/${revision}/v5/content/collections/${collectionId}/detail.json`;
    const body = await readV5StagedDocument(rootBody, key, countedGet);
    if (body === null) throw Error("v5_viewport_collection_missing");
    const detail = JSON.parse(body) as {
      world_id: string;
      revision: number;
      collection: { id: string; world_id: string };
    };
    if (
      detail.world_id !== worldId ||
      detail.revision !== revision ||
      detail.collection?.id !== collectionId ||
      detail.collection.world_id !== worldId
    )
      throw Error("v5_viewport_collection_invalid");
  }
  const spatial = await readV5AuthenticatedViewport(
    rootBody,
    worldId,
    revision,
    timeSystemId,
    viewport,
    rawLimit,
    cursor?.spatial ?? null,
    countedGet,
    96
  );
  const shapes: (typeof spatial.shapes)[number][] = [];
  for (const shape of spatial.shapes) {
    for (const collectionId of collectionIds) {
      const key = `worlds/${worldId}/revisions/${revision}/v5/content/event-selection/${shape.event_id}/${collectionId}.json`;
      const body = await readV5StagedDocument(rootBody, key, countedGet);
      if (body === null) continue;
      const membership = JSON.parse(body) as {
        world_id: string;
        revision: number;
        event_id: string;
        collection_id: string;
      };
      if (
        membership.world_id !== worldId ||
        membership.revision !== revision ||
        membership.event_id !== shape.event_id ||
        membership.collection_id !== collectionId
      )
        throw Error("v5_viewport_membership_invalid");
      shapes.push(shape);
      break;
    }
  }
  return {
    shapes,
    next_cursor: spatial.next_cursor
      ? { selection_digest: digest, spatial: spatial.next_cursor }
      : null,
    object_reads: reads
  };
}
