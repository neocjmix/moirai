import { createHash } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { V5_INPUT_SCHEMAS, V5_METHODS } from "@moirai/contracts/v5-wire";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { ChangeSetError } from "@moirai/domain";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { createV5Lachesis } from "@moirai/lachesis/v5";
import { registerV5McpRoutes } from "./v5-mcp.js";
import { registerV5ClothoRoutes } from "./v5-routes.js";
const world = "019f5000-1100-7000-8000-000000000001";
const token = "syntheticV5ParityToken0123456789abcd";
const plan = {
  contract_version: 5,
  world_id: world,
  expected_revision: 31,
  change_set_id: "019f5000-1100-7000-8000-000000000002",
  intent: "Synthetic",
  origins: [{ kind: "human_instruction", summary: "Synthetic" }],
  policy_version: V5_AUTHORING_POLICY.policy_version,
  policy_digest: V5_AUTHORING_POLICY.policy_digest,
  operations: [
    {
      kind: "withdraw",
      entity_type: "event",
      entity_id: "019f5000-1100-7000-8000-000000000003",
      origin_refs: [{ field: "*", origin_index: 0 }]
    }
  ]
};

describe("production v5 transport parity", () => {
  it("publishes shared schemas, dispatches reads and validate, and preserves recovery across HTTP/MCP", async () => {
    const commit = vi.fn(),
      validate = vi.fn().mockResolvedValue({ valid: true, provisional: true });
    const query = vi.fn().mockResolvedValue({ source_revision: 31, items: [] });
    const service = createV5Clotho(
      createV5Lachesis({ commit, validate, query })
    );
    const credentials = [
      {
        token_sha256: createHash("sha256").update(token).digest("hex"),
        actor_id: world,
        world_ids: [world],
        scopes: ["world:read", "world:write"] as (
          "world:read" | "world:write"
        )[],
        expires_at: "2099-01-01T00:00:00Z"
      }
    ];
    const app = Fastify();
    registerV5ClothoRoutes(app, credentials, service);
    registerV5McpRoutes(app, credentials, service);
    const http = (method: string, payload: unknown) =>
      app.inject({
        method: "POST",
        url: `/v2/clotho/${method}`,
        headers: { authorization: `Bearer ${token}` },
        payload
      });
    const mcp = (method: string, args?: unknown) =>
      app.inject({
        method: "POST",
        url: "/mcp-v5",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream"
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: args ? "tools/call" : "tools/list",
          ...(args ? { params: { name: method, arguments: args } } : {})
        }
      });
    try {
      const tools = (await mcp("tools/list")).json().result.tools;
      expect(tools).toHaveLength(V5_METHODS.length);
      for (const method of V5_METHODS)
        expect(
          tools.find(
            (t: { name: string }) =>
              t.name === method.replaceAll(".", "_").replaceAll("-", "_")
          ).inputSchema
        ).toEqual(V5_INPUT_SCHEMAS[method]);
      for (const [method, args] of [
        ["world.list", { contract_version: 5 }],
        ["world.get", { contract_version: 5, world_id: world }],
        ["collection.list", { contract_version: 5, world_id: world }],
        [
          "collection.get",
          { contract_version: 5, world_id: world, collection_id: world }
        ],
        [
          "event.neighbors",
          { contract_version: 5, world_id: world, event_id: world }
        ],
        [
          "context.slice",
          {
            contract_version: 5,
            world_id: world,
            seed_ids: [world],
            collection_ids: []
          }
        ],
        [
          "time-event.resolve",
          {
            contract_version: 5,
            world_id: world,
            time_system_id: world,
            definition_version: "1",
            coordinate: "1592"
          }
        ],
        ["world.export", { contract_version: 5, world_id: world }]
      ] as const) {
        expect((await http(method, args)).json()).toEqual(
          (
            await mcp(method.replaceAll(".", "_").replaceAll("-", "_"), args)
          ).json().result.structuredContent
        );
      }
      expect(query).toHaveBeenCalledWith(
        "world.list",
        { contract_version: 5 },
        [world]
      );
      expect((await http("change.validate", plan)).json().result.valid).toBe(
        true
      );
      expect(
        (await mcp("change_validate", plan)).json().result.structuredContent
          .result.valid
      ).toBe(true);
      expect(commit).not.toHaveBeenCalled();
      expect(validate).toHaveBeenCalledTimes(2);
      query.mockRejectedValueOnce(
        new ChangeSetError(
          "revision_conflict",
          "at_revision",
          "refresh",
          [world],
          true,
          { action: "refresh_context", current_revision: 32 }
        )
      );
      const error = JSON.parse(
        (
          await mcp("world_get", {
            contract_version: 5,
            world_id: world,
            at_revision: 31
          })
        ).json().result.content[0].text
      ).error;
      expect(error).toMatchObject({
        code: "revision_conflict",
        path: "at_revision",
        affected_ids: [world],
        retryable: true,
        recovery: { action: "refresh_context", current_revision: 32 }
      });
      const missingPolicy = { ...plan, policy_version: undefined };
      expect(
        (await http("change.commit", missingPolicy)).json().error
      ).toMatchObject({
        code: "authoring_policy_required",
        recovery: { action: "authoring.policy.get" }
      });
      expect(
        (await http("change.commit", { ...plan, contract_version: 4 })).json()
          .error.code
      ).toBe("unsupported_contract_version");
      expect(
        (
          await http("world.get", {
            contract_version: 5,
            world_id: "019f5000-1100-7000-8000-000000000009"
          })
        ).statusCode
      ).toBe(403);
      expect(
        (await http("world.list", { contract_version: 5, actor: world }))
          .statusCode
      ).toBe(422);
    } finally {
      await app.close();
    }
  });
});
