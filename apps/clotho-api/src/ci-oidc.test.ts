import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import type { MoiraiDatabase } from "@moirai/persistence";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { describe, expect, it, vi } from "vitest";
import { ciOidcAuthenticator, type CiOidcConfig } from "./ci-oidc.js";
import * as ciModule from "./ci-oidc.js";
import * as oidcModule from "./oidc.js";
import { CLOTHO_CONNECTION_WORLD } from "./oidc.js";
import { buildApp } from "./app.js";

const config: CiOidcConfig = {
  resource: "https://api.example.test/mcp",
  repository: "neocjmix/moirai",
  repository_id: "1349494474",
  repository_owner_id: "4980032",
  actor_id: "019f5000-1100-7000-8000-000000000003"
};
const keys = generateKeyPair("RS256");
async function sign(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: "https://token.actions.githubusercontent.com",
    aud: config.resource,
    sub: "repo:neocjmix@4980032/moirai@1349494474:ref:refs/heads/main",
    iat: now,
    exp: now + 300,
    nbf: now,
    repository: config.repository,
    repository_id: config.repository_id,
    repository_owner_id: config.repository_owner_id,
    ref: "refs/heads/main",
    ref_type: "branch",
    workflow_ref:
      "neocjmix/moirai/.github/workflows/post-deploy-smoke.yml@refs/heads/main",
    event_name: "workflow_run",
    ...overrides
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign((await keys).privateKey);
}

describe("GitHub Actions CI authentication", () => {
  it("maps only the exact signed main smoke workflow to fixed CI grants", async () => {
    const verify = ciOidcAuthenticator(
      config,
      async () => (await keys).publicKey
    );
    for (const event_name of ["workflow_run", "workflow_dispatch"])
      expect(
        await verify(
          `Bearer ${await sign({
            event_name,
            scope: "admin export",
            all_worlds: true,
            world_ids: ["019f5000-1100-7000-8000-000000000099"]
          })}`
        )
      ).toEqual({
        actor_id: config.actor_id,
        world_ids: [CLOTHO_CONNECTION_WORLD],
        scopes: ["world:read", "world:write"],
        expires_at: expect.any(String)
      });
  });

  it("rejects missing claims and incorrect issuer, audience, repository, workflow, branch, event or lifetime", async () => {
    const verify = ciOidcAuthenticator(
      config,
      async () => (await keys).publicKey
    );
    const now = Math.floor(Date.now() / 1000);
    const invalid = [
      { iss: "https://attacker.example.test" },
      { aud: "https://other.example.test/mcp" },
      { aud: [config.resource, "https://other.example.test/mcp"] },
      { sub: "repo:neocjmix/moirai:ref:refs/heads/main" },
      { sub: "repo:attacker/fork:ref:refs/heads/main" },
      { repository: "attacker/fork" },
      { repository_id: "999" },
      { repository_id: Number(config.repository_id) },
      { repository_owner_id: "999" },
      { ref: "refs/heads/feature" },
      { ref_type: "tag" },
      {
        workflow_ref: "neocjmix/moirai/.github/workflows/ci.yml@refs/heads/main"
      },
      {
        workflow_ref:
          "neocjmix/moirai/.github/workflows/post-deploy-smoke.yml@refs/heads/feature"
      },
      { event_name: "pull_request" },
      { event_name: "push" },
      { event_name: "dynamic" },
      { event_name: ["workflow_run"] },
      { exp: now - 1 },
      { iat: now + 60, exp: now + 300 },
      { iat: now - 301, exp: now + 1 },
      { exp: now + 301 },
      { nbf: now + 60 },
      ...[
        "iss",
        "aud",
        "sub",
        "iat",
        "exp",
        "nbf",
        "repository",
        "repository_id",
        "repository_owner_id",
        "ref",
        "ref_type",
        "workflow_ref",
        "event_name"
      ].map((claim) => ({ [claim]: undefined }))
    ];
    for (const claims of invalid)
      expect(
        await verify(`Bearer ${await sign(claims)}`),
        JSON.stringify(claims)
      ).toBeUndefined();
    expect(await verify(undefined)).toBeUndefined();
    expect(await verify("Bearer malformed")).toBeUndefined();
    expect(
      await ciOidcAuthenticator(undefined)(`Bearer ${await sign()}`)
    ).toBeUndefined();
    const wrongKey = await generateKeyPair("RS256");
    expect(
      await ciOidcAuthenticator(
        config,
        async () => wrongKey.publicKey
      )(`Bearer ${await sign()}`)
    ).toBeUndefined();
  });

  it("wires CI into REST and MCP while preserving Auth0/static auth and World denial", async () => {
    const ciFactory = ciModule.ciOidcAuthenticator;
    const operatorFactory = oidcModule.oidcAuthenticator;
    const ciSpy = vi
      .spyOn(ciModule, "ciOidcAuthenticator")
      .mockImplementation((settings) =>
        ciFactory(settings, async () => (await keys).publicKey)
      );
    const operatorSpy = vi
      .spyOn(oidcModule, "oidcAuthenticator")
      .mockImplementation((settings) =>
        operatorFactory(settings, async () => (await keys).publicKey)
      );
    const oidc = {
      issuer: "https://identity.example.test/",
      jwks_uri: "https://identity.example.test/keys",
      resource: config.resource,
      operator_subject: "synthetic-operator",
      actor_id: "019f5000-1100-7000-8000-000000000004"
    };
    const staticToken = "syntheticStaticOperatorCredential0123456789";
    const app = buildApp(
      {
        contractMode: "v5",
        appVersion: "5",
        commitSha: "syntheticsha",
        databaseUrl: "postgres://unused",
        port: 3001,
        ciOidc: config,
        oidc,
        credentials: [
          {
            token_sha256: createHash("sha256")
              .update(staticToken)
              .digest("hex"),
            actor_id: "019f5000-1100-7000-8000-000000000005",
            world_ids: [CLOTHO_CONNECTION_WORLD],
            scopes: ["world:read", "world:write"],
            expires_at: "2099-01-01T00:00:00Z"
          }
        ]
      },
      { destroy: vi.fn(async () => undefined) } as unknown as MoiraiDatabase
    );
    const http = (token: string | undefined, world = CLOTHO_CONNECTION_WORLD) =>
      app.inject({
        method: "POST",
        url: "/v2/clotho/authoring.policy.get",
        headers: token ? { authorization: `Bearer ${token}` } : {},
        payload: { contract_version: 5, world_id: world }
      });
    const mcp = (token: string | undefined, world = CLOTHO_CONNECTION_WORLD) =>
      app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          accept: "application/json, text/event-stream",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "authoring_policy_get",
            arguments: { contract_version: 5, world_id: world }
          }
        }
      });
    try {
      const token = await sign();
      for (const accepted of [token, staticToken]) {
        expect((await http(accepted)).json().result).toEqual(
          V5_AUTHORING_POLICY
        );
        expect(
          (await mcp(accepted)).json().result.structuredContent.result
        ).toEqual(V5_AUTHORING_POLICY);
      }
      const operatorToken = await sign({
        iss: oidc.issuer,
        sub: oidc.operator_subject,
        scope: "world:read"
      });
      expect(
        (await mcp(operatorToken)).json().result.structuredContent.result
      ).toEqual(V5_AUTHORING_POLICY);
      expect((await http(operatorToken)).statusCode).toBe(401);
      const outside = "019f5000-1100-7000-8000-000000000099";
      expect((await http(token, outside)).statusCode).toBe(403);
      const denied = (await mcp(token, outside)).json().result;
      expect(JSON.parse(denied.content[0].text).error.code).toBe("forbidden");
      expect(denied._meta).toBeUndefined();
      const expired = await sign({ exp: Math.floor(Date.now() / 1000) - 1 });
      for (const invalid of [undefined, expired]) {
        expect((await http(invalid)).statusCode).toBe(401);
        expect((await mcp(invalid)).statusCode).toBe(401);
      }
    } finally {
      await app.close();
      ciSpy.mockRestore();
      operatorSpy.mockRestore();
    }
  });
});
