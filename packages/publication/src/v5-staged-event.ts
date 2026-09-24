/** Offline v5 direct-Event read. The root comes from the staged manifest, not
 * live current.json. A future Atropos adapter must authenticate that root
 * through a complete Publication pointer before exposing it publicly. */
import type { Event, Narrative } from "@moirai/contracts/v5";
import { readV5StagedDocument } from "./v5-staging.js";

interface EventDetail {
  readonly world_id: string;
  readonly revision: number;
  readonly event: Event;
  readonly narrative: Narrative;
  readonly collection_page_count: number;
  readonly adjacency_page_count: number;
  readonly composite_child_count: number;
}
interface TemporalDetail {
  readonly world_id: string;
  readonly revision: number;
  readonly position: { readonly event_id: string; readonly kind: string };
}
interface CompositeDetail {
  readonly world_id: string;
  readonly revision: number;
  readonly composite: {
    readonly event_id: string;
    readonly direct_children_pages: number;
  };
}
export interface V5StagedEventRead {
  readonly event: Event;
  readonly narrative: Narrative;
  readonly position: TemporalDetail["position"];
  readonly composite: CompositeDetail["composite"] | null;
  readonly collection_page_count: number;
  readonly adjacency_page_count: number;
  readonly composite_child_count: number;
}

export async function readV5StagedEvent(
  rootBody: string,
  worldId: string,
  revision: number,
  eventId: string,
  get: (key: string) => Promise<string | null>
): Promise<V5StagedEventRead | null> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    root.completeness !== "content-and-temporal-detail-only" ||
    !/^[a-zA-Z0-9-]+$/.test(eventId)
  )
    throw Error("v5_event_root_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/`;
  const load = (key: string) =>
    readV5StagedDocument(rootBody, `${prefix}${key}`, get);
  const detailBody = await load(`content/events/${eventId}/detail.json`);
  if (detailBody === null) return null;
  const detail = JSON.parse(detailBody) as EventDetail;
  if (
    detail.world_id !== worldId ||
    detail.revision !== revision ||
    detail.event.id !== eventId ||
    detail.event.world_id !== worldId ||
    detail.narrative.scope_type !== "event" ||
    detail.narrative.scope_id !== eventId ||
    detail.narrative.world_id !== worldId ||
    !Number.isSafeInteger(detail.composite_child_count) ||
    detail.composite_child_count < 0
  )
    throw Error("v5_event_detail_invalid");
  const positionBody = await load(`temporal/events/${eventId}/position.json`);
  if (positionBody === null) throw Error("v5_event_temporal_missing");
  const temporal = JSON.parse(positionBody) as TemporalDetail;
  if (
    temporal.world_id !== worldId ||
    temporal.revision !== revision ||
    temporal.position.event_id !== eventId
  )
    throw Error("v5_event_temporal_invalid");
  let composite: CompositeDetail["composite"] | null = null;
  if (detail.composite_child_count > 0) {
    const compositeBody = await load(
      `temporal/events/${eventId}/composite.json`
    );
    if (compositeBody === null) throw Error("v5_event_composite_missing");
    const item = JSON.parse(compositeBody) as CompositeDetail;
    if (
      item.world_id !== worldId ||
      item.revision !== revision ||
      item.composite.event_id !== eventId
    )
      throw Error("v5_event_composite_invalid");
    composite = item.composite;
  }
  return {
    event: detail.event,
    narrative: detail.narrative,
    position: temporal.position,
    composite,
    collection_page_count: detail.collection_page_count,
    adjacency_page_count: detail.adjacency_page_count,
    composite_child_count: detail.composite_child_count
  };
}
