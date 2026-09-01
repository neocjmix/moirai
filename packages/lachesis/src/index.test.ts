import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type ChangePlan
} from "@moirai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createLachesis,
  type ActorContext,
  type CanonicalStore
} from "./index.js";

const actor: ActorContext = {
  actor_id: "01995c2a-7b00-7000-8000-000000000099",
  world_ids: [SYNTHETIC_FIXTURE.worldId],
  scopes: ["world:read", "world:write"],
  expires_at: "2099-01-01T00:00:00Z"
};
const plan: ChangePlan = {
  contract_version: CONTRACT_VERSION,
  change_set_id: SYNTHETIC_FIXTURE.changeSetId,
  world_id: SYNTHETIC_FIXTURE.worldId,
  expected_revision: 0,
  intent: "Synthetic authorization test",
  origins: [{ kind: "human_instruction", summary: "Synthetic" }],
  operations: []
};
function setup() {
  const store = {
    query: vi.fn(async () => ({ source_revision: 0 })),
    digest: vi.fn(() => "preview"),
    validate: vi.fn(async () => ({ plan_digest: "preview" })),
    commit: vi.fn(async () => ({ current_revision: 1 }))
  } satisfies CanonicalStore;
  return { store, service: createLachesis(store) };
}
describe("Lachesis authorization without external adapters", () => {
  it("denies expired, malformed and insufficient contexts before storage", async () => {
    const { store, service } = setup();
    for (const context of [
      { ...actor, expires_at: "2000-01-01" },
      { ...actor, expires_at: "invalid" },
      { ...actor, world_ids: [] },
      { ...actor, actor_id: "external-subject" },
      { ...actor, scopes: [] }
    ] as ActorContext[]) {
      await expect(
        service.query("world.list", {}, context)
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(service.commit(plan, context)).rejects.toMatchObject({
        code: "forbidden"
      });
    }
    expect(store.query).not.toHaveBeenCalled();
    expect(store.commit).not.toHaveBeenCalled();
  });
  it("enforces World on queries and writes and scopes the World list", async () => {
    const { store, service } = setup();
    await expect(
      service.query("world.get", { world_id: actor.actor_id }, actor)
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.query("world.get", {}, actor)).rejects.toMatchObject({
      code: "invalid_request"
    });
    await expect(
      service.commit({ ...plan, world_id: actor.actor_id }, actor)
    ).rejects.toMatchObject({ code: "forbidden" });
    await service.query("world.list", {}, actor);
    expect(store.query).toHaveBeenCalledWith("world.list", {}, actor.world_ids);
    expect(store.commit).not.toHaveBeenCalled();
  });
  it("rechecks permissions after preview and rejects payload actor spoofing", async () => {
    const { store, service } = setup();
    await service.validate(plan, actor);
    await expect(
      service.commit(plan, { ...actor, scopes: ["world:read"] }, "preview")
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.commit(plan, { ...actor, expires_at: "2000-01-01" }, "preview")
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.commit({ ...plan, actor: "spoofed" } as ChangePlan, actor)
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(store.commit).not.toHaveBeenCalled();
    await service.commit(plan, actor);
    expect(store.commit).toHaveBeenCalledWith({
      ...plan,
      actor: actor.actor_id
    });
  });
  it("preserves digest checks and canonical conflict/replay outcomes", async () => {
    const { store, service } = setup();
    await expect(service.commit(plan, actor, "stale")).rejects.toMatchObject({
      code: "plan_drift"
    });
    expect(store.commit).not.toHaveBeenCalled();
    const conflict = new Error("canonical failure");
    store.commit.mockRejectedValueOnce(conflict);
    await expect(service.commit(plan, actor)).rejects.toBe(conflict);
  });
});
