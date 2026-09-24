import { describe, expect, it, vi } from "vitest";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import type { ActorContext } from "@moirai/lachesis";
import { createV5Lachesis } from "@moirai/lachesis/v5";
import { createV5Clotho } from "./v5.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const actor: ActorContext = {
  actor_id: "019f5000-1100-7000-8000-000000000002",
  world_ids: [worldId],
  scopes: ["world:read", "world:write"],
  expires_at: "2099-01-01T00:00:00Z"
};
const plan = {
  contract_version: 5,
  change_set_id: "019f5000-1100-7000-8000-000000000003",
  world_id: worldId,
  expected_revision: 30,
  intent: "Synthetic Collection",
  origins: [{ kind: "human_instruction", summary: "Public synthetic fixture" }],
  policy_version: V5_AUTHORING_POLICY.policy_version,
  policy_digest: V5_AUTHORING_POLICY.policy_digest,
  operations: [
    {
      kind: "create",
      entity_type: "collection",
      client_ref: "new-collection",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        world_id: worldId,
        slug: "synthetic",
        title: "Synthetic",
        description: null
      }
    },
    {
      kind: "create",
      entity_type: "narrative",
      client_ref: "new-narrative",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        world_id: worldId,
        scope_type: "collection",
        scope_id: { client_ref: "new-collection" },
        locale: "ko",
        title: null,
        body: "A reader-facing account.",
        public_references: [],
        notes: []
      }
    }
  ]
};

describe("inactive v5 Clotho → Lachesis boundary", () => {
  it("authenticates before parsing, validates the full plan and injects server actor", async () => {
    const commit = vi.fn().mockResolvedValue({ current_revision: 31 });
    const app = createV5Clotho(createV5Lachesis({ commit }));
    expect(() =>
      app.commit(
        { world_id: worldId, contract_version: 4 },
        { ...actor, scopes: [] }
      )
    ).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(commit).not.toHaveBeenCalled();
    expect(() =>
      app.commit({ ...plan, contract_version: 4 }, actor)
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
    expect(() =>
      app.commit({ ...plan, actor: actor.actor_id }, actor)
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
    expect(await app.commit(plan, actor)).toEqual({ current_revision: 31 });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: actor.actor_id,
        id_mapping: {
          "new-collection": expect.any(String),
          "new-narrative": expect.any(String)
        }
      })
    );
    expect(commit.mock.calls[0]?.[0]).not.toHaveProperty("contract_version");
  });
  it("serves only the current complete policy to an authorized World reader", () => {
    const app = createV5Clotho(createV5Lachesis({ commit: vi.fn() }));
    expect(app.policy(worldId, actor)).toEqual(V5_AUTHORING_POLICY);
    expect(() => app.policy(worldId, { ...actor, scopes: [] })).toThrowError(
      expect.objectContaining({ code: "forbidden" })
    );
  });
  it("validates bounded World Event candidate search before reaching persistence", async () => {
    const search = vi
      .fn()
      .mockResolvedValue({
        source_revision: 31,
        events: [],
        next_cursor: null
      });
    const app = createV5Clotho(createV5Lachesis({ commit: vi.fn(), search }));
    const input = {
      contract_version: 5 as const,
      world_id: worldId,
      text: "Dan jong",
      limit: 10
    };
    expect(await app.search(input, actor)).toMatchObject({
      source_revision: 31
    });
    expect(search).toHaveBeenCalledWith(input);
    expect(() =>
      app.search({ ...input, canon_id: worldId } as typeof input, actor)
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
    expect(() => app.search(input, { ...actor, scopes: [] })).toThrowError(
      expect.objectContaining({ code: "forbidden" })
    );
  });
});
