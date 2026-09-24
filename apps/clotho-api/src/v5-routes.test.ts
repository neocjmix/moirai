import { createHash } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { createV5Lachesis } from "@moirai/lachesis/v5";
import type { Credential } from "./auth.js";
import { registerV5ClothoRoutes } from "./v5-routes.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const actorId = "019f5000-1100-7000-8000-000000000002";
const token = "stageOnlyBearerToken0123456789abcd";
const credentials: Credential[] = [
  {
    token_sha256: createHash("sha256").update(token).digest("hex"),
    actor_id: actorId,
    scopes: ["world:read", "world:write"],
    world_ids: [worldId],
    expires_at: "2099-01-01T00:00:00Z"
  }
];
const plan = {
  contract_version: 5,
  change_set_id: "019f5000-1100-7000-8000-000000000003",
  world_id: worldId,
  expected_revision: 31,
  intent: "Synthetic Collection",
  origins: [{ kind: "human_instruction", summary: "Synthetic fixture" }],
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

describe("inactive v5 HTTP transport", () => {
  it("serves bounded World candidate search with strict read authorization", async () => {
    const search = vi.fn().mockResolvedValue({
      source_revision: 31,
      events: [],
      next_cursor: null
    });
    const app = Fastify();
    registerV5ClothoRoutes(
      app,
      credentials,
      createV5Clotho(createV5Lachesis({ commit: vi.fn(), search }))
    );
    try {
      const input = {
        contract_version: 5,
        world_id: worldId,
        text: "Dan jong"
      };
      const send = (payload: unknown) =>
        app.inject({
          method: "POST",
          url: "/v2/clotho/event.search",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
          },
          payload: JSON.stringify(payload)
        });
      expect((await send({ ...input, canon_id: worldId })).statusCode).toBe(
        422
      );
      expect((await send({ ...input, world_id: actorId })).statusCode).toBe(
        403
      );
      expect((await send(input)).json()).toEqual({
        contract_version: 5,
        result: { source_revision: 31, events: [], next_cursor: null }
      });
      expect(search).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it("authenticates before parsing and rejects v4, spoofed, stale-world writes", async () => {
    const commit = vi.fn().mockResolvedValue({ current_revision: 32 });
    // Fastify's default removeAdditional setting must not launder fields.
    const app = Fastify();
    registerV5ClothoRoutes(
      app,
      credentials,
      createV5Clotho(createV5Lachesis({ commit }))
    );
    const send = (body: unknown, bearer = token) =>
      app.inject({
        method: "POST",
        url: "/v2/clotho/change.commit",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
        },
        payload: JSON.stringify(body)
      });
    try {
      expect((await send({ contract_version: 4 }, "")).statusCode).toBe(401);
      expect((await send({ ...plan, contract_version: 4 })).statusCode).toBe(
        422
      );
      expect((await send({ ...plan, actor: actorId })).statusCode).toBe(422);
      expect((await send({ ...plan, world_id: actorId })).statusCode).toBe(403);
      expect(commit).not.toHaveBeenCalled();
      const policy = await app.inject({
        method: "POST",
        url: "/v2/clotho/authoring.policy.get",
        headers: { authorization: `Bearer ${token}` },
        payload: { world_id: worldId, contract_version: 5 }
      });
      expect(policy.statusCode).toBe(200);
      expect(policy.json()).toEqual({
        contract_version: 5,
        result: V5_AUTHORING_POLICY
      });
      expect(policy.headers["cache-control"]).toBe("no-store");
      const response = await send(plan);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        contract_version: 5,
        result: { current_revision: 32 }
      });
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({ actor: actorId })
      );
      expect(
        app.hasRoute({ method: "POST", url: "/v1/clotho/change.commit" })
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
});
