import { SYNTHETIC_FIXTURE, type CreateChangeSet } from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createSyntheticChangeSet,
  createSyntheticExpansionChangeSet
} from "./bootstrap.js";
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
        world_revisions, change_sets, narratives, relations,
        event_temporal_placements, canon_time_systems, time_systems,
        events, canons, worlds cascade
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

  it("atomically expands one World with client refs, Events, Relations, time and Narrative", async () => {
    await commitCreateChangeSet(db, createSyntheticChangeSet());
    const expansion = createSyntheticExpansionChangeSet();
    const result = await commitCreateChangeSet(db, expansion);
    expect(result).toMatchObject({
      current_revision: 2,
      publication_target_revision: 2,
      served_revision: 0,
      idempotent_replay: false,
      warnings: [],
      id_mapping: {
        "ember-time": SYNTHETIC_FIXTURE.timeSystemId,
        "eastern-answer": SYNTHETIC_FIXTURE.secondEventId,
        "archive-opens": SYNTHETIC_FIXTURE.thirdEventId
      }
    });
    const counts = await sql<{
      events: number;
      relations: number;
      placements: number;
      narratives: number;
      revisions: number;
      jobs: number;
    }>`
      select
        (select count(*)::int from events) as events,
        (select count(*)::int from relations) as relations,
        (select count(*)::int from event_temporal_placements) as placements,
        (select count(*)::int from narratives) as narratives,
        (select count(*)::int from world_revisions) as revisions,
        (select count(*)::int from publication_outbox) as jobs
    `.execute(db);
    expect(counts.rows[0]).toEqual({
      events: 3,
      relations: 2,
      placements: 3,
      narratives: 2,
      revisions: 2,
      jobs: 2
    });
    const view = await readWorldAtRevision(db, expansion.world_id, 2);
    expect(view.events).toHaveLength(3);
    expect(view.relations).toHaveLength(2);
    expect(view.narratives).toHaveLength(2);
  });

  it("rejects dangling and cross-Canon Relations without partial writes", async () => {
    await commitCreateChangeSet(db, createSyntheticChangeSet());
    const expansion = createSyntheticExpansionChangeSet();
    const dangling: CreateChangeSet = {
      ...expansion,
      operations: expansion.operations.map((operation) =>
        operation.entity_type === "relation" &&
        operation.value.type === "causes"
          ? {
              ...operation,
              value: {
                ...operation.value,
                target_event_id: "01995c2a-7b00-7000-8000-000000000099"
              }
            }
          : operation
      )
    };
    await expect(commitCreateChangeSet(db, dangling)).rejects.toMatchObject({
      code: "dangling_reference",
      path: "operations.7"
    });

    const crossCanon: CreateChangeSet = {
      ...expansion,
      operations: [
        ...expansion.operations.slice(0, 4),
        {
          kind: "create",
          entity_type: "canon",
          entity_id: "01995c2a-7b00-7000-8000-000000000091",
          client_ref: "other-canon",
          value: {
            world_id: SYNTHETIC_FIXTURE.worldId,
            slug: "other-canon",
            title: "Other Canon"
          }
        },
        {
          kind: "create",
          entity_type: "event",
          entity_id: "01995c2a-7b00-7000-8000-000000000092",
          client_ref: "other-event",
          value: {
            canon_id: { client_ref: "other-canon" },
            kind: "atomic",
            title: "Other Event",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: "01995c2a-7b00-7000-8000-000000000093",
          value: {
            canon_id: SYNTHETIC_FIXTURE.canonId,
            type: "causes",
            source_event_id: SYNTHETIC_FIXTURE.eventId,
            target_event_id: { client_ref: "other-event" },
            direction: "directed",
            attributes: {}
          }
        }
      ]
    };
    await expect(commitCreateChangeSet(db, crossCanon)).rejects.toMatchObject({
      code: "cross_canon_relation"
    });
    const state = await getPublicationStatus(db, SYNTHETIC_FIXTURE.worldId);
    expect(state?.currentRevision).toBe(1);
    const relationCount = await sql<{ count: number }>`
      select count(*)::int as count from relations
    `.execute(db);
    expect(relationCount.rows[0]?.count).toBe(0);
  });

  it("preserves conflict and timeout retry semantics on an existing World", async () => {
    await commitCreateChangeSet(db, createSyntheticChangeSet());
    const expansion = createSyntheticExpansionChangeSet();
    await commitCreateChangeSet(db, expansion);
    const replay = await commitCreateChangeSet(db, expansion);
    expect(replay.idempotent_replay).toBe(true);
    await expect(
      commitCreateChangeSet(db, {
        ...expansion,
        change_set_id: "01995c2a-7b00-7000-8000-000000000090"
      })
    ).rejects.toMatchObject({
      code: "revision_conflict",
      retryable: true,
      recovery: { action: "refresh_context", current_revision: 2 }
    });
    const revisions = await sql<{ count: number }>`
      select count(*)::int as count from world_revisions
    `.execute(db);
    expect(revisions.rows[0]?.count).toBe(2);
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
