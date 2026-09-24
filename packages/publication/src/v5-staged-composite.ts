/** Inactive bounded read of a World contains projection. Collection selection
 * cannot change these children, and the IDs resolve to shared World Events. */
import { readV5StagedDocument } from "./v5-staging.js";
import { readV5StagedEvent } from "./v5-staged-event.js";

const PAGE_SIZE = 128;

export async function readV5StagedCompositeChildren(
  rootBody: string,
  worldId: string,
  revision: number,
  eventId: string,
  page: number,
  get: (key: string) => Promise<string | null>
): Promise<{
  readonly child_event_ids: readonly string[];
  readonly page_count: number;
} | null> {
  if (!Number.isSafeInteger(page) || page < 0)
    throw Error("v5_composite_page_invalid");
  const event = await readV5StagedEvent(
    rootBody,
    worldId,
    revision,
    eventId,
    get
  );
  if (!event) return null;
  const count = event.composite?.direct_children_pages;
  if (count === undefined) return null;
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count !== Math.ceil(event.composite_child_count / PAGE_SIZE)
  )
    throw Error("v5_composite_count_invalid");
  if (page >= count) return { child_event_ids: [], page_count: count };
  const key = `worlds/${worldId}/revisions/${revision}/v5/temporal/events/${eventId}/children/${page}.json`;
  const body = await readV5StagedDocument(rootBody, key, get);
  if (body === null) throw Error("v5_composite_children_missing");
  const document = JSON.parse(body) as {
    world_id: string;
    revision: number;
    page: number;
    items: unknown;
  };
  const items = document.items;
  if (
    document.world_id !== worldId ||
    document.revision !== revision ||
    document.page !== page ||
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > PAGE_SIZE ||
    items.some(
      (ref) =>
        typeof ref !== "object" ||
        ref === null ||
        ref.kind !== "event" ||
        typeof ref.event_id !== "string" ||
        !/^[a-zA-Z0-9-]+$/.test(ref.event_id)
    )
  )
    throw Error("v5_composite_children_invalid");
  return {
    child_event_ids: items.map((ref) => ref.event_id as string),
    page_count: count
  };
}
