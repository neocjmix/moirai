import { sql, type QueryExecutorProvider } from "kysely";
import type {
  CanonicalState,
  Collection,
  Event,
  Narrative,
  Relation,
  CollectionTimeSystem,
  EventCollectionMembership
} from "@moirai/contracts/v5";
import type { PublicTimeSystem, PublicWorld } from "@moirai/contracts";

/** Canonical validation/export read; interactive queries must use bounded indexes. */
export async function readActiveV5State(
  db: QueryExecutorProvider,
  worldId: string
): Promise<CanonicalState> {
  const world = (
    await sql<PublicWorld>`select id, slug, title, description from worlds where id = ${worldId} and withdrawn_revision is null`.execute(
      db
    )
  ).rows[0];
  if (!world) throw Error("v5_world_missing");
  const collections = (
    await sql<Collection>`select id, world_id, slug, title, description from collections where world_id = ${worldId} and withdrawn_revision is null order by id`.execute(
      db
    )
  ).rows;
  const timeSystems = (
    await sql<PublicTimeSystem>`select id, world_id, slug, title, kind, definition_version, definition from time_systems where world_id = ${worldId} and withdrawn_revision is null order by id`.execute(
      db
    )
  ).rows;
  const collectionTimeSystems = (
    await sql<CollectionTimeSystem>`select l.id, l.collection_id, l.time_system_id from collection_time_systems l join collections c on c.id = l.collection_id where c.world_id = ${worldId} and l.withdrawn_revision is null order by l.id`.execute(
      db
    )
  ).rows;
  const events = (
    await sql<Event>`select id, world_id, slug, title, summary, roles, attributes from events where world_id = ${worldId} and withdrawn_revision is null order by id`.execute(
      db
    )
  ).rows;
  const eventCollectionMemberships = (
    await sql<EventCollectionMembership>`select event_id, collection_id from collection_event_memberships where world_id = ${worldId} and withdrawn_revision is null order by collection_id, event_id`.execute(
      db
    )
  ).rows;
  const relations = (
    await sql<Relation>`select id, world_id, type, source_ref, target_ref, direction, attributes from relations where world_id = ${worldId} and withdrawn_revision is null order by id`.execute(
      db
    )
  ).rows;
  const narratives = (
    await sql<Narrative>`select id, world_id, scope_type, scope_id, locale, title, body, public_references, notes from narratives where world_id = ${worldId} and withdrawn_revision is null order by id`.execute(
      db
    )
  ).rows;
  return {
    world,
    collections,
    timeSystems,
    collectionTimeSystems,
    events,
    eventCollectionMemberships,
    relations,
    narratives
  };
}
