import type { CreateChangeSet } from "@moirai/contracts";
import { TEST_FIXTURE } from "@moirai/contracts/testing";
import { ChangeSetError } from "@moirai/domain";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestChangeSet,
  createTestExpansionChangeSet
} from "./test-fixture.js";
import {
  claimPublicationJob,
  commitCreateChangeSet,
  completePublicationJob,
  createDatabase,
  getPublicationStatus,
  readWorldAtRevision,
  reconcileSubjectHandleState
} from "./index.js";
import { migrateToLatest } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("Milestone 1 Change Set transaction", () => {
  const db = createDatabase(databaseUrl ?? "");

  beforeAll(async () => migrateToLatest(databaseUrl ?? ""));
  beforeEach(async () => {
    await sql`
      truncate subject_handle_members, subject_handles, publication_outbox,
        world_publication_state, change_operations,
        world_revisions, change_sets, narratives, relations,
        canon_time_systems, time_systems,
        canon_event_memberships, events, canons, worlds cascade
    `.execute(db);
  });
  afterAll(async () => db.destroy());

  it("commits World, Canon, Event, one Revision and outbox atomically", async () => {
    const input = createTestChangeSet();
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
      memberships: number;
      revisions: number;
      jobs: number;
    }>`
      select
        (select count(*)::int from worlds) as worlds,
        (select count(*)::int from canons) as canons,
        (select count(*)::int from events) as events,
        (select count(*)::int from canon_event_memberships) as memberships,
        (select count(*)::int from world_revisions) as revisions,
        (select count(*)::int from publication_outbox) as jobs
    `.execute(db);
    expect(counts.rows[0]).toEqual({
      worlds: 1,
      canons: 1,
      events: 1,
      memberships: 1,
      revisions: 1,
      jobs: 1
    });
    const view = await readWorldAtRevision(db, input.world_id, 1);
    expect(view.world.id).toBe(input.world_id);
    expect(view.canons).toHaveLength(1);
    expect(view.events).toHaveLength(1);
    expect(view.eventCanonMemberships).toEqual([
      { event_id: TEST_FIXTURE.eventId, canon_id: TEST_FIXTURE.canonId }
    ]);
  });

  it("persists the IP-003 overlapping Canon acceptance matrix with one identity per Event", async () => {
    const k2 = "01995c2a-7b00-7000-8000-000000000121";
    const k3 = "01995c2a-7b00-7000-8000-000000000122";
    const b = "01995c2a-7b00-7000-8000-000000000123";
    const c = "01995c2a-7b00-7000-8000-000000000124";
    const d = "01995c2a-7b00-7000-8000-000000000125";
    const base = createTestChangeSet();
    const event = (id: string, title: string) =>
      ({
        kind: "create",
        entity_type: "event",
        entity_id: id,
        value: {
          world_id: TEST_FIXTURE.worldId,
          kind: "atomic",
          title,
          roles: [],
          attributes: {}
        }
      }) as const;
    const membership = (eventId: string, canonId: string) =>
      ({
        kind: "add",
        entity_type: "event_canon_membership",
        value: { event_id: eventId, canon_id: canonId }
      }) as const;
    const input: CreateChangeSet = {
      ...base,
      operations: [
        ...base.operations,
        {
          kind: "create",
          entity_type: "canon",
          entity_id: k2,
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "k2",
            title: "K2"
          }
        },
        {
          kind: "create",
          entity_type: "canon",
          entity_id: k3,
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "k3",
            title: "K3"
          }
        },
        membership(TEST_FIXTURE.eventId, k2),
        event(b, "B"),
        membership(b, TEST_FIXTURE.canonId),
        membership(b, k2),
        membership(b, k3),
        event(c, "C"),
        membership(c, k2),
        event(d, "D"),
        membership(d, k3)
      ]
    };

    await commitCreateChangeSet(db, input);
    const counts = await sql<{
      events: number;
      event_ids: number;
      memberships: number;
      orphans: number;
    }>`
      select
        (select count(*)::int from events where withdrawn_revision is null) as events,
        (select count(distinct id)::int from events where withdrawn_revision is null) as event_ids,
        (select count(*)::int from canon_event_memberships where withdrawn_revision is null) as memberships,
        (select count(*)::int from events e where e.withdrawn_revision is null and not exists (
          select 1 from canon_event_memberships m
          where m.event_id = e.id and m.withdrawn_revision is null
        )) as orphans
    `.execute(db);
    expect(counts.rows[0]).toEqual({
      events: 4,
      event_ids: 4,
      memberships: 7,
      orphans: 0
    });

    const view = await readWorldAtRevision(db, input.world_id, 1);
    expect(view.events.map((item) => item.id).sort()).toEqual(
      [TEST_FIXTURE.eventId, b, c, d].sort()
    );
    expect(view.eventCanonMemberships).toEqual(
      [
        membership(TEST_FIXTURE.eventId, TEST_FIXTURE.canonId).value,
        membership(TEST_FIXTURE.eventId, k2).value,
        membership(b, TEST_FIXTURE.canonId).value,
        membership(b, k2).value,
        membership(b, k3).value,
        membership(c, k2).value,
        membership(d, k3).value
      ].sort((left, right) =>
        `${left.event_id}:${left.canon_id}`.localeCompare(
          `${right.event_id}:${right.canon_id}`
        )
      )
    );
  });

  it("rejects orphaning and duplicate membership while allowing explicit withdrawal", async () => {
    const input = createTestChangeSet();
    await commitCreateChangeSet(db, input);
    const membershipValue = {
      event_id: TEST_FIXTURE.eventId,
      canon_id: TEST_FIXTURE.canonId
    };
    const change = (
      changeSetId: string,
      operations: CreateChangeSet["operations"]
    ): CreateChangeSet => ({
      ...input,
      change_set_id: changeSetId,
      expected_revision: 1,
      operations
    });

    await expect(
      commitCreateChangeSet(
        db,
        change("01995c2a-7b00-7000-8000-000000000126", [
          {
            kind: "add",
            entity_type: "event_canon_membership",
            value: membershipValue
          }
        ])
      )
    ).rejects.toMatchObject({ code: "duplicate_canon_membership" });
    await expect(
      commitCreateChangeSet(
        db,
        change("01995c2a-7b00-7000-8000-000000000127", [
          {
            kind: "remove",
            entity_type: "event_canon_membership",
            value: membershipValue
          }
        ])
      )
    ).rejects.toMatchObject({ code: "event_canon_membership_required" });

    await expect(
      db.transaction().execute(async (transaction) => {
        await transaction
          .updateTable("canon_event_memberships")
          .set({ withdrawn_revision: 2, updated_revision: 2 })
          .where("event_id", "=", TEST_FIXTURE.eventId)
          .where("canon_id", "=", TEST_FIXTURE.canonId)
          .execute();
      })
    ).rejects.toThrow(/active Event .* at least one active Canon membership/);

    await commitCreateChangeSet(
      db,
      change("01995c2a-7b00-7000-8000-000000000128", [
        {
          kind: "withdraw",
          entity_type: "event",
          value: { event_id: TEST_FIXTURE.eventId }
        },
        {
          kind: "remove",
          entity_type: "event_canon_membership",
          value: membershipValue
        }
      ])
    );
    const state = await sql<{ events: number; memberships: number }>`
      select
        (select count(*)::int from events where withdrawn_revision is null) as events,
        (select count(*)::int from canon_event_memberships where withdrawn_revision is null) as memberships
    `.execute(db);
    expect(state.rows[0]).toEqual({ events: 0, memberships: 0 });
    await expect(
      readWorldAtRevision(db, input.world_id, 2)
    ).resolves.toMatchObject({ events: [], eventCanonMemberships: [] });
  });

  it("returns the original result for the same digest without duplicates", async () => {
    const input = createTestChangeSet();
    await commitCreateChangeSet(db, input);
    const replay = await commitCreateChangeSet(db, input);
    expect(replay.idempotent_replay).toBe(true);
    const revisions = await sql<{ count: number }>`
      select count(*)::int as count from world_revisions
    `.execute(db);
    expect(revisions.rows[0]?.count).toBe(1);
  });

  it("atomically expands one World with client refs, Events, Relations, time and Narrative", async () => {
    await commitCreateChangeSet(db, createTestChangeSet());
    const expansion = createTestExpansionChangeSet();
    const result = await commitCreateChangeSet(db, expansion);
    expect(result).toMatchObject({
      current_revision: 2,
      publication_target_revision: 2,
      served_revision: 0,
      idempotent_replay: false,
      warnings: [],
      id_mapping: {
        "test-time": TEST_FIXTURE.timeSystemId,
        "second-event": TEST_FIXTURE.secondEventId,
        "third-event": TEST_FIXTURE.thirdEventId
      }
    });
    const counts = await sql<{
      events: number;
      relations: number;
      narratives: number;
      revisions: number;
      jobs: number;
    }>`
      select
        (select count(*)::int from events) as events,
        (select count(*)::int from relations) as relations,
        (select count(*)::int from narratives) as narratives,
        (select count(*)::int from world_revisions) as revisions,
        (select count(*)::int from publication_outbox) as jobs
    `.execute(db);
    expect(counts.rows[0]).toEqual({
      events: 3,
      relations: 2,
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
    await commitCreateChangeSet(db, createTestChangeSet());
    const expansion = createTestExpansionChangeSet();
    const dangling: CreateChangeSet = {
      ...expansion,
      operations: expansion.operations.map((operation) =>
        operation.kind === "create" &&
        operation.entity_type === "relation" &&
        operation.value.type === "causes"
          ? {
              ...operation,
              value: {
                ...operation.value,
                target_ref: {
                  kind: "event" as const,
                  event_id: "01995c2a-7b00-7000-8000-000000000099"
                }
              }
            }
          : operation
      )
    };
    await expect(commitCreateChangeSet(db, dangling)).rejects.toMatchObject({
      code: "dangling_reference",
      path: "operations.6.value.target_ref"
    });

    const crossCanon: CreateChangeSet = {
      ...expansion,
      operations: [
        ...expansion.operations.slice(0, 6),
        {
          kind: "create",
          entity_type: "canon",
          entity_id: "01995c2a-7b00-7000-8000-000000000091",
          client_ref: "other-canon",
          value: {
            world_id: TEST_FIXTURE.worldId,
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
            world_id: TEST_FIXTURE.worldId,
            kind: "atomic",
            title: "Other Event",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "add",
          entity_type: "event_canon_membership",
          value: {
            event_id: { client_ref: "other-event" },
            canon_id: { client_ref: "other-canon" }
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: "01995c2a-7b00-7000-8000-000000000093",
          value: {
            world_id: TEST_FIXTURE.worldId,
            type: "causes",
            source_ref: {
              kind: "event",
              event_id: TEST_FIXTURE.eventId
            },
            target_ref: { kind: "event", client_ref: "other-event" },
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "add",
          entity_type: "relation_canon_membership",
          value: {
            relation_id: "01995c2a-7b00-7000-8000-000000000093",
            canon_id: TEST_FIXTURE.canonId
          }
        }
      ]
    };
    await expect(commitCreateChangeSet(db, crossCanon)).rejects.toMatchObject({
      code: "cross_canon_relation"
    });
    const state = await getPublicationStatus(db, TEST_FIXTURE.worldId);
    expect(state?.currentRevision).toBe(1);
    const relationCount = await sql<{ count: number }>`
      select count(*)::int as count from relations
    `.execute(db);
    expect(relationCount.rows[0]?.count).toBe(0);
  });

  it("preserves conflict and timeout retry semantics on an existing World", async () => {
    await commitCreateChangeSet(db, createTestChangeSet());
    const expansion = createTestExpansionChangeSet();
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
    const input = createTestChangeSet();
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
    const input = createTestChangeSet();
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

  it("persists and reuses stable Subject handles for identity components", async () => {
    await commitCreateChangeSet(db, createTestChangeSet());
    const expansion = createTestExpansionChangeSet();
    await commitCreateChangeSet(db, expansion);
    await commitCreateChangeSet(db, {
      contract_version: expansion.contract_version,
      change_set_id: "01995c2a-7b00-7000-8000-000000000012",
      world_id: TEST_FIXTURE.worldId,
      expected_revision: 2,
      actor: "test-actor",
      intent: "Connect two observations as one derived Subject",
      operations: [
        {
          kind: "create",
          entity_type: "relation",
          entity_id: TEST_FIXTURE.identityRelationId,
          value: {
            world_id: TEST_FIXTURE.worldId,
            type: "identity_continues",
            source_ref: {
              kind: "event",
              event_id: TEST_FIXTURE.eventId
            },
            target_ref: {
              kind: "event",
              event_id: TEST_FIXTURE.secondEventId
            },
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "add",
          entity_type: "relation_canon_membership",
          value: {
            relation_id: TEST_FIXTURE.identityRelationId,
            canon_id: TEST_FIXTURE.canonId
          }
        }
      ],
      origins: [
        {
          kind: "system_derived",
          summary: "Test Subject reconciliation fixture"
        }
      ]
    });
    const view = await readWorldAtRevision(db, TEST_FIXTURE.worldId, 3);
    const first = await reconcileSubjectHandleState(db, view, 3);
    const replay = await reconcileSubjectHandleState(db, view, 3);

    expect(first).toEqual(replay);
    expect(first.handles).toHaveLength(1);
    expect(first.projections[0]?.member_event_ids).toEqual([
      TEST_FIXTURE.eventId,
      TEST_FIXTURE.secondEventId
    ]);
    const counts = await sql<{ handles: number; members: number }>`
      select
        (select count(*)::int from subject_handles) as handles,
        (select count(*)::int from subject_handle_members) as members
    `.execute(db);
    expect(counts.rows[0]).toEqual({ handles: 1, members: 2 });
  });
});
