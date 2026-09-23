import { describe, expect, it, vi } from "vitest";
import { TEST_FIXTURE } from "@moirai/contracts/testing";
import {
  V5_AUTHORING_POLICY,
  type ResolvedV5Change
} from "@moirai/contracts/v5";
import type { ActorContext } from "./index.js";
import { createV5Lachesis } from "./v5.js";
import type { V5DraftChange } from "./v5-client-resolver.js";

const actor: ActorContext = {
  actor_id: "019f5000-1100-7000-8000-000000000024",
  scopes: ["world:read", "world:write"],
  world_ids: [TEST_FIXTURE.worldId],
  expires_at: "2099-01-01T00:00:00Z"
};
const plan: Omit<ResolvedV5Change, "actor"> = {
  change_set_id: "019f5000-1100-7000-8000-000000000023",
  world_id: TEST_FIXTURE.worldId,
  expected_revision: 3,
  intent: "Create a synthetic account",
  origins: [{ kind: "system_derived", summary: "Synthetic" }],
  policy_version: V5_AUTHORING_POLICY.policy_version,
  policy_digest: V5_AUTHORING_POLICY.policy_digest,
  operations: [
    {
      kind: "withdraw",
      entity_type: "event",
      entity_id: TEST_FIXTURE.eventId,
      origin_refs: [{ field: "*", origin_index: 0 }]
    }
  ]
};

describe("staged v5 Lachesis boundary", () => {
  it("returns current policy only to an authorized World reader", () => {
    const service = createV5Lachesis({ commit: vi.fn() });
    expect(service.policy(TEST_FIXTURE.worldId, actor)).toEqual(
      V5_AUTHORING_POLICY
    );
    expect(() =>
      service.policy(TEST_FIXTURE.worldId, { ...actor, scopes: [] })
    ).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(() => service.policy(actor.actor_id, actor)).toThrowError(
      expect.objectContaining({ code: "forbidden" })
    );
  });
  it("checks authorization before replay or policy handling and injects only server actor", async () => {
    const commit = vi.fn().mockResolvedValue({ current_revision: 4 });
    const service = createV5Lachesis({ commit });
    for (const rejected of [
      { ...actor, scopes: ["world:read"] as const },
      { ...actor, expires_at: "2000-01-01T00:00:00Z" },
      { ...actor, world_ids: [actor.actor_id] }
    ])
      expect(() => service.commit(plan, rejected)).toThrowError(
        expect.objectContaining({ code: "forbidden" })
      );
    expect(commit).not.toHaveBeenCalled();
    expect(() =>
      service.commit({ ...plan, actor: actor.actor_id } as typeof plan, actor)
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
    expect(await service.commit(plan, actor)).toEqual({ current_revision: 4 });
    expect(commit).toHaveBeenCalledWith({ ...plan, actor: actor.actor_id });
  });
  it("authorizes before draft ID resolution and rejects caller-owned metadata", async () => {
    const commit = vi.fn().mockResolvedValue({ current_revision: 4 });
    const service = createV5Lachesis({ commit });
    const draft: V5DraftChange = {
      ...plan,
      operations: [
        {
          kind: "create",
          entity_type: "event",
          client_ref: "new-event",
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: TEST_FIXTURE.worldId,
            slug: null,
            title: "Synthetic",
            summary: null,
            roles: [],
            attributes: {}
          }
        }
      ]
    };
    expect(() =>
      service.commitDraft(
        { ...draft, change_set_id: "invalid" },
        { ...actor, scopes: [] }
      )
    ).toThrowError(expect.objectContaining({ code: "forbidden" }));
    expect(commit).not.toHaveBeenCalled();
    expect(() =>
      service.commitDraft(
        { ...draft, id_mapping: { forged: actor.actor_id } } as V5DraftChange,
        actor
      )
    ).toThrowError(expect.objectContaining({ code: "invalid_request" }));
    await service.commitDraft(draft, actor);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: actor.actor_id,
        id_mapping: { "new-event": expect.any(String) }
      })
    );
  });
});
