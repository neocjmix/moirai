/** Inactive v5 Collection reader. Memberships are selections of stable World
 * Event IDs; Event detail and Narrative live at their own World keys. */
import type { Collection, Narrative } from "@moirai/contracts/v5";
import { readV5StagedDocument } from "./v5-staging.js";

export interface V5StagedCollectionRead {
  readonly collection: Collection;
  readonly narrative: Narrative;
  readonly member_count: number;
  readonly member_page_count: number;
  readonly event_ids: readonly string[];
  readonly next_page: number | null;
}

export async function readV5StagedCollection(
  rootBody: string,
  worldId: string,
  revision: number,
  collectionId: string,
  page: number,
  get: (key: string) => Promise<string | null>
): Promise<V5StagedCollectionRead | null> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    root.completeness !== "content-and-temporal-detail-only" ||
    !/^[a-zA-Z0-9-]+$/.test(collectionId) ||
    !Number.isSafeInteger(page) ||
    page < 0
  )
    throw Error("v5_collection_root_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/`;
  const load = (suffix: string) =>
    readV5StagedDocument(rootBody, `${prefix}${suffix}`, get);
  const body = await load(`content/collections/${collectionId}/detail.json`);
  if (body === null) return null;
  const detail = JSON.parse(body) as {
    world_id: string;
    revision: number;
    collection: Collection;
    narrative: Narrative;
    member_count: number;
    member_page_count: number;
  };
  if (
    detail.world_id !== worldId ||
    detail.revision !== revision ||
    detail.collection.id !== collectionId ||
    detail.collection.world_id !== worldId ||
    detail.narrative?.scope_type !== "collection" ||
    detail.narrative.scope_id !== collectionId ||
    detail.narrative.world_id !== worldId ||
    !Number.isSafeInteger(detail.member_count) ||
    detail.member_count < 0 ||
    !Number.isSafeInteger(detail.member_page_count) ||
    detail.member_page_count !== Math.ceil(detail.member_count / 128)
  )
    throw Error("v5_collection_detail_invalid");
  if (
    page >= detail.member_page_count &&
    !(page === 0 && detail.member_count === 0)
  )
    throw Error("v5_collection_page_out_of_range");
  let eventIds: readonly string[] = [];
  if (detail.member_count > 0) {
    const pageBody = await load(
      `content/collections/${collectionId}/members/${page}.json`
    );
    if (pageBody === null) throw Error("v5_collection_members_missing");
    const members = JSON.parse(pageBody) as {
      world_id: string;
      revision: number;
      collection_id: string;
      page: number;
      event_ids: string[];
    };
    if (
      members.world_id !== worldId ||
      members.revision !== revision ||
      members.collection_id !== collectionId ||
      members.page !== page ||
      !Array.isArray(members.event_ids) ||
      members.event_ids.length < 1 ||
      members.event_ids.length > 128 ||
      members.event_ids.some(
        (id, index) =>
          typeof id !== "string" ||
          (index > 0 && members.event_ids[index - 1]! >= id)
      )
    )
      throw Error("v5_collection_members_invalid");
    eventIds = members.event_ids;
  }
  return {
    collection: detail.collection,
    narrative: detail.narrative,
    member_count: detail.member_count,
    member_page_count: detail.member_page_count,
    event_ids: eventIds,
    next_page: page + 1 < detail.member_page_count ? page + 1 : null
  };
}
