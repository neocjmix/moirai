export const CONTRACT_VERSION = "0.1.0";
export const SCHEMA_VERSION = "0.0.1";
export const PUBLICATION_FORMAT_VERSION = "0.1.0";

export type ProjectionStatus = "ready" | "building" | "failed";
export type SmokeResult = "passed" | "failed" | "running" | "unknown";

export interface SyntheticWorldFixture {
  readonly world_id: string;
  readonly label: string;
  readonly current_revision: number;
  readonly publication_target_revision: number;
  readonly served_revision: number;
  readonly projection_status: ProjectionStatus;
}

export const MILESTONE_ZERO_WORLD: SyntheticWorldFixture = Object.freeze({
  world_id: "world_m0_synthetic",
  label: "Milestone 0 synthetic World",
  current_revision: 0,
  publication_target_revision: 0,
  served_revision: 0,
  projection_status: "ready"
});

export interface HealthResponse {
  readonly status: "ok" | "not_ready";
  readonly service: "atropos-web" | "lachesis-api" | "lachesis-worker";
  readonly version: string;
  readonly commit_sha: string;
}

export const HEALTH_RESPONSE_SCHEMA = {
  $id: "moirai.health.v1",
  type: "object",
  additionalProperties: false,
  required: ["status", "service", "version", "commit_sha"],
  properties: {
    status: { enum: ["ok", "not_ready"] },
    service: {
      enum: ["atropos-web", "lachesis-api", "lachesis-worker"]
    },
    version: { type: "string", minLength: 1 },
    commit_sha: { type: "string", minLength: 1 }
  }
} as const;

export interface PublicStatusResponse {
  readonly application: {
    readonly service: "atropos-web";
    readonly version: string;
    readonly commit_sha: string;
    readonly deployed_at: string;
  };
  readonly versions: {
    readonly contract: string;
    readonly schema: string;
    readonly publication_format: string;
  };
  readonly synthetic_world: SyntheticWorldFixture;
  readonly smoke: {
    readonly result: SmokeResult;
    readonly checked_at: string | null;
    readonly run_url: string | null;
  };
  readonly surfaces: {
    readonly atropos: "ok";
    readonly health: "ok";
    readonly status: "ok";
  };
}
