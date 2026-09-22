import { TEST_FIXTURE } from "@moirai/contracts/testing";
import type { CreateChangeSet } from "@moirai/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import {
  commitCreateChangeSet,
  createDatabase,
  profileCanonicalRead,
  queryClotho
} from "./index.js";
import { migrateToLatest } from "./migrate.js";
import { createTestChangeSet } from "./test-fixture.js";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)(
  "IP-011 database read baseline (disposable test DB)",
  () => {
    const db = createDatabase(url ?? "");
    beforeAll(async () => migrateToLatest(url ?? ""));
    afterAll(async () => db.destroy());
    it("separates query, history fold, and serialized bounded-search costs", async () => {
      // Same destructive isolation as the integration suite; never production.
      await sql`truncate worlds cascade`.execute(db);
      const base = createTestChangeSet();
      await commitCreateChangeSet(db, base);
      let revision = 1;
      let previousRows = 0;
      for (const scale of [100, 1000]) {
        const operations: CreateChangeSet["operations"][number][] = [];
        const first = scale === 100 ? 1 : 100;
        for (let i = first; i < scale; i++) {
          const id = `01995c2a-7b00-7000-8001-${i.toString(16).padStart(12, "0")}`;
          operations.push(
            {
              kind: "create",
              entity_type: "event",
              entity_id: id,
              value: {
                world_id: base.world_id,
                kind: "atomic",
                title: `Synthetic observation ${i}`,
                roles: [],
                attributes: {}
              }
            },
            {
              kind: "add",
              entity_type: "event_canon_membership",
              value: {
                event_id: id,
                canon_id: TEST_FIXTURE.canonId
              }
            }
          );
        }
        await commitCreateChangeSet(db, {
          ...base,
          change_set_id: `01995c2a-7b00-7000-8002-${scale.toString(16).padStart(12, "0")}`,
          expected_revision: revision++,
          operations
        });
        const samples = [];
        for (let i = 0; i < 6; i++) {
          const measured = await profileCanonicalRead(() =>
            queryClotho(
              db,
              "event.search",
              {
                world_id: base.world_id,
                canon_id: TEST_FIXTURE.canonId,
                query: "Synthetic",
                limit: 1
              },
              [base.world_id]
            )
          );
          expect(measured.metrics.history_rows).toBeGreaterThan(previousRows);
          expect(measured.metrics.queries).toBeGreaterThanOrEqual(2);
          samples.push({
            ...measured.metrics,
            payload_bytes: Buffer.byteLength(JSON.stringify(measured.value))
          });
        }
        previousRows = samples[0]!.history_rows;
        console.info(
          JSON.stringify({
            ip011_database: {
              scale,
              cache:
                "first query then five repeats; PostgreSQL buffers not flushed",
              samples
            }
          })
        );
      }
    });
  }
);
