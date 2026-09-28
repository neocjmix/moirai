import { queryV5Authoring } from "./v5-authoring-query.js";
import { validateV5Resolved, commitV5Resolved } from "./v5-change.js";
import {
  V5_AUTHORING_POLICY,
  type ResolvedV5Change
} from "@moirai/contracts/v5";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "./index.js";
import { migrateToVersion } from "./migrate.js";
import { finalize, prepare } from "./cutovers/010_ip011_collections.js";
import { up } from "./cutovers/011_ip011_authoring_search.js";
import { searchV5WorldEvents } from "./v5-authoring-search.js";
import { getV5EventEvidence } from "./v5-authoring-detail.js";

const source = process.env.DATABASE_URL;
const suite = source ? describe : describe.skip;
suite("IP-011 isolated v5 pre-write World candidate search", () => {
  const name = `ip011_search_${randomBytes(8).toString("hex")}`;
  const world = "019f5000-1100-7000-8000-000000000001";
  const other = "019f5000-1100-7000-8000-000000000002";
  const first = "019f5000-1100-7000-8000-000000000011";
  const second = "019f5000-1100-7000-8000-000000000012";
  let db: ReturnType<typeof createDatabase>;
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
      await up(tx);
    });
    await sql`insert into worlds(id,slug,title,current_revision,publication_target_revision,created_revision,updated_revision)
      values (${world},'history','History',31,31,1,31),(${other},'fiction','Fiction',31,31,1,31)`.execute(
      db
    );
    // The owner Narrative invariant is deferred, so seed each Event and its
    // Narrative in the same transaction exactly as the v5 writer does.
    await db.transaction().execute(async (tx) => {
      for (const [id, worldId, title] of [
        [first, world, "Dan%jong Deposition"],
        [second, world, "Dan%jong Restoration"],
        ["019f5000-1100-7000-8000-000000000013", other, "Dan%jong Fiction"]
      ]) {
        await sql`insert into events(id,world_id,slug,title,summary,roles,attributes,created_revision,updated_revision)
          values (${id},${worldId},null,${title},null,'[]','{}',31,31)`.execute(
          tx
        );
        await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,body,public_references,notes,created_revision,updated_revision)
          values (${id},${worldId},'event',${id},'ko','Reader account','[]','[]',31,31)`.execute(
          tx
        );
      }
    });
    await sql`update events set summary = ${"s".repeat(5000)} where id = ${first}`.execute(
      db
    );
  });
  it("discovers authorized Worlds and rejects cross-query cursors/revision drift", async () => {
    const result = (await queryV5Authoring(
      db,
      "world.list",
      { contract_version: 5 },
      [world]
    )) as { items: { id: string }[] };
    expect(result.items.map((v) => v.id)).toEqual([world]);
    await expect(
      queryV5Authoring(
        db,
        "world.get",
        { contract_version: 5, world_id: other },
        [world]
      )
    ).rejects.toMatchObject({ code: "forbidden" });
    const input = {
      contract_version: 5,
      world_id: world,
      seed_ids: [first, second],
      collection_ids: [],
      limit: 1
    };
    const page = (await queryV5Authoring(db, "context.slice", input, [
      world
    ])) as { continuation: string; items: { id: string }[] };
    expect(page.items.map((v) => v.id)).toEqual([first]);
    expect(page.continuation).toBeTruthy();
    const next = (await queryV5Authoring(
      db,
      "context.slice",
      { ...input, cursor: page.continuation },
      [world]
    )) as { items: { id: string }[] };
    expect(next.items.map((v) => v.id)).toEqual([second]);
    await expect(
      queryV5Authoring(
        db,
        "context.slice",
        { ...input, seed_ids: [first], cursor: page.continuation },
        [world]
      )
    ).rejects.toMatchObject({ code: "invalid_cursor" });
    await expect(
      queryV5Authoring(
        db,
        "world.get",
        { contract_version: 5, world_id: world, at_revision: 30 },
        [world]
      )
    ).rejects.toMatchObject({ code: "revision_conflict" });
  });
  it("reads Collection membership, World systems, neighbors and complete content", async () => {
    const collection = "019f5000-1100-7000-8000-000000000080";
    await db.transaction().execute(async (tx) => {
      await sql`insert into collections(id,world_id,slug,title,description,created_revision,updated_revision) values (${collection},${world},'selection','Selection',null,31,31)`.execute(
        tx
      );
      await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,body,public_references,notes,created_revision,updated_revision) values (${collection},${world},'collection',${collection},'ko','Collection account','[]','[]',31,31)`.execute(
        tx
      );
      for (const event of [first, second])
        await sql`insert into collection_event_memberships(id,world_id,collection_id,event_id,created_revision,updated_revision) values (${event},${world},${collection},${event},31,31)`.execute(
          tx
        );
    });
    try {
      const input = { contract_version: 5, world_id: world };
      expect(
        await queryV5Authoring(db, "world.get", input, [world])
      ).toMatchObject({
        world: { current_revision: 31 },
        item_type: "time_system",
        items: []
      });
      expect(
        await queryV5Authoring(db, "collection.list", input, [world])
      ).toMatchObject({ items: [{ id: collection }] });
      expect(
        await queryV5Authoring(
          db,
          "collection.get",
          { ...input, collection_id: collection, limit: 1 },
          [world]
        )
      ).toMatchObject({
        items: [{ id: first }],
        truncated: true,
        narrative: { body: "Collection account" }
      });
      expect(
        await queryV5Authoring(
          db,
          "context.slice",
          { ...input, seed_ids: [first], collection_ids: [collection] },
          [world]
        )
      ).toMatchObject({
        items: [{ id: first }, { id: second }],
        matched_memberships: [
          { event_id: first, collection_id: collection },
          { event_id: second, collection_id: collection }
        ]
      });
      expect(
        await queryV5Authoring(
          db,
          "event.neighbors",
          { ...input, event_id: first },
          [world]
        )
      ).toMatchObject({ items: [], depth: 1 });
      expect(
        await queryV5Authoring(db, "world.export", input, [world])
      ).toMatchObject({
        completeness: "complete",
        format_version: 5,
        snapshot: { events: [{ id: first }, { id: second }] }
      });
      await expect(
        queryV5Authoring(
          db,
          "time-event.resolve",
          {
            ...input,
            time_system_id: other,
            definition_version: "1",
            coordinate: "1592"
          },
          [world]
        )
      ).rejects.toMatchObject({ code: "not_found" });
    } finally {
      await db.transaction().execute(async (tx) => {
        await sql`delete from collection_event_memberships where collection_id=${collection}`.execute(
          tx
        );
        await sql`delete from narratives where id=${collection}`.execute(tx);
        await sql`delete from collections where id=${collection}`.execute(tx);
      });
    }
  });
  it("validates with full rollback, then commits the same plan exactly once", async () => {
    await sql`insert into kysely_migration(name,timestamp) values ('010_ip011_collections','2026-01-01T00:00:00.000Z') on conflict do nothing`.execute(
      db
    );
    const plan: ResolvedV5Change = {
      change_set_id: "019f5000-1100-7000-8000-000000000090",
      world_id: world,
      actor: world,
      expected_revision: 31,
      intent: "Synthetic validation rollback",
      origins: [{ kind: "human_instruction", summary: "Synthetic" }],
      policy_version: V5_AUTHORING_POLICY.policy_version,
      policy_digest: V5_AUTHORING_POLICY.policy_digest,
      operations: [
        {
          kind: "update",
          entity_type: "event",
          entity_id: first,
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: world,
            slug: null,
            title: "Dan%jong Deposition validated",
            summary: null,
            roles: [],
            attributes: {}
          }
        }
      ]
    };
    const before = (
      await sql`select title from events where id=${first}`.execute(db)
    ).rows;
    expect(await validateV5Resolved(db, plan)).toMatchObject({
      valid: true,
      provisional: true,
      source_revision: 31,
      candidate_revision: 32
    });
    expect(
      (await sql`select title from events where id=${first}`.execute(db)).rows
    ).toEqual(before);
    expect(
      (
        await sql`select id from change_sets where id=${plan.change_set_id}`.execute(
          db
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await sql`select id from publication_outbox where change_set_id=${plan.change_set_id}`.execute(
          db
        )
      ).rows
    ).toHaveLength(0);
    expect(
      (
        await sql<{
          current_revision: number;
        }>`select current_revision from worlds where id=${world}`.execute(db)
      ).rows[0]!.current_revision
    ).toBe(31);
    await expect(
      validateV5Resolved(db, { ...plan, policy_digest: "0".repeat(64) })
    ).rejects.toMatchObject({ code: "authoring_policy_mismatch" });
    // Use the other World to keep subsequent search tests at their fixed revision.
    const otherEvent = "019f5000-1100-7000-8000-000000000013";
    const commitPlan = {
      ...plan,
      world_id: other,
      operations: [
        {
          ...plan.operations[0]!,
          entity_id: otherEvent,
          value: {
            world_id: other,
            slug: null,
            title: "Dan%jong Fiction",
            summary: "Validated",
            roles: [],
            attributes: {}
          }
        }
      ]
    } as ResolvedV5Change;
    expect(await validateV5Resolved(db, commitPlan)).toMatchObject({
      valid: true
    });
    expect(await commitV5Resolved(db, commitPlan)).toMatchObject({
      current_revision: 32,
      idempotent_replay: false
    });
    expect(await commitV5Resolved(db, commitPlan)).toMatchObject({
      current_revision: 32,
      idempotent_replay: true
    });
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
  it("inspects one World Event and its owner Narrative, Collection and neighbor at a pinned Revision", async () => {
    const collection = "019f5000-1100-7000-8000-000000000021";
    await db.transaction().execute(async (tx) => {
      await sql`insert into collections(id,world_id,slug,title,created_revision,updated_revision)
        values (${collection},${world},'joseon','Joseon',31,31)`.execute(tx);
      await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,body,public_references,notes,created_revision,updated_revision)
        values (${collection},${world},'collection',${collection},'ko','Collection account','[]','[]',31,31)`.execute(
        tx
      );
      await sql`insert into collection_event_memberships(id,world_id,collection_id,event_id,created_revision,updated_revision)
        values ('019f5000-1100-7000-8000-000000000022',${world},${collection},${first},31,31)`.execute(
        tx
      );
      await sql`insert into relations(id,world_id,type,source_ref,target_ref,direction,attributes,created_revision,updated_revision)
        values ('019f5000-1100-7000-8000-000000000023',${world},'precedes',
          ${JSON.stringify({ kind: "event", event_id: first })}::jsonb,
          ${JSON.stringify({ kind: "event", event_id: second })}::jsonb,
          'directed','{}',31,31)`.execute(tx);
      for (let i = 0; i < 17; i++) {
        const id = `019f5000-1100-7000-8000-0000000000${(100 + i).toString(16)}`;
        await sql`insert into relations(id,world_id,type,source_ref,target_ref,direction,attributes,created_revision,updated_revision)
          values (${id},${world},'influences',
            ${JSON.stringify({ kind: "event", event_id: first })}::jsonb,
            ${JSON.stringify({ kind: "event", event_id: second })}::jsonb,
            'directed','{}',31,31)`.execute(tx);
      }
    });
    const detail = await getV5EventEvidence(db, {
      world_id: world,
      event_id: first,
      at_revision: 31
    });
    expect(detail.narrative.body).toBe("Reader account");
    expect(detail.memberships.map((m) => m.collection_id)).toEqual([
      collection
    ]);
    expect(detail.relations).toHaveLength(16);
    expect(detail.relations[0]?.type).toBe("precedes");
    expect(detail.neighbors.map((neighbor) => neighbor.id)).toEqual([second]);
    expect(detail.next_cursor).toBeTruthy();
    const next = await getV5EventEvidence(db, {
      world_id: world,
      event_id: first,
      at_revision: 31,
      cursor: detail.next_cursor
    });
    expect(next.relations).toHaveLength(2);
    expect(next.memberships).toHaveLength(0);
    expect(next.next_cursor).toBeNull();
    expect(
      new Set([...detail.relations, ...next.relations].map((r) => r.id)).size
    ).toBe(18);
    await expect(
      getV5EventEvidence(db, {
        world_id: world,
        event_id: second,
        at_revision: 31,
        cursor: detail.next_cursor
      })
    ).rejects.toThrow("v5_detail_cursor_invalid");
    await expect(
      getV5EventEvidence(db, {
        world_id: other,
        event_id: first,
        at_revision: 32
      })
    ).rejects.toThrow("v5_detail_event_missing");
    await expect(
      getV5EventEvidence(db, {
        world_id: world,
        event_id: first,
        at_revision: 30
      })
    ).rejects.toThrow("v5_detail_revision_changed");
    const refs = Array.from({ length: 9 }, (_, i) => ({
      label: `Source ${i}`,
      url: `https://example.test/${i}`
    }));
    await sql`update narratives set body = ${"😀".repeat(13000)}, public_references = ${JSON.stringify(refs)}::jsonb where scope_type = 'event' and scope_id = ${first}`.execute(
      db
    );
    const longFirst = await getV5EventEvidence(db, {
      world_id: world,
      event_id: first,
      at_revision: 31
    });
    expect([...longFirst.narrative.body]).toHaveLength(12000);
    expect(longFirst.narrative.body_truncated).toBe(true);
    expect(longFirst.public_references).toHaveLength(8);
    const longNext = await getV5EventEvidence(db, {
      world_id: world,
      event_id: first,
      at_revision: 31,
      cursor: longFirst.next_cursor
    });
    expect(longNext.narrative_body_offset).toBe(12000);
    expect([...longNext.narrative.body]).toHaveLength(1000);
    expect(longNext.public_references).toEqual([refs[8]]);
  });
  it("pages literal wildcard matches within one World without materializing its graph", async () => {
    const input = { world_id: world, text: "Dan%jong", limit: 1 };
    const page1 = await searchV5WorldEvents(db, input);
    expect(page1.events.map((event) => event.id)).toEqual([first]);
    expect(page1.events[0]?.summary).toHaveLength(1000);
    expect(page1.source_revision).toBe(31);
    expect(page1.next_cursor).toBeTruthy();
    const page2 = await searchV5WorldEvents(db, {
      ...input,
      cursor: page1.next_cursor
    });
    expect(page2.events.map((event) => event.id)).toEqual([second]);
    expect(page2.next_cursor).toBeNull();
    expect(
      (await searchV5WorldEvents(db, { ...input, text: "Dan_jong" })).events
    ).toEqual([]);
    await expect(
      searchV5WorldEvents(db, {
        ...input,
        text: "different",
        cursor: page1.next_cursor
      })
    ).rejects.toThrow("v5_search_cursor_invalid");
    await sql`update worlds set current_revision = 32 where id = ${world}`.execute(
      db
    );
    await expect(
      searchV5WorldEvents(db, { ...input, cursor: page1.next_cursor })
    ).rejects.toThrow("v5_search_revision_changed");
    const indexes = await sql<{
      count: string;
    }>`select count(*)::text as count from pg_indexes where indexname = 'events_active_title_trgm'`.execute(
      db
    );
    expect(indexes.rows[0]?.count).toBe("1");
  });
});
