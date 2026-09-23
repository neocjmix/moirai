import type { CanonicalState, Event, Relation } from "@moirai/contracts/v5";
import type { CanonicalEventReference } from "@moirai/contracts";
import {
  ChangeSetError,
  RELATION_REGISTRY,
  validateTimeSystemDefinition,
  temporalGraphFailure,
  temporalAdapterRegistry
} from "./index.js";

function invariant(
  ok: unknown,
  code: string,
  ids: readonly string[] = []
): asserts ok {
  if (!ok)
    throw new ChangeSetError(code, "candidate", code.replaceAll("_", " "), ids);
}
function indexed<T extends { readonly id: string }>(
  values: readonly T[],
  kind: string
): Map<string, T> {
  const result = new Map(values.map((v) => [v.id, v]));
  invariant(result.size === values.length, "duplicate_identity", [kind]);
  return result;
}

/** Derived from all active World contains edges, never from current selection. */
export function compositeChildCounts(
  relations: readonly Relation[]
): ReadonlyMap<string, number> {
  const children = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (
      relation.type !== "contains" ||
      relation.source_ref.kind !== "event" ||
      relation.target_ref.kind !== "event"
    )
      continue;
    const selected =
      children.get(relation.source_ref.event_id) ?? new Set<string>();
    selected.add(relation.target_ref.event_id);
    children.set(relation.source_ref.event_id, selected);
  }
  return new Map([...children].map(([id, selected]) => [id, selected.size]));
}

/** Shared final-state invariant for v5 writers and the isolated migration rehearsal.
 * No Collection is used as an applicability partition for World facts. */
export function assertV5CanonicalState(state: CanonicalState): void {
  const worldId = state.world.id;
  const collections = indexed(state.collections, "collection");
  const events = indexed(state.events, "event");
  const timeSystems = indexed(state.timeSystems, "time_system");
  indexed(state.relations, "relation");
  indexed(state.narratives, "narrative");
  indexed(state.collectionTimeSystems, "collection_time_system");
  for (const value of [
    ...state.collections,
    ...state.events,
    ...state.timeSystems,
    ...state.relations,
    ...state.narratives
  ]) {
    invariant(value.world_id === worldId, "world_scope_mismatch", [value.id]);
  }
  invariant(
    state.world.title.trim().length > 0 && state.world.slug.trim().length > 0,
    "world_content_required"
  );
  for (const value of [
    ...state.collections,
    ...state.events,
    ...state.timeSystems
  ])
    invariant(value.title.trim().length > 0, "title_required", [value.id]);
  for (const value of [...state.collections, ...state.timeSystems])
    invariant(value.slug.trim().length > 0, "slug_required", [value.id]);
  for (const event of state.events) {
    invariant(
      !("kind" in event) &&
        !("canon_id" in event) &&
        !("canon_memberships" in event),
      "legacy_event_semantics",
      [event.id]
    );
  }
  for (const records of [state.collections, state.timeSystems]) {
    invariant(
      new Set(records.map((record) => record.slug)).size === records.length,
      "duplicate_world_slug"
    );
  }
  const memberships = new Set<string>();
  for (const membership of state.eventCollectionMemberships) {
    invariant(
      events.has(membership.event_id) &&
        collections.has(membership.collection_id),
      "dangling_membership",
      [membership.event_id, membership.collection_id]
    );
    const pair = JSON.stringify([
      membership.collection_id,
      membership.event_id
    ]);
    invariant(!memberships.has(pair), "duplicate_membership", [
      membership.event_id,
      membership.collection_id
    ]);
    memberships.add(pair);
  }
  const enabledTimeSystems = new Set<string>();
  for (const link of state.collectionTimeSystems) {
    invariant(
      collections.has(link.collection_id) &&
        timeSystems.has(link.time_system_id),
      "dangling_collection_time_system",
      [link.id]
    );
    const pair = JSON.stringify([link.collection_id, link.time_system_id]);
    invariant(
      !enabledTimeSystems.has(pair),
      "duplicate_collection_time_system",
      [link.id]
    );
    enabledTimeSystems.add(pair);
  }
  for (const timeSystem of state.timeSystems)
    validateTimeSystemDefinition(
      timeSystem.definition,
      `timeSystems.${timeSystem.id}.definition`
    );
  const registry = temporalAdapterRegistry(state.timeSystems);
  const endpoint = (
    reference: CanonicalEventReference,
    relationId: string
  ): Event | null => {
    if (reference.kind === "event") {
      const event = events.get(reference.event_id);
      invariant(event, "dangling_reference", [relationId, reference.event_id]);
      return event;
    }
    const timeSystem = timeSystems.get(
      reference.time_system_ref.time_system_id
    );
    invariant(timeSystem, "dangling_reference", [
      relationId,
      reference.time_system_ref.time_system_id
    ]);
    invariant(
      timeSystem.definition_version === reference.definition_version,
      "time_system_version_mismatch",
      [relationId, timeSystem.id]
    );
    const adapter = registry.get(timeSystem.id, reference.definition_version);
    invariant(adapter, "time_system_capability_missing", [
      relationId,
      timeSystem.id
    ]);
    try {
      invariant(
        adapter.canonicalize(reference.coordinate) === reference.coordinate,
        "invalid_time_coordinate",
        [relationId, timeSystem.id]
      );
    } catch {
      invariant(false, "invalid_time_coordinate", [relationId, timeSystem.id]);
    }
    return null;
  };
  const childCounts = compositeChildCounts(state.relations);
  const children = new Map<string, string[]>();
  const indegree = new Map(state.events.map((e) => [e.id, 0]));
  for (const relation of state.relations) {
    invariant(
      RELATION_REGISTRY[relation.type]?.direction === relation.direction,
      "relation_direction_invalid",
      [relation.id]
    );
    invariant(
      !("canon_id" in relation) &&
        !("canon_memberships" in relation) &&
        !("collection_memberships" in relation),
      "relation_selection_is_not_applicability",
      [relation.id]
    );
    const source = endpoint(relation.source_ref, relation.id);
    const target = endpoint(relation.target_ref, relation.id);
    if (relation.type === "contains") {
      invariant(source && target, "contains_requires_persisted_events", [
        relation.id
      ]);
      invariant(
        relation.direction === "directed",
        "relation_direction_invalid",
        [relation.id]
      );
      const list = children.get(source.id) ?? [];
      list.push(target.id);
      children.set(source.id, list);
      indegree.set(target.id, indegree.get(target.id)! + 1);
    } else if (relation.type === "starts" || relation.type === "ends") {
      invariant(
        target && childCounts.has(target.id),
        "boundary_requires_composite",
        [relation.id]
      );
    } else if (
      !["precedes", "not_after", "coincides"].includes(relation.type)
    ) {
      invariant(source && target, "relation_requires_persisted_events", [
        relation.id
      ]);
    }
  }
  // Iterative topological traversal supports deep graphs without JS stack growth.
  const queue = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i]!) ?? []) {
      const degree = indegree.get(child)! - 1;
      indegree.set(child, degree);
      if (degree === 0) queue.push(child);
    }
  }
  invariant(queue.length === events.size, "containment_cycle");
  const narrativeOwners = new Set<string>();
  for (const narrative of state.narratives) {
    invariant(
      !("canon_id" in narrative) && !("kind" in narrative),
      "legacy_narrative_semantics",
      [narrative.id]
    );
    const ownerExists =
      narrative.scope_type === "event"
        ? events.has(narrative.scope_id)
        : narrative.scope_type === "collection" &&
          collections.has(narrative.scope_id);
    invariant(ownerExists, "dangling_narrative_owner", [
      narrative.id,
      narrative.scope_id
    ]);
    const owner = JSON.stringify([narrative.scope_type, narrative.scope_id]);
    invariant(!narrativeOwners.has(owner), "duplicate_owner_narrative", [
      narrative.scope_id
    ]);
    narrativeOwners.add(owner);
    invariant(
      narrative.body.trim().length > 0 && narrative.locale.trim().length > 0,
      "narrative_content_required",
      [narrative.id]
    );
    for (const note of narrative.notes)
      invariant(
        note.body.trim().length > 0,
        "narrative_note_content_required",
        [narrative.id]
      );
    for (const ref of [
      ...narrative.public_references,
      ...narrative.notes.flatMap((n) => n.public_references)
    ]) {
      invariant(ref.label.trim().length > 0, "invalid_public_reference", [
        narrative.id
      ]);
      let url: URL;
      try {
        url = new URL(ref.url);
      } catch {
        invariant(false, "invalid_public_reference", [narrative.id]);
      }
      invariant(
        url.protocol === "https:" || url.protocol === "http:",
        "invalid_public_reference",
        [narrative.id]
      );
    }
  }
  invariant(
    narrativeOwners.size === events.size + collections.size,
    "owner_narrative_required"
  );
  temporalGraphFailure(
    state.relations,
    state.events.map((event) => ({
      id: event.id,
      kind: childCounts.has(event.id) ? "composite" : "atomic"
    })),
    state.timeSystems
  );
}

export { applyV5Operations } from "./v5-operations.js";

/** Stable export/rehearsal ordering; object/array content is never mutated. */
export function orderedV5State(state: CanonicalState): CanonicalState {
  const byId = <T extends { readonly id: string }>(rows: readonly T[]) =>
    [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    ...state,
    collections: byId(state.collections),
    timeSystems: byId(state.timeSystems),
    collectionTimeSystems: byId(state.collectionTimeSystems),
    events: byId(state.events),
    relations: byId(state.relations),
    narratives: byId(state.narratives),
    eventCollectionMemberships: [...state.eventCollectionMemberships].sort(
      (a, b) =>
        `${a.collection_id}:${a.event_id}`.localeCompare(
          `${b.collection_id}:${b.event_id}`
        )
    )
  };
}
