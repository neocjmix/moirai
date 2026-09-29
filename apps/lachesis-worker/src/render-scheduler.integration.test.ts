import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@moirai/persistence";
import type { ObjectStore } from "@moirai/publication";
import { processNextRenderGeneration } from "./render-scheduler.js";

const databaseUrl = process.env.DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "deferred Render canonical target",
  () => {
    it("does not read Render objects while a newer canonical revision is queued", async () => {
      const suffix = randomBytes(6).toString("hex");
      const databaseName = `ip012_render_${suffix}`;
      const admin = createDatabase(databaseUrl!);
      await sql`create database ${sql.id(databaseName)}`.execute(admin);
      const target = new URL(databaseUrl!);
      target.pathname = `/${databaseName}`;
      const db = createDatabase(target.toString());
      const worldId = `01a0f012-0000-7000-8000-${suffix}`;
      try {
        // Only the two tables touched before the target guard are required.
        await sql`create table worlds(id uuid primary key, publication_target_revision integer not null)`.execute(
          db
        );
        await sql`create table world_publication_state(world_id uuid primary key, served_revision integer not null)`.execute(
          db
        );
        await sql`
        insert into worlds(id,publication_target_revision) values (${worldId},59)
      `.execute(db);
        await sql`
        insert into world_publication_state(world_id,served_revision) values (${worldId},58)
      `.execute(db);
        let reads = 0;
        const store: ObjectStore = {
          get: async () => {
            reads++;
            throw Error("intermediate_render_read");
          },
          put: async () => {
            throw Error("intermediate_render_write");
          }
        };
        expect(await processNextRenderGeneration(db, store)).toBe(false);
        expect(reads).toBe(0);
      } finally {
        await db.destroy();
        await sql`drop database ${sql.id(databaseName)}`.execute(admin);
        await admin.destroy();
      }
    });
  }
);
