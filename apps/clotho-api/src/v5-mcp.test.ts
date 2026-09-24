import { createHash } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { createV5Lachesis } from "@moirai/lachesis/v5";
import { registerV5McpRoutes } from "./v5-mcp.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const token = "stageOnlyBearerToken0123456789abcd";
describe("inactive v5 MCP transport", () => {
  it("requires a trusted actor, advertises v5 and refuses old authoring shapes", async () => {
    const app = Fastify();
    const commit = vi.fn().mockResolvedValue({ current_revision: 32 });
    registerV5McpRoutes(
      app,
      [
        {
          token_sha256: createHash("sha256").update(token).digest("hex"),
          actor_id: "019f5000-1100-7000-8000-000000000002",
          world_ids: [worldId],
          scopes: ["world:read", "world:write"],
          expires_at: "2099-01-01T00:00:00Z"
        }
      ],
      createV5Clotho(createV5Lachesis({ commit }))
    );
    const send = (
      method: string,
      name?: string,
      args?: unknown,
      authorized = true
    ) =>
      app.inject({
        method: "POST",
        url: "/mcp-v5",
        headers: {
          accept: "application/json, text/event-stream",
          ...(authorized ? { authorization: `Bearer ${token}` } : {})
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method,
          ...(name ? { params: { name, arguments: args } } : {})
        }
      });
    try {
      expect(
        (await send("tools/list", undefined, undefined, false)).statusCode
      ).toBe(401);
      const listing = await send("tools/list");
      expect(listing.statusCode).toBe(200);
      expect(
        listing.json().result.tools.map((tool: { name: string }) => tool.name)
      ).toEqual(["authoring_policy_get", "change_commit"]);
      const policy = await send("tools/call", "authoring_policy_get", {
        world_id: worldId,
        contract_version: 5
      });
      expect(policy.json().result.structuredContent).toEqual({
        contract_version: 5,
        result: V5_AUTHORING_POLICY
      });
      expect(
        (
          await send("tools/call", "authoring_policy_get", {
            world_id: worldId,
            contract_version: 4
          })
        ).json().result.isError
      ).toBe(true);
      const old = await send("tools/call", "change_commit", {
        contract_version: 4,
        world_id: worldId
      });
      expect(old.json().result.isError).toBe(true);
      expect(commit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
