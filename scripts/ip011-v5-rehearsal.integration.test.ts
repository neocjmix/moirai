import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import type { CanonicalState, ResolvedV5Change } from "@moirai/contracts/v5";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import type { LegacyV4RevisionView } from "@moirai/contracts/legacy-v4";
import {
  createDatabase,
  commitCreateChangeSet
} from "../packages/persistence/src/index.js";
import {
  captureDatabaseImage,
  databaseImageDigest,
  restoreFreshRehearsal
} from "../packages/persistence/src/ip011-backup.js";
import { migrateToVersion } from "../packages/persistence/src/migrate.js";
import {
  createTestChangeSet,
  createTestExpansionChangeSet
} from "../packages/persistence/src/test-fixture.js";
import { rehearseV5Database } from "../packages/persistence/src/ip011-v5-rehearsal.js";
import { readLegacyV4WorldAtRevision } from "../packages/persistence/src/legacy-v4-reader.js";
import { readActiveV5State } from "../packages/persistence/src/v5-read.js";
import { commitV5Resolved } from "../packages/persistence/src/v5-change.js";
import { TEST_FIXTURE } from "@moirai/contracts/testing";
import { orderedV5State } from "@moirai/domain/v5";
import { readV5WorldAtRevision } from "../packages/persistence/src/v5-history-reader.js";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { databaseV5Lachesis } from "@moirai/lachesis/database";
import type { ActorContext } from "@moirai/lachesis";
import { registerV5ClothoRoutes } from "../apps/clotho-api/src/v5-routes.js";
import { registerV5McpRoutes } from "../apps/clotho-api/src/v5-mcp.js";

const sourceUrl = process.env.DATABASE_URL;
describe.skipIf(!sourceUrl)("IP-011 isolated full-content transaction", () => {
  const source = createDatabase(sourceUrl ?? "");
  const name = `ip011_rehearsal_${randomBytes(8).toString("hex")}`;
  const cloneUrl = new URL(sourceUrl ?? "postgresql://localhost/unused");
  cloneUrl.pathname = `/${name}`;
  let sourceDigest: string;

  const build = (snapshot: LegacyV4RevisionView): CanonicalState => {
    const ownerNarratives = snapshot.narratives.map((n) => ({
      id: n.id,
      world_id: snapshot.world.id,
      scope_type:
        n.scope_type === "canon" ? ("collection" as const) : ("event" as const),
      scope_id: n.scope_id,
      locale: n.locale,
      title: n.title,
      body: n.body,
      public_references: n.public_references,
      notes: []
    }));
    for (const event of snapshot.events.filter(
      (e) =>
        !ownerNarratives.some(
          (n) => n.scope_type === "event" && n.scope_id === e.id
        )
    )) {
      ownerNarratives.push({
        id:
          event.id === TEST_FIXTURE.eventId
            ? "019f5000-1100-7000-8000-000000000014"
            : "019f5000-1100-7000-8000-000000000015",
        world_id: snapshot.world.id,
        scope_type: "event",
        scope_id: event.id,
        locale: "en",
        title: event.title,
        body: event.summary ?? event.title,
        public_references: [],
        notes: []
      });
    }
    return {
      world: snapshot.world,
      collections: snapshot.canons,
      timeSystems: snapshot.timeSystems,
      collectionTimeSystems: snapshot.canonTimeSystems.map((link) => ({
        id: link.id,
        collection_id: link.canon_id,
        time_system_id: link.time_system_id
      })),
      events: snapshot.events.map((e) => ({
        id: e.id,
        world_id: e.world_id,
        slug: e.slug,
        title: e.title,
        summary: e.summary,
        roles: e.roles,
        attributes: e.attributes
      })),
      eventCollectionMemberships: snapshot.eventCanonMemberships.map((m) => ({
        event_id: m.event_id,
        collection_id: m.canon_id
      })),
      relations: snapshot.relations.map((r) => ({
        id: r.id,
        world_id: r.world_id,
        type: r.type,
        source_ref: r.source_ref,
        target_ref: r.target_ref,
        direction: r.direction,
        attributes: r.attributes
      })),
      narratives: ownerNarratives
    };
  };
  beforeAll(async () => {
    await migrateToVersion(sourceUrl!, "009_ip003_relation_memberships");
    await sql`truncate worlds cascade`.execute(source);
    await commitCreateChangeSet(source, createTestChangeSet());
    await commitCreateChangeSet(source, createTestExpansionChangeSet());
    const image = await captureDatabaseImage(source);
    sourceDigest = databaseImageDigest(image);
    await restoreFreshRehearsal(sourceUrl!, image, name);
  });
  afterAll(async () => {
    await sql`drop database if exists ${sql.id(name)} with (force)`.execute(
      source
    );
    await source.destroy();
  });

  it("rejects the staged writer against an unmigrated v4 database without mutation", async () => {
    await expect(
      commitV5Resolved(source, {
        change_set_id: "019f5000-1100-7000-8000-000000000041",
        world_id: TEST_FIXTURE.worldId,
        expected_revision: 2,
        actor: "019f5000-1100-7000-8000-000000000042",
        intent: "Refuse a v5 write before cutover",
        origins: [{ kind: "human_instruction", summary: "Synthetic test" }],
        policy_version: V5_AUTHORING_POLICY.policy_version,
        policy_digest: V5_AUTHORING_POLICY.policy_digest,
        operations: [
          {
            kind: "withdraw",
            entity_type: "collection",
            entity_id: TEST_FIXTURE.canonId,
            origin_refs: [{ field: "*", origin_index: 0 }]
          }
        ]
      })
    ).rejects.toMatchObject({ code: "v5_schema_not_ready" });
    expect(databaseImageDigest(await captureDatabaseImage(source))).toBe(
      sourceDigest
    );
  });

  it("fails closed before schema changes when a candidate loses a required owner Narrative", async () => {
    await expect(
      rehearseV5Database(sourceUrl!, name, {
        world_id: TEST_FIXTURE.worldId,
        expected_revision: 2,
        preservation_digest: "a".repeat(64),
        build_candidate: (snapshot) => ({ ...build(snapshot), narratives: [] })
      })
    ).rejects.toThrow();
    const clone = createDatabase(cloneUrl.toString());
    try {
      expect(databaseImageDigest(await captureDatabaseImage(clone))).toBe(
        sourceDigest
      );
    } finally {
      await clone.destroy();
    }
  });
  it("commits schema, content, provenance and Revision atomically on the clone, retaining old history", async () => {
    const result = await rehearseV5Database(sourceUrl!, name, {
      world_id: TEST_FIXTURE.worldId,
      expected_revision: 2,
      preservation_digest: "a".repeat(64),
      build_candidate: build
    });
    expect(result).toMatchObject({
      from_revision: 2,
      to_revision: 3,
      history_unchanged: true,
      legacy_revision_unchanged: true,
      operational_source_unchanged: true,
      events: 3,
      collections: 1,
      narratives: 4,
      relations: 2,
      publication_processed: false
    });
    expect(databaseImageDigest(await captureDatabaseImage(source))).toBe(
      sourceDigest
    );
    const clone = createDatabase(cloneUrl.toString());
    try {
      const old = await readLegacyV4WorldAtRevision(
        clone,
        TEST_FIXTURE.worldId,
        2
      );
      expect(old.canons).toHaveLength(1);
      expect(old.events[0]?.kind).toBe("atomic");
      const ledger = await sql<{
        name: string;
      }>`select name from kysely_migration order by name desc limit 1`.execute(
        clone
      );
      expect(ledger.rows[0]?.name).toBe("010_ip011_collections");
      const archived = await sql<{
        count: string;
      }>`select count(*)::text as count from change_operations where entity_type='relation_canon_membership' and operation_kind='retire_applicability'`.execute(
        clone
      );
      expect(archived.rows[0]?.count).toBe("2");
      await expect(
        readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 2)
      ).rejects.toThrow("use_legacy_reader");
      expect(
        orderedV5State(
          await readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 3)
        )
      ).toEqual(
        orderedV5State(await readActiveV5State(clone, TEST_FIXTURE.worldId))
      );
    } finally {
      await clone.destroy();
    }
  });
  it("commits one policy-bound v5 Change Set atomically, with exact replay and missing Narrative rejection", async () => {
    const clone = createDatabase(cloneUrl.toString());
    const eventId = "019f5000-1100-7000-8000-000000000021";
    const narrativeId = "019f5000-1100-7000-8000-000000000022";
    const change: ResolvedV5Change = {
      change_set_id: "019f5000-1100-7000-8000-000000000023",
      world_id: TEST_FIXTURE.worldId,
      expected_revision: 3,
      actor: "019f5000-1100-7000-8000-000000000024",
      intent: "Synthetic isolated policy and replay regression",
      origins: [
        { kind: "system_derived", summary: "Disposable PostgreSQL fixture" }
      ],
      policy_version: V5_AUTHORING_POLICY.policy_version,
      policy_digest: V5_AUTHORING_POLICY.policy_digest,
      id_mapping: { "created-event": eventId },
      operations: [
        {
          kind: "create",
          entity_type: "event",
          entity_id: eventId,
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "v5-policy-test",
            title: "Synthetic Event",
            summary: "An isolated test Event",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "narrative",
          entity_id: narrativeId,
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: TEST_FIXTURE.worldId,
            scope_type: "event",
            scope_id: eventId,
            locale: "en",
            title: "Synthetic Event",
            body: "A reader-facing test account.",
            public_references: [],
            notes: []
          }
        },
        {
          kind: "add",
          entity_type: "event_collection_membership",
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            event_id: eventId,
            collection_id: TEST_FIXTURE.canonId
          }
        }
      ]
    };
    try {
      await expect(
        commitV5Resolved(clone, { ...change, policy_version: "" })
      ).rejects.toMatchObject({ code: "authoring_policy_required" });
      await expect(
        commitV5Resolved(clone, { ...change, policy_digest: "b".repeat(64) })
      ).rejects.toMatchObject({ code: "authoring_policy_mismatch" });
      await expect(
        commitV5Resolved(clone, {
          ...change,
          operations: change.operations.filter(
            (op) => op.entity_type !== "narrative"
          )
        })
      ).rejects.toThrow();
      expect(
        (
          await sql<{
            current_revision: number;
          }>`select current_revision from worlds where id=${TEST_FIXTURE.worldId}`.execute(
            clone
          )
        ).rows[0]?.current_revision
      ).toBe(3);
      const committed = await commitV5Resolved(clone, change);
      expect(committed).toMatchObject({
        current_revision: 4,
        idempotent_replay: false,
        publication_target_revision: 4,
        id_mapping: { "created-event": eventId }
      });
      expect(await commitV5Resolved(clone, change)).toMatchObject({
        current_revision: 4,
        idempotent_replay: true
      });
      await expect(
        commitV5Resolved(clone, { ...change, intent: "Changed payload" })
      ).rejects.toMatchObject({ code: "idempotency_key_reused" });
      const state = await readActiveV5State(clone, TEST_FIXTURE.worldId);
      expect(state.events).toHaveLength(4);
      expect(state.narratives).toHaveLength(5);
      expect(state.eventCollectionMemberships).toContainEqual({
        event_id: eventId,
        collection_id: TEST_FIXTURE.canonId
      });
      expect(
        orderedV5State(
          await readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 4)
        )
      ).toEqual(orderedV5State(state));
      const ledger = await sql<{
        count: string;
        sourced: string;
      }>`select count(*)::text as count, count(*) filter (where origin_refs='[{"field":"*","origin_index":0}]'::jsonb)::text as sourced from change_operations where change_set_id=${change.change_set_id}`.execute(
        clone
      );
      expect(ledger.rows[0]?.count).toBe("3");
      expect(ledger.rows[0]?.sourced).toBe("3");
      const withdraw = await commitV5Resolved(clone, {
        ...change,
        change_set_id: "019f5000-1100-7000-8000-000000000025",
        expected_revision: 4,
        operations: [
          {
            kind: "withdraw",
            entity_type: "collection",
            entity_id: TEST_FIXTURE.canonId,
            origin_refs: [{ field: "*", origin_index: 0 }]
          }
        ]
      });
      expect(withdraw).toMatchObject({ current_revision: 5 });
      const afterSelection = await readActiveV5State(
        clone,
        TEST_FIXTURE.worldId
      );
      expect(afterSelection.collections).toHaveLength(0);
      expect(afterSelection.eventCollectionMemberships).toHaveLength(0);
      expect(afterSelection.events).toHaveLength(4);
      expect(afterSelection.relations).toHaveLength(2);
      expect(afterSelection.narratives).toHaveLength(4);
      expect(
        orderedV5State(
          await readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 5)
        )
      ).toEqual(orderedV5State(afterSelection));
      expect(
        (await readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 4))
          .collections
      ).toHaveLength(1);
      const cascaded = await sql<{
        count: string;
        sourced: string;
      }>`select count(*)::text as count, count(*) filter (where origin_refs='[{"field":"*","origin_index":0}]'::jsonb)::text as sourced from change_operations where change_set_id='019f5000-1100-7000-8000-000000000025'::uuid`.execute(
        clone
      );
      expect(Number(cascaded.rows[0]?.count)).toBeGreaterThan(1);
      expect(cascaded.rows[0]?.sourced).toBe(cascaded.rows[0]?.count);
      expect(databaseImageDigest(await captureDatabaseImage(source))).toBe(
        sourceDigest
      );
    } finally {
      await clone.destroy();
    }
  });
  it("commits over staged HTTP through Clotho/Lachesis on the migrated database", async () => {
    const clone = createDatabase(cloneUrl.toString());
    const actor: ActorContext = {
      actor_id: "019f5000-1100-7000-8000-000000000042",
      world_ids: [TEST_FIXTURE.worldId],
      scopes: ["world:read", "world:write"],
      expires_at: "2099-01-01T00:00:00Z"
    };
    const app = createV5Clotho(databaseV5Lachesis(clone));
    const http = Fastify();
    const bearer = "ip011IsolatedTestBearerToken0123456789";
    const credentials = [
      {
        token_sha256: createHash("sha256").update(bearer).digest("hex"),
        actor_id: actor.actor_id,
        scopes: actor.scopes,
        world_ids: actor.world_ids,
        expires_at: actor.expires_at
      }
    ];
    registerV5ClothoRoutes(http, credentials, app);
    registerV5McpRoutes(http, credentials, app);
    const send = (body: unknown, authorized = true) =>
      http.inject({
        method: "POST",
        url: "/v2/clotho/change.commit",
        headers: {
          "content-type": "application/json",
          ...(authorized ? { authorization: `Bearer ${bearer}` } : {})
        },
        payload: JSON.stringify(body)
      });
    const draft = {
      contract_version: 5,
      change_set_id: "019f5000-1100-7000-8000-000000000043",
      world_id: TEST_FIXTURE.worldId,
      expected_revision: 5,
      intent: "Add a synthetic Collection without owning Events",
      origins: [{ kind: "human_instruction", summary: "Synthetic test" }],
      policy_version: V5_AUTHORING_POLICY.policy_version,
      policy_digest: V5_AUTHORING_POLICY.policy_digest,
      operations: [
        {
          kind: "create",
          entity_type: "collection",
          client_ref: "new-collection",
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: "new-selection",
            title: "New selection",
            description: null
          }
        },
        {
          kind: "create",
          entity_type: "narrative",
          client_ref: "new-narrative",
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: TEST_FIXTURE.worldId,
            scope_type: "collection",
            scope_id: { client_ref: "new-collection" },
            locale: "en",
            title: null,
            body: "A synthetic reader-facing Collection account.",
            public_references: [],
            notes: []
          }
        }
      ]
    };
    try {
      expect(app.policy(TEST_FIXTURE.worldId, actor)).toEqual(
        V5_AUTHORING_POLICY
      );
      expect(() =>
        app.commit(draft, { ...actor, scopes: ["world:read"] })
      ).toThrowError(expect.objectContaining({ code: "forbidden" }));
      expect((await send(draft, false)).statusCode).toBe(401);
      expect((await send({ ...draft, contract_version: 4 })).statusCode).toBe(
        422
      );
      const policy = await http.inject({
        method: "POST",
        url: "/v2/clotho/authoring.policy.get",
        headers: { authorization: `Bearer ${bearer}` },
        payload: { world_id: TEST_FIXTURE.worldId, contract_version: 5 }
      });
      expect(policy.json().result).toEqual(V5_AUTHORING_POLICY);
      const created = await send(draft);
      expect(created.statusCode).toBe(200);
      const first = created.json().result as {
        current_revision: number;
        id_mapping: Record<string, string>;
        idempotent_replay: boolean;
      };
      expect(first).toMatchObject({
        current_revision: 6,
        idempotent_replay: false
      });
      expect(first.id_mapping["new-collection"]).toMatch(/^[0-9a-f-]+$/);
      const retried = await send(draft);
      expect(retried.statusCode).toBe(200);
      expect(retried.json().result).toMatchObject({
        current_revision: 6,
        idempotent_replay: true,
        id_mapping: first.id_mapping
      });
      const mcpReplay = await http.inject({
        method: "POST",
        url: "/mcp-v5",
        headers: {
          authorization: `Bearer ${bearer}`,
          accept: "application/json, text/event-stream"
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "change_commit", arguments: draft }
        }
      });
      expect(mcpReplay.statusCode).toBe(200);
      expect(mcpReplay.json().result.structuredContent).toMatchObject({
        contract_version: 5,
        result: {
          current_revision: 6,
          idempotent_replay: true,
          id_mapping: first.id_mapping
        }
      });
      const state = await readActiveV5State(clone, TEST_FIXTURE.worldId);
      expect(state.collections).toHaveLength(1);
      expect(state.collections[0]?.id).toBe(first.id_mapping["new-collection"]);
      expect(state.events).toHaveLength(4);
      expect(state.eventCollectionMemberships).toHaveLength(0);
      expect(
        orderedV5State(
          await readV5WorldAtRevision(clone, TEST_FIXTURE.worldId, 6)
        )
      ).toEqual(orderedV5State(state));
      expect(databaseImageDigest(await captureDatabaseImage(source))).toBe(
        sourceDigest
      );
    } finally {
      await http.close();
      await clone.destroy();
    }
  });
});
