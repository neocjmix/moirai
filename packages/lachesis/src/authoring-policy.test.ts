import { createHash } from "node:crypto";
import { AUTHORING_POLICY } from "@moirai/contracts";
import { TEST_FIXTURE } from "@moirai/contracts/testing";
import { describe, expect, it, vi } from "vitest";
import {
  createLachesis,
  type ActorContext,
  type CanonicalStore
} from "./index.js";
import { assertPolicyForNewWrite } from "./authoring-policy-guard.js";

const actor: ActorContext = {
  actor_id: "01995c2a-7b00-7000-8000-000000000099",
  world_ids: [TEST_FIXTURE.worldId],
  scopes: ["world:read"],
  expires_at: "2099-01-01T00:00:00Z"
};
describe("authoritative policy delivery", () => {
  it("prototypes authorized exact replay before the new-write policy gate", () => {
    // Isolated transaction model; no claim that v4 enforces the v5 gate.
    let current = { policy_version: "v5/1", policy_digest: "a".repeat(64) };
    const committed = new Map<string, { digest: string; revision: number }>();
    const execute = (id: string, policy: typeof current, allowed = true) => {
      if (!allowed) throw new Error("forbidden");
      const digest = createHash("sha256")
        .update(JSON.stringify(policy))
        .digest("hex");
      const previous = committed.get(id);
      if (previous) {
        if (previous.digest !== digest) throw new Error("idempotency_conflict");
        return previous.revision;
      }
      assertPolicyForNewWrite(policy, current);
      const revision = committed.size + 1;
      committed.set(id, { digest, revision });
      return revision;
    };
    const old = current;
    expect(execute("same", old)).toBe(1);
    current = { policy_version: "v5/2", policy_digest: "b".repeat(64) };
    expect(execute("same", old)).toBe(1);
    expect(() => execute("same", old, false)).toThrow("forbidden");
    expect(() => execute("same", current)).toThrow("idempotency_conflict");
    expect(() => execute("new", old)).toThrowError(
      expect.objectContaining({ code: "authoring_policy_mismatch" })
    );
    expect(execute("new", current)).toBe(2);
  });
  it("serves complete hashed policy after World authorization without a World replay", async () => {
    const store = {
      query: vi.fn(),
      digest: vi.fn(),
      validate: vi.fn(),
      commit: vi.fn()
    } satisfies CanonicalStore;
    const service = createLachesis(store);
    const input = { world_id: TEST_FIXTURE.worldId, contract_version: 4 };
    expect(await service.query("authoring.policy.get", input, actor)).toEqual(
      AUTHORING_POLICY
    );
    expect(store.query).not.toHaveBeenCalled();
    expect(
      createHash("sha256").update(AUTHORING_POLICY.document).digest("hex")
    ).toBe(AUTHORING_POLICY.policy_digest);
    expect(Buffer.byteLength(JSON.stringify(AUTHORING_POLICY))).toBeLessThan(
      12_000
    );
    for (const rejected of [
      { ...actor, scopes: [] },
      { ...actor, world_ids: [] },
      { ...actor, expires_at: "2000-01-01" }
    ])
      await expect(
        service.query("authoring.policy.get", input, rejected)
      ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      service.query(
        "authoring.policy.get",
        { ...input, world_id: actor.actor_id },
        actor
      )
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("rejects missing, old version, and changed digest in the isolated v5 guard", () => {
    const current = { policy_version: "v5/1", policy_digest: "a".repeat(64) };
    expect(() => assertPolicyForNewWrite({}, current)).toThrowError(
      expect.objectContaining({ code: "authoring_policy_required" })
    );
    for (const input of [
      { ...current, policy_version: "v4/1" },
      { ...current, policy_digest: "b".repeat(64) }
    ])
      expect(() => assertPolicyForNewWrite(input, current)).toThrowError(
        expect.objectContaining({ code: "authoring_policy_mismatch" })
      );
    expect(() => assertPolicyForNewWrite(current, current)).not.toThrow();
  });
});
