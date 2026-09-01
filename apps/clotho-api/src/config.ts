import { parseCredentials, type Credential } from "./auth.js";
import { parseOidcConfig, type OidcConfig } from "./oidc.js";

export interface RuntimeConfig {
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

  return {
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
