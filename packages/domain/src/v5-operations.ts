import type {
  CanonicalState,
  EntityRecords,
  ResolvedOperation
} from "@moirai/contracts/v5";
import { ChangeSetError } from "./index.js";
import { assertV5CanonicalState } from "./v5.js";

function fail(code: string, id: string): never {
  throw new ChangeSetError(code, "operations", code.replaceAll("_", " "), [id]);
}
const membershipKey = (value: { collection_id: string; event_id: string }) =>
  JSON.stringify([value.collection_id, value.event_id]);

/** Pure atomic candidate construction. No partial result is persisted on failure. */
export function applyV5Operations(
  existing: CanonicalState | null,
  worldId: string,
  operations: readonly ResolvedOperation[]
): CanonicalState {
  if (existing && existing.world.id !== worldId)
    fail("world_scope_mismatch", worldId);
  type Maps = { [K in keyof EntityRecords]: Map<string, EntityRecords[K]> };
  const maps: Maps = {
    world: new Map(existing ? [[existing.world.id, existing.world]] : []),
    collection: new Map(existing?.collections.map((v) => [v.id, v]) ?? []),
    time_system: new Map(existing?.timeSystems.map((v) => [v.id, v]) ?? []),
    collection_time_system: new Map(
      existing?.collectionTimeSystems.map((v) => [v.id, v]) ?? []
    ),
    event: new Map(existing?.events.map((v) => [v.id, v]) ?? []),
    relation: new Map(existing?.relations.map((v) => [v.id, v]) ?? []),
    narrative: new Map(existing?.narratives.map((v) => [v.id, v]) ?? [])
  };
  const memberships = new Map(
    existing?.eventCollectionMemberships.map((v) => [membershipKey(v), v]) ?? []
  );
  const retired = new Set<string>();
  for (const operation of operations) {
    if (operation.entity_type === "event_collection_membership") {
      const key = membershipKey(operation.value);
      if (operation.kind === "add") {
        if (memberships.has(key))
          fail("duplicate_membership", operation.value.event_id);
        memberships.set(key, operation.value);
      } else {
        if (!memberships.delete(key))
          fail("membership_missing", operation.value.event_id);
      }
      continue;
    }
    const key = `${operation.entity_type}:${operation.entity_id}`;
    if (retired.has(key)) fail("withdrawn_identity", operation.entity_id);
    if (operation.kind === "withdraw") {
      if (!maps[operation.entity_type].delete(operation.entity_id))
        fail("entity_missing", operation.entity_id);
      retired.add(key);
      if (operation.entity_type === "collection") {
        // A navigation selection's retirement never withdraws World facts.
        for (const [id, membership] of memberships)
          if (membership.collection_id === operation.entity_id)
            memberships.delete(id);
        for (const [id, link] of maps.collection_time_system)
          if (link.collection_id === operation.entity_id)
            maps.collection_time_system.delete(id);
        for (const [id, narrative] of maps.narrative)
          if (
            narrative.scope_type === "collection" &&
            narrative.scope_id === operation.entity_id
          ) {
            maps.narrative.delete(id);
            retired.add(`narrative:${id}`);
          }
      }
      continue;
    }
    const previous = maps[operation.entity_type].get(operation.entity_id);
    if (operation.kind === "create" && previous)
      fail("entity_exists", operation.entity_id);
    if (operation.kind === "update" && !previous)
      fail("entity_missing", operation.entity_id);
    if (operation.entity_type === "world" && operation.entity_id !== worldId)
      fail("world_scope_mismatch", operation.entity_id);
    if (
      previous &&
      "world_id" in previous &&
      "world_id" in operation.value &&
      previous.world_id !== operation.value.world_id
    )
      fail("immutable_owner", operation.entity_id);
    if (operation.kind === "update" && operation.entity_type === "narrative") {
      const old = maps.narrative.get(operation.entity_id)!;
      if (
        old.scope_id !== operation.value.scope_id ||
        old.scope_type !== operation.value.scope_type
      )
        fail("immutable_narrative_owner", operation.entity_id);
    }
    // The discriminated operation union guarantees each value matches this map.
    const destination = maps[operation.entity_type] as Map<
      string,
      EntityRecords[keyof EntityRecords]
    >;
    destination.set(operation.entity_id, {
      ...operation.value,
      id: operation.entity_id
    });
  }
  const world = maps.world.get(worldId);
  if (!world || maps.world.size !== 1) fail("world_missing", worldId);
  const candidate: CanonicalState = {
    world,
    collections: [...maps.collection.values()],
    timeSystems: [...maps.time_system.values()],
    collectionTimeSystems: [...maps.collection_time_system.values()],
    events: [...maps.event.values()],
    eventCollectionMemberships: [...memberships.values()],
    relations: [...maps.relation.values()],
    narratives: [...maps.narrative.values()]
  };
  assertV5CanonicalState(candidate);
  return candidate;
}
