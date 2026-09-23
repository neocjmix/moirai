/** v5 Revision reconstruction starts at the immutable IP-011 migration
 * snapshot. v2–v4 revisions must continue using the legacy interpreter. */
import { sql } from "kysely";
import type { CanonicalState, EntityRecords } from "@moirai/contracts/v5";
import { assertV5CanonicalState } from "@moirai/domain/v5";
import type { MoiraiDatabase } from "./index.js";

type EntityType = keyof EntityRecords;
const entities: readonly EntityType[] = [
  "world",
  "collection",
  "time_system",
  "collection_time_system",
  "event",
  "relation",
  "narrative"
];
export interface V5HistoryOperation {
  readonly revision: number;
  readonly operation_index: number;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly operation_kind: string;
  readonly before: unknown;
  readonly after: unknown;
}

const membershipKey = (value: { collection_id: string; event_id: string }) =>
  JSON.stringify([value.collection_id, value.event_id]);

/** Caller supplies rows from a single World, ordered by Revision and index. */
export function foldV5RevisionOperations(
  operations: readonly V5HistoryOperation[],
  worldId: string
): CanonicalState {
  const maps: { [K in EntityType]: Map<string, EntityRecords[K]> } = {
    world: new Map(),
    collection: new Map(),
    time_system: new Map(),
    collection_time_system: new Map(),
    event: new Map(),
    relation: new Map(),
    narrative: new Map()
  };
  const memberships = new Map<
    string,
    { event_id: string; collection_id: string }
  >();
  let baseline: number | null = null;
  let previousRevision = 0;
  let previousIndex = -1;
  for (const operation of operations) {
    if (
      operation.revision < previousRevision ||
      (operation.revision === previousRevision &&
        operation.operation_index <= previousIndex)
    )
      throw Error("v5_history_order_invalid");
    previousRevision = operation.revision;
    previousIndex = operation.operation_index;
    if (operation.entity_type === "relation_canon_membership") {
      if (
        operation.operation_kind !== "retire_applicability" ||
        baseline === null
      )
        throw Error("v5_history_legacy_marker_invalid");
      continue;
    }
    if (operation.entity_type === "event_collection_membership") {
      const value = (
        operation.operation_kind === "remove"
          ? operation.before
          : operation.after
      ) as {
        collection_id: string;
        event_id: string;
      } | null;
      if (!value?.collection_id || !value.event_id)
        throw Error("v5_history_membership_invalid");
      const key = membershipKey(value);
      if (operation.operation_kind === "add") {
        if (memberships.has(key))
          throw Error("v5_history_membership_duplicate");
        memberships.set(key, value);
      } else if (operation.operation_kind === "remove") {
        if (!memberships.delete(key))
          throw Error("v5_history_membership_missing");
      } else throw Error("v5_history_membership_operation_invalid");
      continue;
    }
    if (!entities.includes(operation.entity_type as EntityType))
      throw Error("v5_history_entity_invalid");
    const type = operation.entity_type as EntityType;
    if (operation.operation_kind === "migration") {
      if (baseline !== null && baseline !== operation.revision)
        throw Error("v5_history_baseline_repeated");
      baseline = operation.revision;
    } else if (baseline === null) throw Error("v5_history_baseline_missing");
    const destination = maps[type] as Map<string, EntityRecords[EntityType]>;
    if (operation.operation_kind === "withdraw") {
      if (
        !destination.delete(operation.entity_id) &&
        !(operation.revision === baseline && type === "narrative")
      )
        throw Error("v5_history_withdraw_missing");
    } else if (
      operation.operation_kind === "migration" ||
      operation.operation_kind === "create" ||
      operation.operation_kind === "update"
    ) {
      const value = operation.after as EntityRecords[EntityType] | null;
      if (!value || value.id !== operation.entity_id)
        throw Error("v5_history_record_invalid");
      if (operation.operation_kind === "create" && destination.has(value.id))
        throw Error("v5_history_duplicate_identity");
      destination.set(value.id, value);
    } else throw Error("v5_history_operation_invalid");
  }
  const world = maps.world.get(worldId);
  if (!baseline || !world || maps.world.size !== 1)
    throw Error("v5_history_world_missing");
  const state: CanonicalState = {
    world,
    collections: [...maps.collection.values()],
    timeSystems: [...maps.time_system.values()],
    collectionTimeSystems: [...maps.collection_time_system.values()],
    events: [...maps.event.values()],
    eventCollectionMemberships: [...memberships.values()],
    relations: [...maps.relation.values()],
    narratives: [...maps.narrative.values()]
  };
  assertV5CanonicalState(state);
  return state;
}

/** Revision/export-only complete read, never an interactive viewport query. */
export async function readV5WorldAtRevision(
  db: MoiraiDatabase,
  worldId: string,
  revision: number
): Promise<CanonicalState> {
  const baseline = (
    await sql<{
      revision: number;
    }>`select min(revision)::integer as revision from change_operations where world_id=${worldId} and entity_type='world' and operation_kind='migration'`.execute(
      db
    )
  ).rows[0]?.revision;
  if (!baseline || revision < baseline)
    throw Error("v5_revision_not_available_use_legacy_reader");
  const exists = (
    await sql<{
      found: boolean;
    }>`select exists(select 1 from world_revisions where world_id=${worldId} and revision=${revision}) as found`.execute(
      db
    )
  ).rows[0]?.found;
  if (!exists) throw Error("v5_revision_missing");
  const operations = (
    await sql<V5HistoryOperation>`select revision,operation_index,entity_type,entity_id,operation_kind,"before","after" from change_operations where world_id=${worldId} and revision between ${baseline} and ${revision} order by revision,operation_index`.execute(
      db
    )
  ).rows;
  return foldV5RevisionOperations(operations, worldId);
}
