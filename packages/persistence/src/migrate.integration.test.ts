import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./index.js";
import { collectIp003CanonEventPreflight } from "./ip003-preflight.js";
import { migrateOneDown, migrateToLatest } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("versioned migrations", () => {
  const db = createDatabase(databaseUrl ?? "");

  beforeAll(async () => {
    await migrateToLatest(databaseUrl ?? "");
  });

  afterAll(async () => {
    await db.destroy();
  });

  it("creates the versioned operational and canonical tables", async () => {
    const result = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'moirai_system_metadata'
    `.execute(db);

    expect(result.rows).toEqual([{ table_name: "moirai_system_metadata" }]);
    const canonical = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('worlds', 'change_sets', 'publication_outbox',
          'time_systems', 'relations', 'narratives',
        'subject_handles', 'subject_handle_members',
        'canon_event_memberships')
      order by table_name
    `.execute(db);
    expect(canonical.rows).toEqual([
      { table_name: "canon_event_memberships" },
      { table_name: "change_sets" },
      { table_name: "narratives" },
      { table_name: "publication_outbox" },
      { table_name: "relations" },
      { table_name: "subject_handle_members" },
      { table_name: "subject_handles" },
      { table_name: "time_systems" },
      { table_name: "worlds" }
    ]);
  });

  it("is idempotent", async () => {
    await expect(migrateToLatest(databaseUrl ?? "")).resolves.toBeUndefined();
  });

  it("creates only non-null canonical Relation endpoint references", async () => {
    const result = await sql<{
      column_name: string;
      is_nullable: "YES" | "NO";
    }>`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'relations'
        and column_name in ('source_event_id', 'target_event_id', 'source_ref', 'target_ref')
      order by column_name
    `.execute(db);
    expect(result.rows).toEqual([
      { column_name: "source_ref", is_nullable: "NO" },
      { column_name: "target_ref", is_nullable: "NO" }
    ]);
  });

  it("backfills every pre-IP-003 Event without changing its identity", async () => {
    const worldId = randomUUID();
    const canonId = randomUUID();
    const eventId = randomUUID();

    await migrateOneDown(databaseUrl ?? "");
    try {
      await sql`
        insert into worlds (
          id, slug, title, current_revision, publication_target_revision,
          created_revision, updated_revision
        ) values (
          ${worldId}, ${`ip003-backfill-world-${worldId}`}, 'Backfill world',
          3, 3, 1, 3
        )
      `.execute(db);
      await sql`
        insert into canons (
          id, world_id, slug, title, created_revision, updated_revision
        ) values (${canonId}, ${worldId}, 'backfill-canon', 'Backfill Canon', 1, 1)
      `.execute(db);
      await sql`
        insert into events (
          id, canon_id, slug, kind, title, roles, attributes,
          created_revision, updated_revision
        ) values (
          ${eventId}, ${canonId}, 'backfill-event', 'atomic', 'Backfill Event',
          '[]'::jsonb, '{}'::jsonb, 2, 3
        )
      `.execute(db);

      await migrateToLatest(databaseUrl ?? "");

      const result = await sql<{
        event_id: string;
        world_id: string;
        canon_id: string;
        membership_event_id: string;
        created_revision: number;
        updated_revision: number;
      }>`
        select
          event.id as event_id,
          event.world_id,
          membership.canon_id,
          membership.event_id as membership_event_id,
          membership.created_revision,
          membership.updated_revision
        from events as event
        join canon_event_memberships as membership on membership.event_id = event.id
        where event.id = ${eventId}
      `.execute(db);
      expect(result.rows).toEqual([
        {
          event_id: eventId,
          world_id: worldId,
          canon_id: canonId,
          membership_event_id: eventId,
          created_revision: 2,
          updated_revision: 3
        }
      ]);
    } finally {
      await migrateToLatest(databaseUrl ?? "");
      await sql`delete from canon_event_memberships where event_id = ${eventId}`.execute(
        db
      );
      await sql`delete from events where id = ${eventId}`.execute(db);
      await sql`delete from canons where id = ${canonId}`.execute(db);
      await sql`delete from worlds where id = ${worldId}`.execute(db);
    }
  });

  it("losslessly bridges legacy Event ownership into same-World memberships", async () => {
    const firstWorld = randomUUID();
    const secondWorld = randomUUID();
    const firstCanon = randomUUID();
    const secondCanon = randomUUID();
    const eventId = randomUUID();
    const duplicateMembershipId = randomUUID();
    const crossWorldMembershipId = randomUUID();

    try {
      await sql`
        insert into worlds (
          id, slug, title, current_revision, publication_target_revision,
          created_revision, updated_revision
        ) values
          (${firstWorld}, ${`ip003-world-${firstWorld}`}, 'IP-003 world A', 1, 1, 1, 1),
          (${secondWorld}, ${`ip003-world-${secondWorld}`}, 'IP-003 world B', 1, 1, 1, 1)
      `.execute(db);
      await sql`
        insert into canons (
          id, world_id, slug, title, created_revision, updated_revision
        ) values
          (${firstCanon}, ${firstWorld}, 'canon-a', 'Canon A', 1, 1),
          (${secondCanon}, ${secondWorld}, 'canon-b', 'Canon B', 1, 1)
      `.execute(db);
      await sql`
        insert into events (
          id, canon_id, slug, kind, title, roles, attributes,
          created_revision, updated_revision
        ) values (
          ${eventId}, ${firstCanon}, 'legacy-event', 'atomic', 'Legacy Event',
          '[]'::jsonb, '{}'::jsonb, 1, 1
        )
      `.execute(db);

      const event = await sql<{ world_id: string }>`
        select world_id from events where id = ${eventId}
      `.execute(db);
      expect(event.rows).toEqual([{ world_id: firstWorld }]);

      const memberships = await sql<{
        world_id: string;
        canon_id: string;
        event_id: string;
      }>`
        select world_id, canon_id, event_id
        from canon_event_memberships
        where event_id = ${eventId}
      `.execute(db);
      expect(memberships.rows).toEqual([
        { world_id: firstWorld, canon_id: firstCanon, event_id: eventId }
      ]);

      await expect(
        sql`
          insert into canon_event_memberships (
            id, world_id, canon_id, event_id, created_revision, updated_revision
          ) values (
            ${duplicateMembershipId}, ${firstWorld}, ${firstCanon}, ${eventId}, 1, 1
          )
        `.execute(db)
      ).rejects.toMatchObject({ code: "23505" });

      await expect(
        sql`
          insert into canon_event_memberships (
            id, world_id, canon_id, event_id, created_revision, updated_revision
          ) values (
            ${crossWorldMembershipId}, ${secondWorld}, ${secondCanon}, ${eventId}, 1, 1
          )
        `.execute(db)
      ).rejects.toMatchObject({ code: "23503" });

      const preflight = await collectIp003CanonEventPreflight(db);
      expect(preflight.invariants).toMatchObject({
        legacy_event_canon_cross_world: 0,
        events_without_world: 0,
        active_events_without_active_membership: 0,
        cross_world_memberships: 0,
        duplicate_active_memberships: 0
      });
    } finally {
      await sql`delete from canon_event_memberships where event_id = ${eventId}`.execute(
        db
      );
      await sql`delete from events where id = ${eventId}`.execute(db);
      await sql`delete from canons where id in (${firstCanon}, ${secondCanon})`.execute(
        db
      );
      await sql`delete from worlds where id in (${firstWorld}, ${secondWorld})`.execute(
        db
      );
    }
  });
});
