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
        and table_name in ('worlds', 'change_sets', 'publication_outbox')
      order by table_name
    `.execute(db);
    expect(canonical.rows).toEqual([
      { table_name: "change_sets" },
      { table_name: "publication_outbox" },
      { table_name: "worlds" }
    ]);
  });

  it("is idempotent", async () => {
    await expect(migrateToLatest(databaseUrl ?? "")).resolves.toBeUndefined();
  });
});
