import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Principal } from "./auth.js";

export const CLOTHO_CONNECTION_WORLD = "01995c2a-7b00-7000-8000-000000000101";

export interface OidcConfig {
  readonly issuer: string;
  readonly jwks_uri: string;
  readonly resource: string;
  readonly operator_subject: string;
  readonly actor_id: string;
}

function publicHttps(value: unknown): URL {
  if (typeof value !== "string") throw new Error();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.hostname.includes(".") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname) ||
    url.hostname.endsWith(".internal")
  )
    throw new Error();
  return url;
}

export function parseOidcConfig(
  value: string | undefined
): OidcConfig | undefined {
  if (!value) return undefined;
  try {
    const config = JSON.parse(value) as OidcConfig;
    if (!config || Array.isArray(config)) throw new Error();
    if (
      Object.keys(config).sort().join() !==
      ["issuer", "jwks_uri", "resource", "operator_subject", "actor_id"]
        .sort()
        .join()
    )
      throw new Error();
    const issuer = publicHttps(config.issuer);
    const jwks = publicHttps(config.jwks_uri);
    const resource = publicHttps(config.resource);
    if (
      issuer.origin !== jwks.origin ||
      resource.pathname !== "/mcp" ||
      typeof config.operator_subject !== "string" ||
      !config.operator_subject.length ||
      config.operator_subject.length > 256 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        config.actor_id
      )
    )
      throw new Error();
    return config;
  } catch {
    throw new Error("Invalid Clotho OIDC configuration");
  }
}

export type OidcAuthenticator = (
  header: string | undefined
) => Promise<Principal | undefined>;

export function oidcAuthenticator(
  config: OidcConfig | undefined,
  // Injectable only by tests; production always uses the configured issuer's JWKS.
  key?: JWTVerifyGetKey
): OidcAuthenticator {
  if (!config) return async () => undefined;
  const jwks =
    key ??
    createRemoteJWKSet(new URL(config.jwks_uri), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 300_000
    });
  return async (header) => {
    if (
      !header ||
      header.length > 8_192 ||
      !/^Bearer [A-Za-z0-9_.-]+$/.test(header)
    )
      return undefined;
    try {
      const { payload } = await jwtVerify(header.slice(7), jwks, {
        issuer: config.issuer,
        audience: config.resource,
        algorithms: ["RS256", "ES256"],
        requiredClaims: ["sub", "iat", "exp"],
        maxTokenAge: 3_600,
        clockTolerance: 0
      });
      if (
        payload.sub !== config.operator_subject ||
        !payload.exp ||
        !payload.iat ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 3_600 ||
        typeof payload.scope !== "string" ||
        payload.scope.length > 1_024
      )
        return undefined;
      const granted = new Set(payload.scope.split(" "));
      const scopes = (["world:read", "world:write"] as const).filter((s) =>
        granted.has(s)
      );
      if (!scopes.length) return undefined;
      return {
        actor_id: config.actor_id,
        world_ids: [CLOTHO_CONNECTION_WORLD],
        scopes,
        expires_at: new Date(payload.exp * 1000).toISOString()
      };
    } catch {
      // JWT/JWKS errors can contain issuer details or token material.
      return undefined;
    }
  };
}
