/** Offline composition at the permitted presentation -> Publication boundary. */
import type { CanonicalState } from "@moirai/contracts/v5";
import { createHash } from "node:crypto";
import { projectV5WorldTemporal } from "@moirai/projections";
import {
  buildV5SpatialStagedArtifacts,
  finalizeV5VerifiedSpatialArtifacts,
  attachV5RenderDocuments,
  verifyV5StagedIndex,
  readV5StagedDocument
} from "@moirai/publication/v5";
import type { V5StagedArtifacts } from "@moirai/publication/v5";
import { buildV5WorldLayout } from "./v5-world-layout.js";
import { compileV5RenderPublication } from "./v5-render-publication.js";
import { buildV5SpatialIndex } from "./v5-spatial-index.js";
import {
  readV5WorldViewport,
  type V5ViewportCursor
} from "./v5-spatial-read.js";

export function buildV5WorldSpatialStagedArtifacts(
  state: CanonicalState,
  revision: number
): V5StagedArtifacts {
  return buildV5WorldSpatialStagedArtifactsWithLayouts(state, revision).staged;
}

function buildV5WorldSpatialStagedArtifactsWithLayouts(
  state: CanonicalState,
  revision: number
) {
  const temporal = projectV5WorldTemporal(state, revision);
  const layouts = [...state.timeSystems]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((system) => buildV5WorldLayout(state, temporal, system.id));
  const titles = new Map(state.events.map((event) => [event.id, event.title]));
  const memberships = new Map<string, string[]>();
  for (const member of state.eventCollectionMemberships) {
    const ids = memberships.get(member.event_id) ?? [];
    ids.push(member.collection_id);
    memberships.set(member.event_id, ids);
  }
  for (const ids of memberships.values()) ids.sort();
  const staged = buildV5SpatialStagedArtifacts(
    state,
    revision,
    layouts.map((layout) => ({
      time_system_id: layout.time_system_id,
      temporal_digest: temporal.semantic_digest,
      ...buildV5SpatialIndex({
        ...layout,
        shapes: layout.shapes.map((shape) => {
          const ids = memberships.get(shape.event_id) ?? [];
          return {
            ...shape,
            read_hint: {
              title: titles.get(shape.event_id)!,
              ...(ids.length <= 8 ? { collection_ids: ids } : {})
            }
          };
        })
      })
    }))
  );
  return { staged, layouts };
}

/** An offline, pointer-free serving-tree candidate. Completion is asserted
 * only after the immutable index and every Collection × Time System viewport
 * exhaust to the exact placed canonical membership set. No current.json write
 * or production migration is performed here. */
export async function buildV5WorldCompleteArtifacts(
  state: CanonicalState,
  revision: number,
  observePhase?: (phase: string) => void,
  options?: { renderPublication?: boolean }
): Promise<{
  artifacts: V5StagedArtifacts;
  proof: {
    placed: number;
    unplaced: number;
    viewport_pages: number;
    max_object_reads: number;
  };
}> {
  const { staged, layouts } = buildV5WorldSpatialStagedArtifactsWithLayouts(
    state,
    revision
  );
  observePhase?.("staged");
  verifyV5StagedIndex(staged);
  observePhase?.("staged_verified");
  const objects = new Map(
    [...staged.documents, ...staged.index].map(({ key, body }) => [key, body])
  );
  observePhase?.("proof_objects_mapped");
  let placed = 0;
  let unplaced = 0;
  let viewportPages = 0;
  let maxObjectReads = 0;
  for (const layout of layouts) {
    const ids = new Set(layout.shapes.map((shape) => shape.event_id));
    if (
      ids.size !== layout.shapes.length ||
      ids.size + layout.unplaced_event_ids.length !== state.events.length
    )
      throw Error("v5_complete_layout_incomplete");
    placed += ids.size;
    unplaced += layout.unplaced_event_ids.length;
    const bounds = layout.shapes.reduce(
      (box, shape) => {
        const item =
          shape.kind === "point"
            ? {
                minX: shape.position.x,
                maxX: shape.position.x,
                minY: shape.position.y,
                maxY: shape.position.y
              }
            : shape.kind === "region"
              ? shape.bounds
              : {
                  minX: Math.min(shape.start.x, shape.end.x),
                  maxX: Math.max(shape.start.x, shape.end.x),
                  minY: Math.min(shape.start.y, shape.end.y),
                  maxY: Math.max(shape.start.y, shape.end.y)
                };
        return {
          minX: Math.min(box.minX, item.minX),
          maxX: Math.max(box.maxX, item.maxX),
          minY: Math.min(box.minY, item.minY),
          maxY: Math.max(box.maxY, item.maxY)
        };
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    const viewport = ids.size
      ? bounds
      : { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    for (const collection of state.collections) {
      const expected = new Set(
        state.eventCollectionMemberships
          .filter(
            (link) =>
              link.collection_id === collection.id && ids.has(link.event_id)
          )
          .map((link) => link.event_id)
      );
      const found = new Set<string>();
      let cursor: V5SelectedViewportCursor | null = null;
      let pages = 0;
      do {
        const result = await readV5SelectedViewport(
          staged.root.body,
          state.world.id,
          revision,
          layout.time_system_id,
          viewport,
          [collection.id],
          cursor,
          async (key) => objects.get(key) ?? null
        );
        maxObjectReads = Math.max(maxObjectReads, result.object_reads);
        if (result.object_reads > 256 || ++pages > state.events.length + 1)
          throw Error("v5_complete_read_unbounded");
        for (const shape of result.shapes) {
          if (found.has(shape.event_id))
            throw Error("v5_complete_duplicate_event");
          found.add(shape.event_id);
        }
        cursor = result.next_cursor;
      } while (cursor);
      viewportPages += pages;
      if (
        expected.size !== found.size ||
        [...expected].some((id) => !found.has(id))
      )
        throw Error("v5_complete_selection_drift");
    }
  }
  observePhase?.("selection_proved");
  let artifacts = finalizeV5VerifiedSpatialArtifacts(state, staged);
  observePhase?.("complete_finalized");
  if (options?.renderPublication) {
    const render = layouts.map((layout) => {
      const publication = compileV5RenderPublication(state, layout);
      const maxLevel = publication.maxLevel;
      const finest = new Set(
        publication.documents
          .filter(
            (document) =>
              publication.tiles.find((tile) => tile.key === document.key)
                ?.level === maxLevel
          )
          .flatMap(
            (document) =>
              (
                JSON.parse(document.body) as {
                  primitives: { entity: { kind: string; id: string } }[];
                }
              ).primitives
          )
          .filter(
            (primitive) =>
              primitive.entity.kind === "event" ||
              primitive.entity.kind === "composite"
          )
          .map((primitive) => primitive.entity.id)
      );
      if (
        finest.size !== layout.shapes.length ||
        layout.shapes.some((shape) => !finest.has(shape.event_id))
      )
        throw Error("v5_render_event_coverage_invalid");
      const { documents, geometryDocuments, ...manifest } = publication;
      const prefix = `worlds/${state.world.id}/revisions/${revision}/v5/render/${layout.time_system_id}`;
      return {
        timeSystemId: layout.time_system_id,
        manifest: {
          key: `${prefix}/manifest.json`,
          body: JSON.stringify(manifest)
        },
        documents: [...documents, ...geometryDocuments]
      };
    });
    artifacts = attachV5RenderDocuments(state, artifacts, render);
    observePhase?.("render_attached");
  }
  return {
    artifacts,
    proof: {
      placed,
      unplaced,
      viewport_pages: viewportPages,
      max_object_reads: maxObjectReads
    }
  };
}

/** Root-level spatial envelope for initial navigation. The manifest is
 * digest-authenticated without walking or materializing the World. */
export async function readV5SpatialSummary(
  rootBody: string,
  worldId: string,
  revision: number,
  timeSystemId: string,
  get: (key: string) => Promise<string | null>
) {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    !["content-temporal-and-spatial-staged", "complete"].includes(
      root.completeness
    ) ||
    !/^[a-zA-Z0-9-]+$/.test(timeSystemId)
  )
    throw Error("v5_spatial_summary_root_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/spatial/${timeSystemId}/`;
  const body = await readV5StagedDocument(
    rootBody,
    `${prefix}manifest.json`,
    get
  );
  if (body === null) throw Error("v5_spatial_summary_missing");
  const manifest = JSON.parse(body) as {
    format_version: string;
    world_id: string;
    revision: number;
    time_system_id: string;
    shape_count: number;
    unplaced_count: number;
    depth: number;
    fanout: number;
    entries: {
      key: string;
      bounds: { minX: number; maxX: number; minY: number; maxY: number };
    }[];
  };
  if (
    manifest.format_version !== "v5-world-spatial/1" ||
    manifest.world_id !== worldId ||
    manifest.revision !== revision ||
    manifest.time_system_id !== timeSystemId ||
    !Number.isSafeInteger(manifest.shape_count) ||
    manifest.shape_count < 0 ||
    !Number.isSafeInteger(manifest.unplaced_count) ||
    manifest.unplaced_count < 0 ||
    !Number.isSafeInteger(manifest.depth) ||
    manifest.depth < 0 ||
    manifest.depth > 8 ||
    manifest.fanout !== 128 ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length > 128 ||
    (manifest.shape_count === 0) !== (manifest.entries.length === 0) ||
    manifest.entries.some(
      (entry) =>
        !entry.key.startsWith(`${prefix}nodes/${manifest.depth}/`) ||
        ![
          entry.bounds?.minX,
          entry.bounds?.maxX,
          entry.bounds?.minY,
          entry.bounds?.maxY
        ].every(Number.isFinite) ||
        entry.bounds.minX > entry.bounds.maxX ||
        entry.bounds.minY > entry.bounds.maxY
    )
  )
    throw Error("v5_spatial_summary_invalid");
  const bounds = manifest.entries.length
    ? manifest.entries.reduce(
        (all, entry) => ({
          minX: Math.min(all.minX, entry.bounds.minX),
          maxX: Math.max(all.maxX, entry.bounds.maxX),
          minY: Math.min(all.minY, entry.bounds.minY),
          maxY: Math.max(all.maxY, entry.bounds.maxY)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      )
    : null;
  return {
    world_id: worldId,
    revision,
    time_system_id: timeSystemId,
    shape_count: manifest.shape_count,
    unplaced_count: manifest.unplaced_count,
    bounds
  };
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
    !["content-temporal-and-spatial-staged", "complete"].includes(
      root.completeness
    ) ||
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
  get: (key: string) => Promise<string | null>,
  pageSelectionSize = collectionIds.length
): Promise<{
  shapes: Awaited<ReturnType<typeof readV5AuthenticatedViewport>>["shapes"];
  next_cursor: V5SelectedViewportCursor | null;
  object_reads: number;
}> {
  const root = JSON.parse(rootBody) as { index_depth: number };
  if (
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
  // Eight is an internal work batch, never a user selection limit. Every
  // batch scans the same spatial page, so their union has one continuation
  // and one representation per World Event. Keep each batch's 256-read cap.
  if (collectionIds.length > 8) {
    const shapes = new Map<
      string,
      Awaited<ReturnType<typeof readV5AuthenticatedViewport>>["shapes"][number]
    >();
    let spatialCursor: V5ViewportCursor | null = null;
    // Immutable keys are shared only within this exact World/revision query.
    // Each inner batch still enforces its own work bound; the outer count
    // measures actual store calls rather than repeated cache lookups.
    const sharedObjects = new Map<string, Promise<string | null>>();
    const sharedGet = (key: string) => {
      const cached = sharedObjects.get(key);
      if (cached) return cached;
      const pending = get(key);
      sharedObjects.set(key, pending);
      return pending;
    };
    for (let offset = 0; offset < collectionIds.length; offset += 8) {
      const batch = collectionIds.slice(offset, offset + 8);
      const batchDigest = createHash("sha256")
        .update(JSON.stringify([rootBody, timeSystemId, viewport, batch]))
        .digest("hex");
      const result = await readV5SelectedViewport(
        rootBody,
        worldId,
        revision,
        timeSystemId,
        viewport,
        batch,
        cursor
          ? { selection_digest: batchDigest, spatial: cursor.spatial }
          : null,
        sharedGet,
        8
      );
      for (const shape of result.shapes) shapes.set(shape.event_id, shape);
      if (
        offset > 0 &&
        JSON.stringify(spatialCursor) !==
          JSON.stringify(result.next_cursor?.spatial ?? null)
      )
        throw Error("v5_viewport_batch_cursor_mismatch");
      spatialCursor = result.next_cursor?.spatial ?? null;
    }
    return {
      shapes: [...shapes.values()],
      next_cursor: spatialCursor
        ? { selection_digest: digest, spatial: spatialCursor }
        : null,
      object_reads: sharedObjects.size
    };
  }
  const perLookup = root.index_depth + 1;
  const rawLimit = Math.max(
    1,
    Math.min(16, Math.floor(80 / (pageSelectionSize * perLookup)))
  );
  let reads = 0;
  // One immutable object may authenticate many candidate membership lookups.
  // Count and transfer it once per query, including an absent posting.
  const objects = new Map<string, Promise<string | null>>();
  const countedGet = (key: string): Promise<string | null> => {
    const cached = objects.get(key);
    if (cached) return cached;
    reads++;
    if (reads > 256) throw Error("v5_viewport_object_budget_exceeded");
    const pending = get(key);
    objects.set(key, pending);
    return pending;
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
    if (shape.read_hint?.collection_ids !== undefined) {
      if (
        collectionIds.some((id) =>
          shape.read_hint!.collection_ids!.includes(id)
        )
      )
        shapes.push(shape);
      continue;
    }
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
