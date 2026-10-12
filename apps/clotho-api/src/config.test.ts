import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { parseCiOidcConfig, type CiOidcConfig } from "./ci-oidc.js";

const ci: CiOidcConfig = {
  resource: "https://api.example.test/mcp",
  repository: "neocjmix/moirai",
  repository_id: "1349494474",
  repository_owner_id: "4980032",
  actor_id: "019f5000-1100-7000-8000-000000000003"
};
const operator = {
  token_sha256: createHash("sha256")
    .update("syntheticOperatorCredential0123456789")
    .digest("hex"),
  actor_id: "019f5000-1100-7000-8000-000000000002",
  world_ids: ["019f5000-1100-7000-8000-000000000001"],
  scopes: ["world:read"],
  expires_at: "2099-01-01T00:00:00Z"
};
const oidc = {
  issuer: "https://identity.example.test/",
  jwks_uri: "https://identity.example.test/keys",
  resource: ci.resource,
  actor_id: "019f5000-1100-7000-8000-000000000004",
  operator_subject: "synthetic-operator"
};
const environment = { DATABASE_URL: "postgres://fixture.invalid/test" };

describe("isolated GitHub Actions CI trust configuration", () => {
  it("adds public CI trust without replacing operator credentials or Auth0 configuration", () => {
    const configured = {
      ...environment,
      CLOTHO_CREDENTIALS_JSON: JSON.stringify([operator]),
      CLOTHO_OIDC_JSON: JSON.stringify(oidc),
      CLOTHO_OIDC_ALL_WORLDS: "true",
      CLOTHO_CI_OIDC_JSON: JSON.stringify(ci)
    };
    expect(loadConfig(environment).ciOidc).toBeUndefined();
    expect(loadConfig(configured)).toMatchObject({
      credentials: [operator],
      oidc: { ...oidc, all_worlds: true },
      ciOidc: ci
    });
    expect(configured.CLOTHO_CREDENTIALS_JSON).toBe(JSON.stringify([operator]));
    expect(configured.CLOTHO_OIDC_JSON).toBe(JSON.stringify(oidc));
  });

  it("rejects broadened trust, invalid identity/resource and secret-style configurations", () => {
    expect(parseCiOidcConfig(undefined)).toBeUndefined();
    expect(parseCiOidcConfig(JSON.stringify(ci))).toEqual(ci);
    for (const value of [
      "not-json",
      JSON.stringify([ci]),
      ...[
        { ...ci, resource: "http://api.example.test/mcp" },
        { ...ci, resource: "https://api.example.test/mcp?private=value" },
        { ...ci, resource: "https://api.example.test/other" },
        { ...ci, resource: "https://127.0.0.1/mcp" },
        { ...ci, repository: "attacker/moirai" },
        { ...ci, repository_id: "999" },
        { ...ci, repository_owner_id: "999" },
        { ...ci, actor_id: "external-identity" },
        { ...ci, issuer: "https://attacker.example.test" },
        { ...ci, jwks_uri: "https://attacker.example.test/keys" },
        { ...ci, world_ids: [operator.world_ids[0]] },
        { ...ci, scopes: ["admin"] },
        { ...ci, all_worlds: true },
        { ...ci, token: "synthetic-token" }
      ].map((config) => JSON.stringify(config))
    ])
      expect(() => parseCiOidcConfig(value)).toThrow(
        "Invalid Clotho CI OIDC configuration"
      );
  });

  it("keeps the CI actor separate and binds the existing MCP resource", () => {
    for (const invalidCi of [
      { ...ci, actor_id: operator.actor_id },
      { ...ci, actor_id: oidc.actor_id },
      { ...ci, resource: "https://other.example.test/mcp" }
    ])
      expect(() =>
        loadConfig({
          ...environment,
          CLOTHO_CREDENTIALS_JSON: JSON.stringify([operator]),
          CLOTHO_OIDC_JSON: JSON.stringify(oidc),
          CLOTHO_CI_OIDC_JSON: JSON.stringify(invalidCi)
        })
      ).toThrow("Invalid Clotho CI OIDC configuration");
  });
});
