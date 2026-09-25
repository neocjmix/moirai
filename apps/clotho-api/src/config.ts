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

  return {
    contractMode: contractMode as NonNullable<RuntimeConfig["contractMode"]>,
    credentials: parseCredentials(environment.CLOTHO_CREDENTIALS_JSON),
    oidc: parseOidcConfig(environment.CLOTHO_OIDC_JSON),
    appVersion: environment.APP_VERSION ?? "0.0.0-dev",
    commitSha:
      environment.DEPLOY_COMMIT_SHA ??
      environment.RAILWAY_GIT_COMMIT_SHA ??
      "local",
    databaseUrl,
    port: Number(environment.PORT ?? "3001")
  };
}
