import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitCreateChangeSet, createDatabase } from "./index.js";
import { migrateToLatest } from "./migrate.js";
import {
  createTestChangeSet,
  createTestExpansionChangeSet
} from "./test-fixture.js";
import { collectReadOnlyInventory } from "./ip011-inventory.js";
import {
  captureDatabaseImage,
  databaseImageDigest,
  decryptDatabaseImage,
  encryptDatabaseImage,
  restoreFreshRehearsal
} from "./ip011-backup.js";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("IP-011 encrypted backup and isolated restore", () => {
  const db = createDatabase(url ?? "");
  const name = "ip011_rehearsal_" + randomBytes(8).toString("hex");
  const mismatchName = "ip011_rehearsal_" + randomBytes(8).toString("hex");
  beforeAll(async () => migrateToLatest(url ?? ""));
  afterAll(async () => {
    await sql`drop database if exists ${sql.id(name)} with (force)`.execute(db);
    await sql`drop database if exists ${sql.id(mismatchName)} with (force)`.execute(
      db
    );
    await db.destroy();
  });
  it("preserves all tables, microseconds, large JSON numbers and sequences without source writes", async () => {
    await sql`truncate worlds cascade`.execute(db);
    await commitCreateChangeSet(db, createTestChangeSet());
    await commitCreateChangeSet(db, createTestExpansionChangeSet());
    await sql`update world_revisions set committed_at='2026-09-22T10:11:12.123456Z'::timestamptz`.execute(
      db
    );
    await sql`update events set attributes='{"large_number":9007199254740993123}'::jsonb`.execute(
      db
    );
    const before = await captureDatabaseImage(db);
    const inventory = await collectReadOnlyInventory(db);
    expect(inventory.read_only).toBe(true);
    expect(inventory.tables.events!.active).toBeGreaterThan(0);
    expect(databaseImageDigest(await captureDatabaseImage(db))).toBe(
      databaseImageDigest(before)
    );
    expect(
      before.tables.find((t) => t.name === "world_revisions")!.rows_json
    ).toContain(".123456");
    expect(before.tables.find((t) => t.name === "events")!.rows_json).toContain(
      "9007199254740993123"
    );
    const key = randomBytes(32).toString("hex");
    const encrypted = encryptDatabaseImage(before, key);
    expect(encrypted).not.toContain("large_number");
    const restored = await restoreFreshRehearsal(
      url!,
      decryptDatabaseImage(encrypted, key),
      name
    );
    expect(restored.digest).toBe(databaseImageDigest(before));
    await expect(
      restoreFreshRehearsal(
        url!,
        { ...before, schema_json: "{}" },
        mismatchName
      )
    ).rejects.toThrow("rehearsal_schema_mismatch");
    await expect(
      restoreFreshRehearsal(url!, before, name)
    ).rejects.toBeDefined();
    await expect(
      restoreFreshRehearsal(url!, before, "moirai_test")
    ).rejects.toThrow("rehearsal_name_required");
    expect(databaseImageDigest(await captureDatabaseImage(db))).toBe(
      databaseImageDigest(before)
    );
  });
});
