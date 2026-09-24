import { createHash } from "node:crypto";
import Fastify from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { createV5Lachesis } from "@moirai/lachesis/v5";
import { registerV5McpRoutes } from "./v5-mcp.js";
import {
  CLOTHO_CONNECTION_WORLD,
  oidcAuthenticator,
  type OidcConfig
} from "./oidc.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const token = "stageOnlyBearerToken0123456789abcd";
describe("inactive v5 MCP transport", () => {
  it("accepts a scoped Auth0-style access token and denies write with read-only scope", async () => {
    const keys = await generateKeyPair("RS256");
    const oidc: OidcConfig = {
      issuer: "https://identity.example.test/",
      jwks_uri: "https://identity.example.test/keys",
      resource: "https://api.example.test/mcp",
      operator_subject: "synthetic-operator",
      actor_id: "019f5000-1100-7000-8000-000000000002"
    };
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ scope: "world:read" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(oidc.issuer)
      .setAudience(oidc.resource)
      .setSubject(oidc.operator_subject)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(keys.privateKey);
    const app = Fastify();
    const commit = vi.fn().mockResolvedValue({ current_revision: 32 });
    registerV5McpRoutes(
      app,
      [],
      createV5Clotho(createV5Lachesis({ commit })),
      oidc,
      oidcAuthenticator(oidc, async () => keys.publicKey)
    );
    const send = (name: string, args: unknown) =>
      app.inject({
        method: "POST",
        url: "/mcp-v5",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json, text/event-stream"
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args }
        }
      });
    try {
      const policy = await send("authoring_policy_get", {
        world_id: CLOTHO_CONNECTION_WORLD,
        contract_version: 5
      });
      expect(policy.json().result.structuredContent.result).toEqual(
        V5_AUTHORING_POLICY
      );
      expect(
        (
          await send("change_commit", {
            contract_version: 5,
            world_id: CLOTHO_CONNECTION_WORLD
          })
        ).json().result.isError
      ).toBe(true);
      expect(commit).not.toHaveBeenCalled();
      expect(policy.body).not.toContain(accessToken);
    } finally {
      await app.close();
    }
  });
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
