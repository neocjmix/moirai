import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../index.js";
import { migrateToVersion } from "../migrate.js";
import { finalize, prepare } from "./010_ip011_collections.js";

const source = process.env.DATABASE_URL;
const suite = source ? describe : describe.skip;
suite("IP-011 isolated v5 schema constraints", () => {
  const name = `ip011_schema_${randomBytes(8).toString("hex")}`;
  let db: ReturnType<typeof createDatabase>;
  const world = "019f5000-1100-7000-8000-000000000001";
  const collection = "019f5000-1100-7000-8000-000000000002";
  const event = "019f5000-1100-7000-8000-000000000003";
  const narrative = "019f5000-1100-7000-8000-000000000004";
  beforeAll(async () => {
    const admin = createDatabase(source!);
    try {
      await sql`create database ${sql.id(name)}`.execute(admin);
    } finally {
      await admin.destroy();
    }
    const target = new URL(source!);
    target.pathname = `/${name}`;
    await migrateToVersion(target.toString(), "009_ip003_relation_memberships");
    db = createDatabase(target.toString());
    await db.transaction().execute(async (tx) => {
      await prepare(tx);
      await finalize(tx);
    });
    await sql`insert into worlds(id,slug,title,description,current_revision,publication_target_revision,created_revision,updated_revision) values (${world},'history','History',null,1,1,1,1)`.execute(
      db
    );
  });
  afterAll(async () => {
    await db?.destroy();
    if (source) {
      const admin = createDatabase(source);
      try {
        await sql`drop database if exists ${sql.id(name)} with (force)`.execute(
          admin
        );
      } finally {
        await admin.destroy();
      }
    }
  });
  const createEvent = async (tx: typeof db) => {
    await sql`insert into events(id,world_id,slug,title,summary,roles,attributes,created_revision,updated_revision) values (${event},${world},null,'Event',null,'[]','{}',1,1)`.execute(
      tx
    );
  };
  const createNarrative = async (tx: typeof db, id = narrative) => {
    await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,title,body,public_references,notes,created_revision,updated_revision) values (${id},${world},'event',${event},'ko',null,'Reader account','[]','[]',1,1)`.execute(
      tx
    );
  };
  it("requires a Narrative at transaction end and permits zero Collection membership", async () => {
    await expect(db.transaction().execute(createEvent)).rejects.toThrow();
    await db.transaction().execute(async (tx) => {
      await createEvent(tx);
      await createNarrative(tx);
    });
    const count = await sql<{
      count: string;
    }>`select count(*)::text as count from collection_event_memberships where event_id = ${event}`.execute(
      db
    );
    expect(count.rows[0]?.count).toBe("0");
  });
  it("rejects a second active Narrative, lone Narrative withdrawal and owner reassignment", async () => {
    await expect(
      createNarrative(db, "019f5000-1100-7000-8000-000000000005")
    ).rejects.toThrow();
    await expect(
      sql`update narratives set withdrawn_revision = 2 where id = ${narrative}`.execute(
        db
      )
    ).rejects.toThrow();
    await expect(
      sql`update narratives set scope_id = ${collection} where id = ${narrative}`.execute(
        db
      )
    ).rejects.toThrow();
  });
  it("requires both explicit policy identity fields for v5 history", async () => {
    await expect(
      sql`insert into change_sets(id,world_id,request_digest,actor,intent,contract_version,origins,result,policy_version,policy_digest) values ('019f5000-1100-7000-8000-000000000006',${world},'digest','test','test','5','[]','{}','v5/1',null)`.execute(
        db
      )
    ).rejects.toThrow();
  });
  it("accepts explicit owner and Narrative withdrawal together", async () => {
    await db.transaction().execute(async (tx) => {
      await sql`update narratives set withdrawn_revision = 2 where id = ${narrative}`.execute(
        tx
      );
      await sql`update events set withdrawn_revision = 2 where id = ${event}`.execute(
        tx
      );
    });
  });
});
