/** Inactive bounded adjacency read. The World owns Relations; Collection
 * membership affects selection only and does not alter graph truth. */
import type { Relation } from "@moirai/contracts/v5";
import { readV5StagedDocument } from "./v5-staging.js";

export interface V5StagedAdjacencyPage {
  readonly event_id: string;
  readonly relation_ids: readonly string[];
  readonly next_page: number | null;
}

export async function readV5StagedAdjacencyPage(
  rootBody: string,
  worldId: string,
  revision: number,
  eventId: string,
  page: number,
  get: (key: string) => Promise<string | null>
): Promise<V5StagedAdjacencyPage | null> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    ![
      "content-and-temporal-detail-only",
      "content-temporal-and-spatial-staged"
    ].includes(root.completeness) ||
    !/^[a-zA-Z0-9-]+$/.test(eventId) ||
    !Number.isSafeInteger(page) ||
    page < 0
  )
    throw Error("v5_adjacency_root_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/content/`;
  const load = (key: string) =>
    readV5StagedDocument(rootBody, `${prefix}${key}`, get);
  const detailBody = await load(`events/${eventId}/detail.json`);
  if (detailBody === null) return null;
  const detail = JSON.parse(detailBody) as {
    world_id: string;
    revision: number;
    event: { id: string; world_id: string };
    adjacency_page_count: number;
  };
  if (
    detail.world_id !== worldId ||
    detail.revision !== revision ||
    detail.event?.id !== eventId ||
    detail.event.world_id !== worldId ||
    !Number.isSafeInteger(detail.adjacency_page_count) ||
    detail.adjacency_page_count < 0
  )
    throw Error("v5_adjacency_detail_invalid");
  if (
    page >= detail.adjacency_page_count &&
    !(page === 0 && detail.adjacency_page_count === 0)
  )
    throw Error("v5_adjacency_page_out_of_range");
  if (detail.adjacency_page_count === 0)
    return { event_id: eventId, relation_ids: [], next_page: null };
  const body = await load(`events/${eventId}/adjacency/${page}.json`);
  if (body === null) throw Error("v5_adjacency_missing");
  const adjacency = JSON.parse(body) as {
    world_id: string;
    revision: number;
    event_id: string;
    page: number;
    relation_ids: string[];
  };
  if (
    adjacency.world_id !== worldId ||
    adjacency.revision !== revision ||
    adjacency.event_id !== eventId ||
    adjacency.page !== page ||
    !Array.isArray(adjacency.relation_ids) ||
    adjacency.relation_ids.length < 1 ||
    adjacency.relation_ids.length > 128 ||
    adjacency.relation_ids.some(
      (id, index) =>
        typeof id !== "string" ||
        (index > 0 && adjacency.relation_ids[index - 1]! >= id)
    )
  )
    throw Error("v5_adjacency_invalid");
  return {
    event_id: eventId,
    relation_ids: adjacency.relation_ids,
    next_page: page + 1 < detail.adjacency_page_count ? page + 1 : null
  };
}

export async function readV5StagedRelation(
  rootBody: string,
  worldId: string,
  revision: number,
  relationId: string,
  get: (key: string) => Promise<string | null>
): Promise<Relation | null> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    ![
      "content-and-temporal-detail-only",
      "content-temporal-and-spatial-staged"
    ].includes(root.completeness) ||
    !/^[a-zA-Z0-9-]+$/.test(relationId)
  )
    throw Error("v5_relation_root_invalid");
  const body = await readV5StagedDocument(
    rootBody,
    `worlds/${worldId}/revisions/${revision}/v5/content/relations/${relationId}.json`,
    get
  );
  if (body === null) return null;
  const detail = JSON.parse(body) as {
    world_id: string;
    revision: number;
    relation: Relation;
  };
  if (
    detail.world_id !== worldId ||
    detail.revision !== revision ||
    detail.relation?.id !== relationId ||
    detail.relation.world_id !== worldId
  )
    throw Error("v5_relation_detail_invalid");
  return detail.relation;
}
