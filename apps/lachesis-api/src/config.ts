export interface RuntimeConfig {
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
    appVersion: environment.APP_VERSION ?? "0.0.0-dev",
    commitSha: environment.DEPLOY_COMMIT_SHA ?? "local",
    databaseUrl,
    port: Number(environment.PORT ?? "3001")
  };
}
