import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CLOTHO_METHODS, CONTRACT_VERSION } from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";
import Fastify from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerClotho } from "./clotho.js";
import { registerMcp } from "./mcp.js";
import {
  CLOTHO_CONNECTION_WORLD,
  oidcAuthenticator,
  type OidcAuthenticator,
  type OidcConfig
} from "./oidc.js";
import type { Credential } from "./auth.js";

const token = randomBytes(32).toString("base64url");
const credential: Credential = {
  token_sha256: createHash("sha256").update(token).digest("hex"),
  actor_id: "01995c2a-7b00-7000-8000-000000000199",
  scopes: ["world:read", "world:write"],
  world_ids: [CLOTHO_CONNECTION_WORLD],
  expires_at: "2099-01-01T00:00:00Z"
};
const oidc: OidcConfig = {
  issuer: "https://identity.example.test/",
  jwks_uri: "https://identity.example.test/keys",
  resource: "https://api.example.test/mcp",
  operator_subject: "synthetic-operator",
  actor_id: credential.actor_id
};
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function setup(
  records = [credential],
  withOidc = false,
  verify?: OidcAuthenticator
) {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  const execute = vi.fn(async () => ({ ok: true }));
  registerClotho(app, records, execute);
  registerMcp(
    app,
    {
      credentials: records,
      version: "test",
      oidc: withOidc ? oidc : undefined
    },
    execute,
    verify
  );
  cleanup.push(() => app.close());
  const send = (
    body: unknown,
    authorization = `Bearer ${token}`,
    extraHeaders = {}
  ) =>
    app.inject({
      method: "POST",
      url: "/mcp",
      payload: body as object,
      headers: {
        authorization,
        accept: "application/json, text/event-stream",
        ...extraHeaders
      }
    });
  const call = (name: string, args = {}) =>
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args }
    });
  return { app, execute, send, call };
}

describe("Clotho MCP transport", () => {
  it("accepts an OIDC access token through MCP without a static bearer credential", async () => {
    const keys = await generateKeyPair("RS256");
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ scope: "world:read" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(oidc.issuer)
      .setAudience(oidc.resource)
      .setSubject(oidc.operator_subject)
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(keys.privateKey);
    const { send, execute } = setup(
      [],
      true,
      oidcAuthenticator(oidc, async () => keys.publicKey)
    );
    const response = await send(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "world_get",
          arguments: { world_id: CLOTHO_CONNECTION_WORLD }
        }
      },
      `Bearer ${accessToken}`
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().result.structuredContent.result).toEqual({
      ok: true
    });
    expect(execute).toHaveBeenCalledWith(
      "world.get",
      expect.anything(),
      expect.objectContaining({
        actor_id: credential.actor_id,
        world_ids: [CLOTHO_CONNECTION_WORLD],
        scopes: ["world:read"]
      })
    );
    expect(response.body).not.toContain(accessToken);
    expect(response.body).not.toContain(oidc.operator_subject);
    const denied = await send(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "change_commit",
          arguments: {}
        }
      },
      `Bearer ${accessToken}`
    );
    expect(denied.json().result._meta["mcp/www_authenticate"][0]).toContain(
      "insufficient_scope"
    );
  });
  it("releases concurrency slots after denied and successful requests", async () => {
    const { send, call } = setup();
    for (let i = 0; i < 40; i++) {
      expect((await send({}, "Bearer invalid")).statusCode).toBe(401);
      expect((await call("world_list")).statusCode).toBe(200);
    }
  });
  it("requires authentication before parsing and exposes only allowlisted OAuth metadata", async () => {
    const { app, send, execute } = setup([], true);
    const response = await send({ token: "private-input" });
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain(
      "/.well-known/oauth-protected-resource/mcp"
    );
    expect(response.body).not.toContain("private-input");
    const metadata = await app.inject(
      "/.well-known/oauth-protected-resource/mcp"
    );
    expect(metadata.json()).toEqual({
      resource: oidc.resource,
      authorization_servers: [oidc.issuer],
      scopes_supported: ["world:read", "world:write"],
      bearer_methods_supported: ["header"]
    });
    expect(metadata.body).not.toMatch(/operator|subject|actor|jwks/);
    expect(execute).not.toHaveBeenCalled();
  });
  it("supports a real SDK client initialize, tool discovery and bounded query", async () => {
    const { app, execute } = setup();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const client = new Client({ name: "synthetic-test", version: "1" });
    cleanup.push(() => client.close());
    const transport = new StreamableHTTPClientTransport(
      new URL(`${address}/mcp`),
      {
        requestInit: { headers: { authorization: `Bearer ${token}` } }
      }
    );
    await client.connect(transport as Parameters<typeof client.connect>[0]);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(CLOTHO_METHODS.length);
    expect(
      tools.find((tool) => tool.name === "change_commit")?.annotations
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    expect(
      tools.find((tool) => tool.name === "change_validate")?.annotations
        ?.readOnlyHint
    ).toBe(true);
    const result = await client.callTool({
      name: "world_get",
      arguments: { world_id: CLOTHO_CONNECTION_WORLD }
    });
    expect(result.structuredContent).toEqual({
      contract_version: CONTRACT_VERSION,
      result: { ok: true }
    });
    expect(execute).toHaveBeenCalledWith(
      "world.get",
      { world_id: CLOTHO_CONNECTION_WORLD },
      expect.objectContaining({ actor_id: credential.actor_id })
    );
  });
  it("enforces method scope, fixed World and JSON schema before execution", async () => {
    const { call, execute } = setup([
      { ...credential, scopes: ["world:read"] }
    ]);
    for (const [name, args, code] of [
      ["change_commit", {}, "forbidden"],
      ["world_get", { world_id: credential.actor_id }, "forbidden"],
      ["world_list", { limit: "2" }, "invalid_request"],
      ["world_list", { token: "private-input" }, "invalid_request"],
      ["unknown", {}, "unknown_tool"]
    ] as const) {
      const response = await call(name, args);
      expect(response.json().result.isError).toBe(true);
      expect(response.body).toContain(code);
      expect(response.body).not.toContain("private-input");
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it("blocks browser Origin, batches, oversized bodies and stateful methods", async () => {
    const { app, send, execute } = setup();
    expect(
      (await send({}, undefined, { origin: "https://attacker.example.test" }))
        .statusCode
    ).toBe(403);
    expect(
      (await send([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])).statusCode
    ).toBe(400);
    expect((await send({ text: "x".repeat(1_048_576) })).statusCode).toBe(413);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/mcp",
          headers: { authorization: `Bearer ${token}` }
        })
      ).statusCode
    ).toBe(405);
    expect(
      (await app.inject("/.well-known/oauth-protected-resource")).statusCode
    ).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });
  it("preserves safe recovery but never serializes executor diagnostics", async () => {
    const { call, execute } = setup();
    execute.mockRejectedValueOnce(
      new Error("private-host /srv/private.sql SELECT credential")
    );
    const failed = await call("world_list");
    expect(failed.body).toContain("internal_error");
    expect(failed.body).not.toMatch(/private|SELECT|credential/);
    execute.mockRejectedValueOnce(
      new ChangeSetError(
        "revision_conflict",
        "expected_revision",
        "private",
        [],
        true,
        { action: "refresh_context", current_revision: 3 }
      )
    );
    expect((await call("world_list")).body).toContain("refresh_context");
  });
});
