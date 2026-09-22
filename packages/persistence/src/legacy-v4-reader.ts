/** Immutable historical interpretation for v2–v4 revisions, never a v5 writer. */
import type { PublicWorld, PublicTimeSystem } from "@moirai/contracts";
import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicRelation,
  PublicNarrative,
  LegacyV4RevisionView
} from "@moirai/contracts/legacy-v4";
import {
  canonicalRelationEndpoints,
  resolveEventReference,
  temporalAdapterRegistry
} from "@moirai/domain";
import type { MoiraiDatabase } from "./index.js";
import { observeHistoryFold } from "./read-profile.js";

function decorateVirtualRelation(
  relation: PublicRelation,
  registry: ReturnType<typeof temporalAdapterRegistry>
): PublicRelation {
  const endpoints = canonicalRelationEndpoints(relation);
  if (!endpoints) return relation;
  try {
    return {
      ...relation,
      source_ref: resolveEventReference(endpoints.source, registry),
      target_ref: resolveEventReference(endpoints.target, registry)
    };
  } catch {
    // A historical row remains readable even when a later deployment no longer
    // has its adapter; it simply cannot claim a newly resolved virtual ID.
    return relation;
  }
}

export async function readLegacyV4WorldAtRevision(
  db: MoiraiDatabase,
  worldId: string,
  revision: number
): Promise<LegacyV4RevisionView> {
  const revisionRecord = await db
    .selectFrom("world_revisions")
    .select("committed_at")
    .where("world_id", "=", worldId)
    .where("revision", "=", revision)
    .executeTakeFirst();
  if (!revisionRecord) throw new Error("World Revision does not exist");
  const operations = await db
    .selectFrom("change_operations")
    .select([
      "entity_type",
      "entity_id",
      "operation_kind",
      "after",
      "revision",
      "operation_index"
    ])
    .where("world_id", "=", worldId)
    .where("revision", "<=", revision)
    .orderBy("revision")
    .orderBy("operation_index")
    .execute();
  const foldStart = performance.now();
  const latest = new Map<string, (typeof operations)[number]>();
  const eventCanonMemberships = new Map<string, Set<string>>();
  const relationCanonMemberships = new Map<string, Set<string>>();
  const withdrawnEventIds = new Set<string>();
  const withdrawnRelationIds = new Set<string>();
  for (const operation of operations) {
    if (operation.entity_type === "event_canon_membership" && operation.after) {
      const value = operation.after as {
        event_id: string;
        canon_id: string;
      };
      const memberships =
        eventCanonMemberships.get(value.event_id) ?? new Set<string>();
      if (operation.operation_kind === "add") {
        memberships.add(value.canon_id);
      } else if (operation.operation_kind === "remove") {
        memberships.delete(value.canon_id);
      }
      eventCanonMemberships.set(value.event_id, memberships);
      continue;
    }
    if (
      operation.entity_type === "relation_canon_membership" &&
      operation.after
    ) {
      const value = operation.after as {
        relation_id: string;
        canon_id: string;
      };
      const memberships =
        relationCanonMemberships.get(value.relation_id) ?? new Set<string>();
      if (operation.operation_kind === "add") memberships.add(value.canon_id);
      else if (operation.operation_kind === "remove")
        memberships.delete(value.canon_id);
      relationCanonMemberships.set(value.relation_id, memberships);
      continue;
    }
    if (
      operation.entity_type === "event" &&
      operation.operation_kind === "withdraw"
    ) {
      withdrawnEventIds.add(operation.entity_id);
      continue;
    }
    if (
      operation.entity_type === "relation" &&
      operation.operation_kind === "withdraw"
    ) {
      withdrawnRelationIds.add(operation.entity_id);
      continue;
    }
    if (
      operation.entity_type === "event" &&
      operation.operation_kind === "create" &&
      typeof operation.after?.canon_id === "string"
    ) {
      eventCanonMemberships.set(
        operation.entity_id,
        new Set([operation.after.canon_id])
      );
    }
    if (
      operation.entity_type === "relation" &&
      operation.operation_kind === "create" &&
      typeof operation.after?.canon_id === "string"
    )
      relationCanonMemberships.set(
        operation.entity_id,
        new Set([operation.after.canon_id])
      );
    latest.set(`${operation.entity_type}:${operation.entity_id}`, operation);
  }
  const records = [...latest.values()].filter(
    (operation) => operation.after !== null
  );
  const byType = (type: string): Record<string, unknown>[] =>
    records
      .filter((item) => item.entity_type === type)
      .map((item) => item.after!);
  const world = byType("world")[0] as unknown as PublicWorld | undefined;
  if (!world) throw new Error("revision view has no World");
  const canons = byType("canon") as unknown as PublicCanon[];
  const canonWorlds = new Map(
    canons.map((canon) => [canon.id, canon.world_id])
  );
  const timeSystems = byType("time_system") as unknown as PublicTimeSystem[];
  const relationRegistry = temporalAdapterRegistry(timeSystems);
  const events = byType("event")
    .filter((event) => !withdrawnEventIds.has(String(event.id)))
    .map((event) => {
      const canonMemberships = [
        ...(eventCanonMemberships.get(String(event.id)) ?? [])
      ].sort();
      if (canonMemberships.length === 0)
        throw new Error("revision view has an active orphan Event");
      const legacyCanonId =
        typeof event.canon_id === "string" ? event.canon_id : undefined;
      const worldId =
        typeof event.world_id === "string"
          ? event.world_id
          : legacyCanonId
            ? canonWorlds.get(legacyCanonId)
            : undefined;
      if (!worldId) throw new Error("revision view Event has no World");
      const publicEvent = { ...event };
      delete publicEvent.canon_id;
      return {
        ...publicEvent,
        world_id: worldId,
        canon_memberships: canonMemberships
      };
    }) as unknown as PublicEvent[];
  const result: LegacyV4RevisionView = {
    world,
    canons,
    timeSystems,
    canonTimeSystems: byType(
      "canon_time_system"
    ) as unknown as PublicCanonTimeSystem[],
    eventCanonMemberships: [...eventCanonMemberships.entries()].flatMap(
      ([event_id, canonIds]) =>
        [...canonIds].sort().map((canon_id) => ({ event_id, canon_id }))
    ),
    relationCanonMemberships: [...relationCanonMemberships.entries()].flatMap(
      ([relation_id, canonIds]) =>
        [...canonIds].sort().map((canon_id) => ({ relation_id, canon_id }))
    ),
    events,
    relations: byType("relation")
      .filter((relation) => !withdrawnRelationIds.has(String(relation.id)))
      .map((relation) => {
        const canonMemberships = [
          ...(relationCanonMemberships.get(String(relation.id)) ?? [])
        ].sort();
        if (canonMemberships.length === 0)
          throw new Error("revision view has an active orphan Relation");
        const legacyCanonId =
          typeof relation.canon_id === "string" ? relation.canon_id : undefined;
        const worldId =
          typeof relation.world_id === "string"
            ? relation.world_id
            : legacyCanonId
              ? canonWorlds.get(legacyCanonId)
              : undefined;
        if (!worldId) throw new Error("revision view Relation has no World");
        const publicRelation = { ...relation };
        delete publicRelation.canon_id;
        return decorateVirtualRelation(
          {
            ...publicRelation,
            world_id: worldId,
            canon_memberships: canonMemberships
          } as unknown as PublicRelation,
          relationRegistry
        );
      }),
    narratives: byType("narrative") as unknown as PublicNarrative[],
    generatedAt: revisionRecord.committed_at.toISOString()
  };
  observeHistoryFold(operations.length, performance.now() - foldStart);
  return result;
}
