import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "./index.js";
import { migrateToLatest } from "./migrate.js";

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
          'time_systems', 'event_temporal_placements', 'relations', 'narratives',
          'subject_handles', 'subject_handle_members')
      order by table_name
    `.execute(db);
    expect(canonical.rows).toEqual([
      { table_name: "change_sets" },
      { table_name: "event_temporal_placements" },
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

  it("keeps legacy Relation IDs while adding nullable canonical endpoint references", async () => {
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
      { column_name: "source_event_id", is_nullable: "YES" },
      { column_name: "source_ref", is_nullable: "YES" },
      { column_name: "target_event_id", is_nullable: "YES" },
      { column_name: "target_ref", is_nullable: "YES" }
    ]);
  });
});
