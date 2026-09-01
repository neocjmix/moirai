import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";
import { parseCredentials, type Credential } from "./auth.js";
import { registerClotho } from "./clotho.js";

const token = randomBytes(32).toString("base64url");
const credential: Credential = {
  token_sha256: createHash("sha256").update(token).digest("hex"),
  actor_id: "01995c2a-7b00-7000-8000-000000000099",
  scopes: ["world:read", "world:write"],
  world_ids: [SYNTHETIC_FIXTURE.worldId],
  expires_at: "2099-01-01T00:00:00Z"
};
const plan = {
  contract_version: CONTRACT_VERSION,
  change_set_id: SYNTHETIC_FIXTURE.changeSetId,
  world_id: SYNTHETIC_FIXTURE.worldId,
  expected_revision: 2,
  intent: "Synthetic test",
  origins: [
    { kind: "human_instruction", summary: "Public synthetic addition" }
  ],
  operations: [
    {
      kind: "create",
      entity_type: "event",
      client_ref: "event",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        canon_id: SYNTHETIC_FIXTURE.canonId,
        kind: "atomic",
        title: "Test",
        roles: [],
        attributes: {}
      }
    }
  ]
};
function setup(records: readonly Credential[] = [credential]) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  const execute = vi.fn(async () => ({ ok: true }));
  registerClotho(app, records, execute);
  const send = (
    method: string,
    payload: unknown,
    authorization = `Bearer ${token}`
  ) =>
    app.inject({
      method: "POST",
      url: `/v1/clotho/${method}`,
      headers: { authorization },
      payload: payload as object
    });
  return { app, execute, send };
}
describe("Clotho authenticated boundary", () => {
  it("fails closed and checks authentication before request schema", async () => {
    const { app, execute, send } = setup([]);
    expect((await send("change.commit", {})).statusCode).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });
  it("limits credential lifetime, method scope, and World scope", async () => {
    const readOnly = setup([{ ...credential, scopes: ["world:read"] }]);
    expect((await readOnly.send("change.commit", { plan })).statusCode).toBe(
      403
    );
    expect(
      (
        await readOnly.send("world.get", {
          world_id: SYNTHETIC_FIXTURE.canonId
        })
      ).statusCode
    ).toBe(403);
    expect(readOnly.execute).not.toHaveBeenCalled();
    await readOnly.app.close();
    const expired = setup([
      { ...credential, expires_at: "2020-01-01T00:00:00Z" }
    ]);
    expect((await expired.send("world.list", {})).statusCode).toBe(401);
    await expired.app.close();
  });
  it("rejects actor spoofing, missing origins, unknown fields and coerced limits", async () => {
    const { app, execute, send } = setup();
    for (const payload of [
      { plan: { ...plan, actor: "attacker" } },
      {
        plan: {
          ...plan,
          operations: [{ ...plan.operations[0], origin_refs: [] }]
        }
      },
      { plan, token }
    ])
      expect((await send("change.commit", payload)).statusCode).toBe(400);
    expect((await send("world.list", { limit: "2" })).statusCode).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    await app.close();
  });
  it("uses authenticated actor context and does not require prior validation", async () => {
    const { app, execute, send } = setup();
    const result = await send("change.commit", { plan });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    const { token_sha256: hash, ...principal } = credential;
    expect(execute).toHaveBeenCalledWith("change.commit", { plan }, principal);
    expect(JSON.stringify(execute.mock.calls)).not.toContain(hash);
    expect(result.body).not.toContain(token);
    await app.close();
  });
  it("returns safe errors and useful revision recovery without raw diagnostics", async () => {
    const { app, execute, send } = setup();
    execute.mockRejectedValueOnce(
      new Error(
        "postgres://private:secret@private-db /srv/private/file.sql SELECT *"
      )
    );
    const failed = await send("world.list", {});
    expect(failed.statusCode).toBe(500);
    expect(failed.body).not.toMatch(/postgres|SELECT|private|stack/);
    execute.mockRejectedValueOnce(
      new ChangeSetError(
        "revision_conflict",
        "expected_revision",
        "raw private details",
        [],
        true,
        { action: "refresh_context", current_revision: 3 }
      )
    );
    const conflict = await send("change.commit", { plan });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.recovery).toEqual({
      action: "refresh_context",
      current_revision: 3
    });
    expect(conflict.body).not.toContain("raw private");
    await app.close();
  });
  it("rejects malformed configuration without reflecting its contents", () => {
    expect(parseCredentials(undefined)).toEqual([]);
    expect(() => parseCredentials("private-secret")).toThrow(
      "Invalid Clotho credential configuration"
    );
    expect(parseCredentials(JSON.stringify([credential]))).toEqual([
      credential
    ]);
  });
});
