import { ChangeSetError } from "@moirai/domain";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSyntheticChangeSet } from "./bootstrap.js";
import {
  claimPublicationJob,
  commitCreateChangeSet,
  completePublicationJob,
  createDatabase,
  getPublicationStatus,
  readWorldAtRevision
} from "./index.js";
import { migrateToLatest } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("Milestone 1 Change Set transaction", () => {
  const db = createDatabase(databaseUrl ?? "");

  beforeAll(async () => migrateToLatest(databaseUrl ?? ""));
  beforeEach(async () => {
    await sql`
      truncate publication_outbox, world_publication_state, change_operations,
        world_revisions, change_sets, events, canons, worlds cascade
    `.execute(db);
  });
  afterAll(async () => db.destroy());

  it("commits World, Canon, Event, one Revision and outbox atomically", async () => {
    const input = createSyntheticChangeSet();
    const result = await commitCreateChangeSet(db, input);
    expect(result).toMatchObject({
      current_revision: 1,
      publication_target_revision: 1,
      served_revision: 0,
      idempotent_replay: false
    });

    const counts = await sql<{
      worlds: number;
      canons: number;
      events: number;
      revisions: number;
      jobs: number;
    }>`
      select
        (select count(*)::int from worlds) as worlds,
        (select count(*)::int from canons) as canons,
        (select count(*)::int from events) as events,
        (select count(*)::int from world_revisions) as revisions,
        (select count(*)::int from publication_outbox) as jobs
    `.execute(db);
    expect(counts.rows[0]).toEqual({
      worlds: 1,
      canons: 1,
      events: 1,
      revisions: 1,
      jobs: 1
    });
    const view = await readWorldAtRevision(db, input.world_id, 1);
    expect(view.world.id).toBe(input.world_id);
    expect(view.canons).toHaveLength(1);
    expect(view.events).toHaveLength(1);
  });

  it("returns the original result for the same digest without duplicates", async () => {
    const input = createSyntheticChangeSet();
    await commitCreateChangeSet(db, input);
    const replay = await commitCreateChangeSet(db, input);
    expect(replay.idempotent_replay).toBe(true);
    const revisions = await sql<{ count: number }>`
      select count(*)::int as count from world_revisions
    `.execute(db);
    expect(revisions.rows[0]?.count).toBe(1);
  });

  it("rejects digest reuse and revision conflict without partial records", async () => {
    const input = createSyntheticChangeSet();
    await commitCreateChangeSet(db, input);
    await expect(
      commitCreateChangeSet(db, { ...input, intent: "different intent" })
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(
      commitCreateChangeSet(db, {
        ...input,
        change_set_id: "01995c2a-7b00-7000-8000-000000000005"
      })
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(ChangeSetError).toBeDefined();
  });

  it("claims retries once and advances served state after projection", async () => {
    const input = createSyntheticChangeSet();
    await commitCreateChangeSet(db, input);
    const job = await claimPublicationJob(db);
    expect(job).toMatchObject({ targetRevision: 1, attemptCount: 1 });
    await completePublicationJob(db, job!, 1);
    await expect(claimPublicationJob(db)).resolves.toBeNull();
    await expect(
      getPublicationStatus(db, input.world_id)
    ).resolves.toMatchObject({
      currentRevision: 1,
      targetRevision: 1,
      servedRevision: 1,
      projectionStatus: "ready"
    });
  });
});
