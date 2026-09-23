/** Offline, content-only v5 projection. No Publication pointer or Atropos
 * adapter consumes these pages until temporal/layout shards and a complete
 * versioned manifest are implemented. */
import type { CanonicalState } from "@moirai/contracts/v5";
import { assertV5CanonicalState } from "@moirai/domain/v5";

export interface V5ContentPage {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}
const PAGE_SIZE = 128;
const byId = <T extends { readonly id: string }>(values: readonly T[]) =>
  [...values].sort((left, right) => left.id.localeCompare(right.id));
const page = <T>(values: readonly T[]) => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += PAGE_SIZE)
    result.push(values.slice(index, index + PAGE_SIZE));
  return result;
};

/** Each World-owned Event/Relation/Narrative has one detail identity. Collection
 * membership is a paged selection; contains counts are derived from World
 * facts, independent of which selections a reader has turned on. */
export function buildV5ContentPages(
  state: CanonicalState,
  revision: number
): readonly V5ContentPage[] {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("v5_content_revision_invalid");
  assertV5CanonicalState(state);
  const prefix = `worlds/${state.world.id}/revisions/${revision}/v5/content`;
  const documents: V5ContentPage[] = [];
  const collections = byId(state.collections);
  const events = byId(state.events);
  const relations = byId(state.relations);
  const systems = byId(state.timeSystems);
  const narratives = new Map(
    state.narratives.map((narrative) => [
      `${narrative.scope_type}:${narrative.scope_id}`,
      narrative
    ])
  );
  const members = new Map<string, string[]>();
  const selectedBy = new Map<string, string[]>();
  for (const membership of state.eventCollectionMemberships) {
    const eventIds = members.get(membership.collection_id) ?? [];
    eventIds.push(membership.event_id);
    members.set(membership.collection_id, eventIds);
    const collectionIds = selectedBy.get(membership.event_id) ?? [];
    collectionIds.push(membership.collection_id);
    selectedBy.set(membership.event_id, collectionIds);
  }
  const childIds = new Map<string, Set<string>>();
  const adjacency = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (
      relation.type === "contains" &&
      relation.source_ref.kind === "event" &&
      relation.target_ref.kind === "event"
    ) {
      const children =
        childIds.get(relation.source_ref.event_id) ?? new Set<string>();
      children.add(relation.target_ref.event_id);
      childIds.set(relation.source_ref.event_id, children);
    }
    for (const endpoint of [relation.source_ref, relation.target_ref]) {
      if (endpoint.kind !== "event") continue;
      const ids = adjacency.get(endpoint.event_id) ?? new Set<string>();
      ids.add(relation.id);
      adjacency.set(endpoint.event_id, ids);
    }
  }
  const catalog = collections.map((collection) => {
    const eventIds = [...(members.get(collection.id) ?? [])].sort();
    const systemIds = state.collectionTimeSystems
      .filter((link) => link.collection_id === collection.id)
      .map((link) => link.time_system_id)
      .sort();
    for (const [index, ids] of page(eventIds).entries())
      documents.push({
        key: `${prefix}/collections/${collection.id}/members/${index}.json`,
        value: {
          world_id: state.world.id,
          revision,
          collection_id: collection.id,
          page: index,
          event_ids: ids
        }
      });
    for (const [index, ids] of page(systemIds).entries())
      documents.push({
        key: `${prefix}/collections/${collection.id}/time-systems/${index}.json`,
        value: {
          world_id: state.world.id,
          revision,
          collection_id: collection.id,
          page: index,
          time_system_ids: ids
        }
      });
    documents.push({
      key: `${prefix}/collections/${collection.id}/detail.json`,
      value: {
        world_id: state.world.id,
        revision,
        collection,
        narrative: narratives.get(`collection:${collection.id}`),
        time_system_page_count: Math.ceil(systemIds.length / PAGE_SIZE),
        member_count: eventIds.length,
        member_page_count: Math.ceil(eventIds.length / PAGE_SIZE)
      }
    });
    return {
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      member_count: eventIds.length,
      member_page_count: Math.ceil(eventIds.length / PAGE_SIZE)
    };
  });
  for (const [index, items] of page(catalog).entries())
    documents.push({
      key: `${prefix}/collections/pages/${index}.json`,
      value: {
        world_id: state.world.id,
        revision,
        page: index,
        collections: items
      }
    });
  for (const event of events) {
    const relationIds = [...(adjacency.get(event.id) ?? [])].sort();
    const collectionIds = [...(selectedBy.get(event.id) ?? [])].sort();
    for (const [index, ids] of page(collectionIds).entries())
      documents.push({
        key: `${prefix}/events/${event.id}/collections/${index}.json`,
        value: {
          world_id: state.world.id,
          revision,
          event_id: event.id,
          page: index,
          collection_ids: ids
        }
      });
    for (const [index, ids] of page(relationIds).entries())
      documents.push({
        key: `${prefix}/events/${event.id}/adjacency/${index}.json`,
        value: {
          world_id: state.world.id,
          revision,
          event_id: event.id,
          page: index,
          relation_ids: ids
        }
      });
    documents.push({
      key: `${prefix}/events/${event.id}/detail.json`,
      value: {
        world_id: state.world.id,
        revision,
        event,
        narrative: narratives.get(`event:${event.id}`),
        collection_page_count: Math.ceil(collectionIds.length / PAGE_SIZE),
        composite_child_count: childIds.get(event.id)?.size ?? 0,
        adjacency_page_count: Math.ceil(relationIds.length / PAGE_SIZE)
      }
    });
  }
  for (const relation of relations)
    documents.push({
      key: `${prefix}/relations/${relation.id}.json`,
      value: { world_id: state.world.id, revision, relation }
    });
  for (const system of systems)
    documents.push({
      key: `${prefix}/time-systems/${system.id}.json`,
      value: { world_id: state.world.id, revision, time_system: system }
    });
  for (const [index, items] of page(
    systems.map((system) => ({
      id: system.id,
      slug: system.slug,
      title: system.title
    }))
  ).entries())
    documents.push({
      key: `${prefix}/time-systems/pages/${index}.json`,
      value: {
        world_id: state.world.id,
        revision,
        page: index,
        time_systems: items
      }
    });
  documents.push({
    key: `${prefix}/world.json`,
    value: {
      world_id: state.world.id,
      revision,
      world: state.world,
      collection_count: collections.length,
      collection_page_count: Math.ceil(collections.length / PAGE_SIZE),
      event_count: events.length,
      relation_count: relations.length,
      time_system_count: systems.length,
      time_system_page_count: Math.ceil(systems.length / PAGE_SIZE),
      page_size: PAGE_SIZE,
      completeness: "content-only"
    }
  });
  return documents.sort((left, right) => left.key.localeCompare(right.key));
}
