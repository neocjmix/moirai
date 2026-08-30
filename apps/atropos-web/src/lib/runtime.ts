export interface PublicRuntimeMetadata {
  readonly version: string;
  readonly commitSha: string;
  readonly deployedAt: string;
}

const PROCESS_STARTED_AT = new Date().toISOString();

export function getPublicRuntimeMetadata(
  environment: Readonly<Record<string, string | undefined>> = process.env
): PublicRuntimeMetadata {
  return {
    version: environment.APP_VERSION ?? "0.0.0-dev",
    commitSha:
      environment.DEPLOY_COMMIT_SHA ??
      environment.RAILWAY_GIT_COMMIT_SHA ??
      "local",
    deployedAt: environment.DEPLOYED_AT ?? PROCESS_STARTED_AT
  };
}
