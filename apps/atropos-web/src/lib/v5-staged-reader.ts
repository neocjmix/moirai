/** Inactive Atropos read adapter. A complete, verified v5 Publication pointer
 * must authenticate rootBody before this adapter can be exposed in a route. */
import type { ObjectStore } from "@moirai/publication";
import { readV5AuthenticatedViewport } from "@moirai/graph-presentation/server";
import type { V5ViewportCursor } from "@moirai/graph-presentation/server";
import {
  readV5StagedEvent,
  readV5StagedCollection,
  readV5StagedCollectionCatalog,
  readV5StagedAdjacencyPage,
  readV5StagedRelation,
  readV5StagedCompositeChildren,
  readV5StagedSelectionPage,
  type V5SelectionCursor
} from "@moirai/publication/v5";

export function createV5StagedAtroposReader(
  store: Pick<ObjectStore, "get">,
  rootBody: string,
  worldId: string,
  revision: number
) {
  const get = async (key: string) => {
    const response = await store.get(key);
    if (response.status === 404) return null;
    if (response.status !== 200 || response.body === null)
      throw Error("v5_object_read_failed");
    return response.body;
  };
  return {
    viewport: (
      timeSystemId: string,
      viewport: { minX: number; maxX: number; minY: number; maxY: number },
      limit: number,
      cursor: V5ViewportCursor | null
    ) =>
      readV5AuthenticatedViewport(
        rootBody,
        worldId,
        revision,
        timeSystemId,
        viewport,
        limit,
        cursor,
        get
      ),
    event: (eventId: string) =>
      readV5StagedEvent(rootBody, worldId, revision, eventId, get),
    collection: (collectionId: string, page: number) =>
      readV5StagedCollection(
        rootBody,
        worldId,
        revision,
        collectionId,
        page,
        get
      ),
    collections: (page: number) =>
      readV5StagedCollectionCatalog(rootBody, worldId, revision, page, get),
    adjacency: (eventId: string, page: number) =>
      readV5StagedAdjacencyPage(
        rootBody,
        worldId,
        revision,
        eventId,
        page,
        get
      ),
    relation: (relationId: string) =>
      readV5StagedRelation(rootBody, worldId, revision, relationId, get),
    compositeChildren: (eventId: string, page: number) =>
      readV5StagedCompositeChildren(
        rootBody,
        worldId,
        revision,
        eventId,
        page,
        get
      ),
    selectedEvents: (
      collectionIds: readonly string[],
      cursor: V5SelectionCursor | null
    ) =>
      readV5StagedSelectionPage(
        rootBody,
        worldId,
        revision,
        collectionIds,
        cursor,
        get
      )
  };
}
