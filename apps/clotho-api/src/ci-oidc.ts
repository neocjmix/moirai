import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTVerifyGetKey
} from "jose";
import { CLOTHO_CONNECTION_WORLD, type OidcAuthenticator } from "./oidc.js";

export const GITHUB_ACTIONS_ISSUER =
  "https://token.actions.githubusercontent.com";
const repository = "neocjmix/moirai";
const repositoryId = "1349494474";
const ownerId = "4980032";
const subject = "repo:neocjmix@4980032/moirai@1349494474:ref:refs/heads/main";
const workflow =
  "neocjmix/moirai/.github/workflows/post-deploy-smoke.yml@refs/heads/main";

/** Public trust settings, never a token or a configurable authorization grant. */
export interface CiOidcConfig {
  readonly resource: string;
  readonly repository: string;
  readonly repository_id: string;
  readonly repository_owner_id: string;
  readonly actor_id: string;
}

export function parseCiOidcConfig(
  value: string | undefined
): CiOidcConfig | undefined {
  if (!value) return undefined;
  try {
    const config = JSON.parse(value) as CiOidcConfig;
    if (
      !config ||
      Array.isArray(config) ||
      Object.keys(config).sort().join() !==
        [
          "resource",
          "repository",
          "repository_id",
          "repository_owner_id",
          "actor_id"
        ]
          .sort()
          .join()
    )
      throw new Error();
    const resource = new URL(config.resource);
    if (
      resource.protocol !== "https:" ||
      resource.username ||
      resource.password ||
      resource.search ||
      resource.hash ||
      resource.pathname !== "/mcp" ||
      !resource.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(
        resource.hostname
      ) ||
      resource.hostname.endsWith(".internal") ||
      config.repository !== repository ||
      config.repository_id !== repositoryId ||
      config.repository_owner_id !== ownerId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        config.actor_id
      )
    )
      throw new Error();
    return config;
  } catch {
    throw new Error("Invalid Clotho CI OIDC configuration");
  }
}

export function ciOidcAuthenticator(
  config: CiOidcConfig | undefined,
  // Tests may inject a key. Production can use only GitHub Actions' fixed JWKS.
  key?: JWTVerifyGetKey
): OidcAuthenticator {
  if (!config) return async () => undefined;
  const jwks =
    key ??
    createRemoteJWKSet(new URL(`${GITHUB_ACTIONS_ISSUER}/.well-known/jwks`), {
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
      const token = header.slice(7);
      // This only selects the verifier; signed claims below determine access.
      if (decodeJwt(token).iss !== GITHUB_ACTIONS_ISSUER) return undefined;
      const { payload } = await jwtVerify(token, jwks, {
        issuer: GITHUB_ACTIONS_ISSUER,
        audience: config.resource,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "iat", "exp", "nbf"],
        maxTokenAge: 300,
        clockTolerance: 0
      });
      if (
        payload.aud !== config.resource ||
        payload.sub !== subject ||
        !payload.iat ||
        !payload.exp ||
        !Number.isInteger(payload.iat) ||
        !Number.isInteger(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 300 ||
        payload.repository !== config.repository ||
        payload.repository_id !== config.repository_id ||
        payload.repository_owner_id !== config.repository_owner_id ||
        payload.ref !== "refs/heads/main" ||
        payload.ref_type !== "branch" ||
        payload.workflow_ref !== workflow ||
        (payload.event_name !== "workflow_run" &&
          payload.event_name !== "workflow_dispatch")
      )
        return undefined;
      return {
        actor_id: config.actor_id,
        world_ids: [CLOTHO_CONNECTION_WORLD],
        scopes: ["world:read", "world:write"],
        expires_at: new Date(payload.exp * 1000).toISOString()
      };
    } catch {
      // Never surface JWT, key-provider or private diagnostic details.
      return undefined;
    }
  };
}
