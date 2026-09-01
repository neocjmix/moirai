import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../apps/clotho-api/src/app.js";
import {
  CONTRACT_VERSION,
  type ChangePlan,
  type CommitResult
} from "../packages/contracts/src/index.js";
import {
  createDatabase,
  readWorldAtRevision
} from "../packages/persistence/src/index.js";
import { migrateToLatest } from "../packages/persistence/src/migrate.js";
import { projectPublicDocuments } from "../packages/projections/src/index.js";
import { callClotho } from "../skills/clotho/src/client.js";

const databaseUrl = process.env.DATABASE_URL;
const uuidV7 = () => randomUUID().replace(/^(.{14})./, "$17");
(databaseUrl ? describe : describe.skip)(
  "Clotho to canonical revision and public projection",
  () => {
    const db = createDatabase(databaseUrl ?? "");
    const token = randomBytes(32).toString("base64url");
    const worldId = uuidV7(),
      canonId = uuidV7(),
      firstId = uuidV7(),
      secondId = uuidV7(),
      actorId = uuidV7();
    const app = buildApp(
      {
        appVersion: "test",
        commitSha: "test",
        databaseUrl: databaseUrl ?? "",
        port: 0,
        credentials: [
          {
            token_sha256: createHash("sha256").update(token).digest("hex"),
            actor_id: actorId,
            scopes: ["world:read", "world:write"],
            world_ids: [worldId],
            expires_at: "2099-01-01T00:00:00Z"
          }
        ]
      },
      db
    );
    let baseUrl = "";
    const origin_refs = [{ field: "*", origin_index: 0 }];
    const create: ChangePlan = {
      contract_version: CONTRACT_VERSION,
      change_set_id: uuidV7(),
      world_id: worldId,
      expected_revision: 0,
      intent: "Synthetic Clotho integration",
      origins: [
        {
          kind: "human_instruction",
          summary: "PRIVATE_ORIGIN_MARKER synthetic metadata"
        }
      ],
      operations: [
        {
          kind: "create",
          entity_type: "world",
          entity_id: worldId,
          origin_refs,
          value: { slug: `clotho-${worldId}`, title: "Clotho synthetic World" }
        },
        {
          kind: "create",
          entity_type: "canon",
          entity_id: canonId,
          origin_refs,
          value: {
            world_id: worldId,
            slug: "synthetic",
            title: "Synthetic Canon"
          }
        },
        {
          kind: "create",
          entity_type: "event",
          entity_id: firstId,
          origin_refs,
          value: {
            canon_id: canonId,
            kind: "atomic",
            title: "First light",
            roles: [],
            attributes: {}
          }
        }
      ]
    };
    beforeAll(async () => {
      await migrateToLatest(databaseUrl ?? "");
      baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
    });
    afterAll(async () => app.close());
    const call = async <T>(
      method: Parameters<typeof callClotho>[1],
      input: unknown
    ): Promise<T> =>
      ((await callClotho({ baseUrl, token }, method, input)) as { result: T })
        .result;
    it("rediscovers, previews without writes, commits with origins, retries and refreshes conflicts", async () => {
      const preview = await call<{ valid: boolean; plan_digest: string }>(
        "change.validate",
        { plan: create }
      );
      expect(preview.valid).toBe(true);
      expect(
        await db
          .selectFrom("worlds")
          .select("id")
          .where("id", "=", worldId)
          .execute()
      ).toEqual([]);
      const committed = await call<CommitResult>("change.commit", {
        plan: create,
        plan_digest: preview.plan_digest
      });
      expect(committed.current_revision).toBe(1);
      expect(
        (await call<CommitResult>("change.commit", { plan: create }))
          .idempotent_replay
      ).toBe(true);
      const worlds = await call<{ items: { id: string }[] }>("world.list", {});
      expect(worlds.items.map((w) => w.id)).toEqual([worldId]);
      expect(await call("canon.list", { world_id: worldId })).toMatchObject({
        source_revision: 1,
        items: [{ id: canonId }]
      });
      expect(
        await call("context.slice", {
          world_id: worldId,
          canon_ids: [canonId],
          seed_ids: [firstId]
        })
      ).toMatchObject({
        source_revision: 1,
        events: [{ id: firstId }],
        truncated: false
      });
      const expansion: ChangePlan = {
        ...create,
        change_set_id: uuidV7(),
        expected_revision: 1,
        operations: [
          {
            kind: "create",
            entity_type: "event",
            entity_id: secondId,
            origin_refs,
            value: {
              canon_id: canonId,
              kind: "atomic",
              title: "Second light",
              roles: [],
              attributes: {}
            }
          },
          {
            kind: "create",
            entity_type: "relation",
            client_ref: "link",
            origin_refs,
            value: {
              canon_id: canonId,
              type: "causes",
              direction: "directed",
              source_event_id: firstId,
              target_event_id: secondId,
              attributes: {}
            }
          },
          {
            kind: "create",
            entity_type: "narrative",
            client_ref: "text",
            origin_refs,
            value: {
              canon_id: canonId,
              scope_type: "event",
              scope_id: secondId,
              locale: "en",
              kind: "primary",
              body: "Synthetic signal crosses the harbor.",
              public_references: []
            }
          }
        ]
      };
      const expandedPreview = await call<{ plan_digest: string }>(
        "change.validate",
        { plan: expansion }
      );
      const invalid = {
        ...expansion,
        operations: [
          {
            ...expansion.operations[0],
            value: { ...expansion.operations[0]?.value, canon_id: uuidV7() }
          }
        ]
      };
      await expect(
        call("change.commit", { plan: invalid })
      ).rejects.toHaveProperty("code");
      expect((await readWorldAtRevision(db, worldId, 1)).events).toHaveLength(
        1
      );
      expect(
        (
          await call<CommitResult>("change.commit", {
            plan: expansion,
            plan_digest: expandedPreview.plan_digest
          })
        ).current_revision
      ).toBe(2);
      await expect(
        call("change.commit", {
          plan: { ...expansion, change_set_id: uuidV7() }
        })
      ).rejects.toMatchObject({
        code: "revision_conflict",
        recovery: { action: "refresh_context", current_revision: 2 }
      });
      expect(await call("world.get", { world_id: worldId })).toMatchObject({
        source_revision: 2
      });
      const refreshed: ChangePlan = {
        ...expansion,
        change_set_id: uuidV7(),
        expected_revision: 2,
        operations: [
          {
            kind: "create",
            entity_type: "event",
            client_ref: "third",
            origin_refs,
            value: {
              canon_id: canonId,
              kind: "atomic",
              title: "Third light",
              roles: [],
              attributes: {}
            }
          }
        ]
      };
      expect(
        (await call<CommitResult>("change.commit", { plan: refreshed }))
          .current_revision
      ).toBe(3);
      const origins = await db
        .selectFrom("change_operations")
        .select("origin_refs")
        .where("change_set_id", "=", expansion.change_set_id)
        .execute();
      expect(origins).toHaveLength(3);
      expect(origins.every((op) => op.origin_refs.length === 1)).toBe(true);
      expect(
        await db
          .selectFrom("change_sets")
          .select("actor")
          .where("id", "=", create.change_set_id)
          .executeTakeFirst()
      ).toEqual({ actor: actorId });
      const view = await readWorldAtRevision(db, worldId, 3);
      const publication = JSON.stringify(
        projectPublicDocuments(view, 3, "2026-09-01T00:00:00Z")
      );
      expect(publication).toContain("Synthetic signal");
      for (const secret of [
        token,
        actorId,
        "PRIVATE_ORIGIN_MARKER",
        "origin_refs",
        "origins"
      ])
        expect(publication).not.toContain(secret);
      const part = await call<{
        next_cursor: string;
        source_revision: number;
        narratives: { body: string }[];
      }>("event.get", {
        world_id: worldId,
        event_id: secondId,
        max_narrative_chars: 8
      });
      expect(part.next_cursor).toBeTruthy();
      expect(part.narratives[0]?.body).toHaveLength(8);
      expect(
        await call("event.get", {
          world_id: worldId,
          event_id: secondId,
          max_narrative_chars: 8,
          cursor: part.next_cursor
        })
      ).toMatchObject({ source_revision: part.source_revision });
      await expect(
        call("event.get", {
          world_id: worldId,
          event_id: firstId,
          max_narrative_chars: 8,
          cursor: part.next_cursor
        })
      ).rejects.toMatchObject({ code: "invalid_cursor" });
      const invalidOrigin = {
        ...refreshed,
        change_set_id: uuidV7(),
        expected_revision: 3,
        operations: [
          {
            ...refreshed.operations[0],
            origin_refs: [{ field: "title", origin_index: 9 }]
          }
        ]
      };
      await expect(
        call("change.validate", { plan: invalidOrigin })
      ).rejects.toMatchObject({ code: "invalid_origin_reference" });
    });
  }
);
