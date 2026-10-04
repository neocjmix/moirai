import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../packages/persistence/src/index.js";
import { migrateToVersion } from "../../packages/persistence/src/migrate.js";
import {
  finalize,
  prepare
} from "../../packages/persistence/src/cutovers/010_ip011_collections.js";
import { databaseV5Lachesis } from "@moirai/lachesis/database";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { readV5WorldAtRevision } from "../../packages/persistence/src/v5-history-reader.js";
import {
  buildV5SpatialStagedArtifacts,
  finalizeV5VerifiedSpatialArtifacts,
  publishV5CompleteArtifacts,
  readV5ServedRoot
} from "@moirai/publication/v5";
const source = process.env.DATABASE_URL;
(source ? describe : describe.skip)("World lifecycle vertical slice", () => {
  const name = `world_lifecycle_${randomBytes(6).toString("hex")}`;
  const id = (n: number) =>
    `019f5000-1100-7000-8000-${String(n).padStart(12, "0")}`;
  const actor = {
    actor_id: id(900),
    world_ids: [],
    all_worlds: true,
    scopes: ["world:read", "world:write"] as const,
    expires_at: "2099-01-01T00:00:00Z"
  };
  let db: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createV5Clotho>;
  const policy = {
    policy_version: V5_AUTHORING_POLICY.policy_version,
    policy_digest: V5_AUTHORING_POLICY.policy_digest
  };
  const create = (world: number) => ({
    contract_version: 5,
    change_set_id: id(world + 100),
    world_id: id(world),
    expected_revision: 0,
    intent: "Create disposable synthetic World",
    origins: [{ kind: "human_instruction", summary: "Local fixture" }],
    ...policy,
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: id(world),
        origin_refs: [{ field: "*", origin_index: 0 }],
        value: {
          slug: `synthetic-${world}`,
          title: `Synthetic World ${world}`,
          description: "Disposable verification fixture"
        }
      }
    ]
  });
  beforeAll(async () => {
    const admin = createDatabase(source!);
    await sql`create database ${sql.id(name)}`.execute(admin);
    await admin.destroy();
    const target = new URL(source!);
    target.pathname = `/${name}`;
    await migrateToVersion(target.toString(), "009_ip003_relation_memberships");
    db = createDatabase(target.toString());
    await db.transaction().execute(async (tx) => {
      await prepare(tx);
      await finalize(tx);
    });
    await sql`insert into kysely_migration(name,timestamp) values ('010_ip011_collections','2026-01-01T00:00:00.000Z')`.execute(
      db
    );
    service = createV5Clotho(databaseV5Lachesis(db));
  });
  afterAll(async () => {
    await db?.destroy();
    const admin = createDatabase(source!);
    await sql`drop database if exists ${sql.id(name)}`.execute(admin);
    await admin.destroy();
  });
  it("creates, validates without writes, isolates Worlds, adds/reads Event, retires and restores with stable IDs", async () => {
    const first = create(1);
    await expect(
      service.execute("world.create", first, {
        ...actor,
        all_worlds: false,
        world_ids: [id(2)]
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await service.execute("change.validate", first, actor);
    expect((await sql`select * from worlds`.execute(db)).rows).toHaveLength(0);
    expect(await service.execute("world.create", first, actor)).toMatchObject({
      current_revision: 1
    });
    expect(await service.execute("world.create", first, actor)).toMatchObject({
      idempotent_replay: true
    });
    await service.execute("world.create", create(2), actor);
    const ref = [{ field: "*", origin_index: 0 }];
    const eventPlan = {
      ...first,
      change_set_id: id(200),
      expected_revision: 1,
      operations: [
        {
          kind: "create",
          entity_type: "event",
          entity_id: id(10),
          origin_refs: ref,
          value: {
            world_id: id(1),
            slug: null,
            title: "Synthetic arrival",
            summary: "A local test occurrence",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "narrative",
          entity_id: id(11),
          origin_refs: ref,
          value: {
            world_id: id(1),
            scope_type: "event",
            scope_id: id(10),
            locale: "ko",
            title: null,
            body: "A synthetic traveller arrived. This verifies Event reading without a time axis or Collection.",
            public_references: [],
            notes: []
          }
        }
      ]
    };
    await service.execute("change.commit", eventPlan, actor);
    const state = await readV5WorldAtRevision(db, id(1), 2);
    expect(state.events.map((e) => e.id)).toEqual([id(10)]);
    expect((await readV5WorldAtRevision(db, id(2), 1)).events).toEqual([]);
    await expect(
      service.execute(
        "event.get",
        {
          contract_version: 5,
          world_id: id(2),
          event_id: id(10),
          at_revision: 1
        },
        actor
      )
    ).rejects.toBeDefined();
    let failNextPut = false;
    const objects = new Map<string, string>();
    const store = {
      get: async (key: string) => ({
        status: objects.has(key) ? 200 : 404,
        body: objects.get(key) ?? null,
        etag: objects.has(key) ? '"test"' : null
      }),
      put: async (key: string, body: string) => {
        if (failNextPut) {
          failNextPut = false;
          throw Error("synthetic_upload_failure");
        }
        objects.set(key, body);
        return { status: 200, etag: '"test"' };
      }
    };
    async function publish(world: number, revision: number) {
      const original = await readV5WorldAtRevision(db, id(world), revision);
      const withdrawn = original.worldStatus === "withdrawn";
      const content = withdrawn
        ? {
            ...original,
            events: [],
            narratives: [],
            collections: [],
            relations: [],
            timeSystems: [],
            collectionTimeSystems: [],
            eventCollectionMemberships: []
          }
        : original;
      const artifacts = finalizeV5VerifiedSpatialArtifacts(
        content,
        buildV5SpatialStagedArtifacts(content, revision, [])
      );
      await publishV5CompleteArtifacts(
        store,
        artifacts,
        new Date().toISOString(),
        undefined,
        withdrawn
      );
    }
    await publish(1, 2);
    await publish(2, 1);
    const lifecycle = {
      contract_version: 5,
      world_id: id(1),
      change_set_id: id(201),
      expected_revision: 2,
      intent: "Retire local fixture",
      ...policy
    };
    expect(
      await service.execute("world.delete", lifecycle, actor)
    ).toMatchObject({ current_revision: 3, status: "withdrawn" });
    expect(
      await service.execute("world.delete", lifecycle, actor)
    ).toMatchObject({ idempotent_replay: true });
    await expect(
      service.execute(
        "change.commit",
        { ...eventPlan, change_set_id: id(202), expected_revision: 3 },
        actor
      )
    ).rejects.toMatchObject({ code: "world_missing" });
    expect(
      await service.execute(
        "world.get",
        { contract_version: 5, world_id: id(1), include_withdrawn: true },
        actor
      )
    ).toMatchObject({ world: { current_revision: 3, withdrawn_revision: 3 } });
    failNextPut = true;
    await expect(publish(1, 3)).rejects.toThrow("synthetic_upload_failure");
    expect((await readV5ServedRoot(store, id(1))).pointer.served_revision).toBe(
      2
    );
    await publish(1, 3);
    await expect(readV5ServedRoot(store, id(1))).rejects.toThrow(
      "v5_world_withdrawn"
    );
    expect((await readV5ServedRoot(store, id(2))).pointer.served_revision).toBe(
      1
    );
    expect(
      (await sql`select * from events where world_id=${id(1)}`.execute(db)).rows
    ).toHaveLength(1);
    const restore = {
      ...lifecycle,
      change_set_id: id(203),
      expected_revision: 3
    };
    expect(
      await service.execute("world.restore", restore, actor)
    ).toMatchObject({ current_revision: 4, status: "active" });
    await publish(1, 4);
    expect((await readV5ServedRoot(store, id(1))).pointer.served_revision).toBe(
      4
    );
    expect((await readV5WorldAtRevision(db, id(1), 4)).events).toEqual(
      state.events
    );
    const list = (await service.execute(
      "world.list",
      { contract_version: 5 },
      actor
    )) as { items: { id: string }[] };
    expect(list.items.map((w) => w.id)).toEqual([id(1), id(2)]);
    const scoped = (await service.execute(
      "world.list",
      { contract_version: 5 },
      { ...actor, all_worlds: false, world_ids: [id(2)] }
    )) as { items: { id: string }[] };
    expect(scoped.items.map((w) => w.id)).toEqual([id(2)]);
    if (process.env.WORLD_FIXTURE_DIR)
      for (const [key, body] of objects) {
        const path = join(process.env.WORLD_FIXTURE_DIR, key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, body);
      }
  });
  it("creates a World-owned TimeSystem and sourced Event with returned identities, then publishes it", async () => {
    const world = id(3);
    const ref = [{ field: "*", origin_index: 0 }];
    const op = (
      entity_type: string,
      client_ref: string,
      value: Record<string, unknown>
    ) => ({ kind: "create", entity_type, client_ref, origin_refs: ref, value });
    const plan = {
      ...create(3),
      operations: [
        ...create(3).operations,
        op("time_system", "calendar", {
          world_id: world,
          slug: "gregorian",
          title: "Gregorian UTC",
          kind: "calendar",
          definition_version: "1",
          definition: {
            coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
            calendar: "proleptic-gregorian",
            timezone: "UTC",
            fractional_digits: 12,
            leap_second_policy: "reject",
            interval_policy: "half-open",
            capabilities: [
              "canonicalize",
              "equality",
              "compare",
              "boundary",
              "difference"
            ]
          }
        }),
        op("event", "arrival", {
          world_id: world,
          slug: null,
          title: "Synthetic dated arrival",
          summary: null,
          roles: [],
          attributes: {}
        }),
        op("narrative", "account", {
          world_id: world,
          scope_type: "event",
          scope_id: { client_ref: "arrival" },
          locale: "ko",
          title: null,
          body: "Synthetic sourced account",
          public_references: [
            { label: "Synthetic source", url: "https://example.test/source" }
          ],
          notes: []
        }),
        op("relation", "date", {
          world_id: world,
          type: "coincides",
          direction: "undirected",
          source_ref: { kind: "event", client_ref: "arrival" },
          target_ref: {
            kind: "time_event",
            time_system_ref: { client_ref: "calendar" },
            definition_version: "1",
            coordinate: "2000-01-01T00:00:00.000000000000Z"
          },
          attributes: {}
        })
      ]
    };
    await expect(
      service.execute("world.create", plan, {
        ...actor,
        scopes: ["world:read"]
      })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.execute(
        "world.create",
        { ...plan, policy_digest: "0".repeat(64) },
        actor
      )
    ).rejects.toMatchObject({ code: "authoring_policy_mismatch" });
    for (const invalid of [
      {
        ...plan,
        operations: plan.operations.map((operation) =>
          operation.entity_type === "time_system"
            ? { ...operation, value: { ...operation.value, world_id: id(2) } }
            : operation
        )
      },
      {
        ...plan,
        operations: plan.operations.map((operation) =>
          operation.entity_type === "relation"
            ? {
                ...operation,
                value: {
                  ...operation.value,
                  target_ref: {
                    kind: "time_event",
                    time_system_ref: { client_ref: "calendar" },
                    definition_version: "1",
                    coordinate: "not-a-date"
                  }
                }
              }
            : operation
        )
      }
    ]) {
      await expect(
        service.execute("change.validate", invalid, actor)
      ).rejects.toBeDefined();
      expect(
        (await sql`select id from worlds where id=${world}`.execute(db)).rows
      ).toHaveLength(0);
    }
    await service.execute("change.validate", plan, actor);
    const result = (await service.execute("world.create", plan, actor)) as {
      id_mapping: Record<string, string>;
    };
    await expect(
      service.execute(
        "world.create",
        { ...plan, change_set_id: id(304) },
        actor
      )
    ).rejects.toMatchObject({ code: "revision_conflict" });
    const state = await readV5WorldAtRevision(db, world, 1);
    expect(state.timeSystems[0]).toMatchObject({
      id: result.id_mapping.calendar,
      world_id: world
    });
    expect(state.events[0]?.id).toBe(result.id_mapping.arrival);
    expect(state.eventCollectionMemberships).toEqual([]);
    expect(state.narratives[0]?.public_references[0]?.url).toBe(
      "https://example.test/source"
    );
    const { artifacts, proof } = await buildV5WorldCompleteArtifacts(state, 1);
    expect(proof.placed).toBe(1);
    const objects = new Map<string, string>();
    const store = {
      get: async (key: string) => ({
        status: objects.has(key) ? 200 : 404,
        body: objects.get(key) ?? null,
        etag: null
      }),
      put: async (key: string, body: string) => {
        objects.set(key, body);
        return { status: 200, etag: "synthetic" };
      }
    };
    await publishV5CompleteArtifacts(
      store,
      artifacts,
      new Date().toISOString()
    );
    expect((await readV5ServedRoot(store, world)).pointer.served_revision).toBe(
      1
    );
    const readback = await service.execute(
      "event.get",
      {
        contract_version: 5,
        world_id: world,
        event_id: result.id_mapping.arrival,
        at_revision: 1
      },
      actor
    );
    expect(JSON.stringify(readback)).toContain("Synthetic dated arrival");
    await expect(
      service.execute(
        "world.create",
        { ...plan, intent: "Different request with same ID" },
        actor
      )
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
});
