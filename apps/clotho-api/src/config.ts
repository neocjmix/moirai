import { parseCredentials, type Credential } from "./auth.js";
import { parseOidcConfig, type OidcConfig } from "./oidc.js";

export interface RuntimeConfig {
  readonly contractMode?: "v4" | "quiesced" | "v5-readonly" | "v5";
  readonly credentials?: readonly Credential[];
  readonly oidc?: OidcConfig | undefined;
  readonly appVersion: string;
  readonly commitSha: string;
  readonly databaseUrl: string;
  readonly port: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const contractMode = environment.CLOTHO_CONTRACT_MODE ?? "v4";
  if (!["v4", "quiesced", "v5-readonly", "v5"].includes(contractMode)) {
    throw new Error("Invalid Clotho contract mode");
  }

  const fullAccess = environment.CLOTHO_OIDC_ALL_WORLDS;
  if (fullAccess !== undefined && !["true", "false"].includes(fullAccess))
    throw new Error("Invalid Clotho OIDC World access configuration");
  const oidc = parseOidcConfig(environment.CLOTHO_OIDC_JSON);
  if (fullAccess === "true" && !oidc)
    throw new Error("OIDC configuration required for full World access");

  return {
    contractMode: contractMode as NonNullable<RuntimeConfig["contractMode"]>,
    credentials: parseCredentials(environment.CLOTHO_CREDENTIALS_JSON),
    oidc:
      oidc && fullAccess !== undefined
        ? { ...oidc, all_worlds: fullAccess === "true" }
        : oidc,
    appVersion: environment.APP_VERSION ?? "0.0.0-dev",
    commitSha:
      environment.DEPLOY_COMMIT_SHA ??
      environment.RAILWAY_GIT_COMMIT_SHA ??
      "local",
    databaseUrl,
    port: Number(environment.PORT ?? "3001")
  };
}
