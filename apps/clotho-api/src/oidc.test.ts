import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  CLOTHO_CONNECTION_WORLD,
  oidcAuthenticator,
  parseOidcConfig,
  type OidcConfig
} from "./oidc.js";

const config: OidcConfig = {
  issuer: "https://identity.example.test/",
  jwks_uri: "https://identity.example.test/.well-known/jwks.json",
  resource: "https://api.example.test/mcp",
  operator_subject: "synthetic-operator",
  actor_id: "01995c2a-7b00-7000-8000-000000000199"
};
const keys = generateKeyPair("RS256");
async function sign(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: config.issuer,
    aud: config.resource,
    sub: config.operator_subject,
    iat: now,
    exp: now + 600,
    scope: "world:read world:write admin export",
    ...overrides
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign((await keys).privateKey);
}

describe("OIDC resource authentication", () => {
  it("maps only an explicitly allowed operator to an internal actor and fixed World", async () => {
    const authenticate = oidcAuthenticator(
      config,
      async () => (await keys).publicKey
    );
    const principal = await authenticate(`Bearer ${await sign()}`);
    expect(principal).toMatchObject({
      actor_id: config.actor_id,
      world_ids: [CLOTHO_CONNECTION_WORLD],
      scopes: ["world:read", "world:write"]
    });
    expect(JSON.stringify(principal)).not.toContain(config.operator_subject);
  });
  it("rejects signature, issuer, audience, subject, lifetime and scope violations", async () => {
    const authenticate = oidcAuthenticator(
      config,
      async () => (await keys).publicKey
    );
    const now = Math.floor(Date.now() / 1000);
    for (const claims of [
      { iss: "https://attacker.example.test/" },
      { aud: "other-api" },
      { sub: "someone-else" },
      { exp: now - 1 },
      { exp: now + 7200 },
      { nbf: now + 60 },
      { iat: now + 60 },
      { scope: "admin export" },
      { scope: ["world:read"] },
      { exp: undefined },
      { iat: undefined }
    ])
      expect(
        await authenticate(`Bearer ${await sign(claims)}`)
      ).toBeUndefined();
    const otherKey = await generateKeyPair("RS256");
    const wrongSignature = oidcAuthenticator(
      config,
      async () => otherKey.publicKey
    );
    expect(await wrongSignature(`Bearer ${await sign()}`)).toBeUndefined();
    expect(await authenticate("Bearer malformed")).toBeUndefined();
    expect(await authenticate(undefined)).toBeUndefined();
  });
  it("never upgrades read-only scope, and fails closed without configuration", async () => {
    const authenticate = oidcAuthenticator(
      config,
      async () => (await keys).publicKey
    );
    expect(
      (await authenticate(`Bearer ${await sign({ scope: "world:read" })}`))
        ?.scopes
    ).toEqual(["world:read"]);
    expect(
      await oidcAuthenticator(undefined)(`Bearer ${await sign()}`)
    ).toBeUndefined();
  });
  it("validates explicit HTTPS configuration without reflecting private settings", () => {
    expect(parseOidcConfig(undefined)).toBeUndefined();
    expect(parseOidcConfig(JSON.stringify(config))).toEqual(config);
    for (const invalid of [
      { ...config, issuer: "http://identity.example.test/" },
      { ...config, jwks_uri: "https://other.example.test/keys" },
      { ...config, resource: "https://api.example.test/mcp?secret=private" },
      { ...config, operator_subject: "" },
      { ...config, actor_id: "external-subject" },
      { ...config, world_ids: ["unapproved"] }
    ])
      expect(() => parseOidcConfig(JSON.stringify(invalid))).toThrow(
        "Invalid Clotho OIDC configuration"
      );
  });
});
