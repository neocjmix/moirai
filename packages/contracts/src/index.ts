export const CONTRACT_VERSION = "0.2.0";
export const SCHEMA_VERSION = "0.1.0";
export const PUBLICATION_FORMAT_VERSION = "0.2.0";

export const SYNTHETIC_FIXTURE = Object.freeze({
  changeSetId: "01995c2a-7b00-7000-8000-000000000004",
  worldId: "01995c2a-7b00-7000-8000-000000000001",
  canonId: "01995c2a-7b00-7000-8000-000000000002",
  eventId: "01995c2a-7b00-7000-8000-000000000003",
  worldTitle: "The Lantern Archive",
  canonTitle: "Ember Canon",
  eventTitle: "The first lantern is lit"
});

export type EntityType = "world" | "canon" | "event";
export type ProjectionStatus = "ready" | "building" | "failed";
export type SmokeResult = "passed" | "failed" | "running" | "unknown";

interface CreateOperationBase {
  readonly kind: "create";
  readonly entity_id: string;
}

export interface CreateWorldOperation extends CreateOperationBase {
  readonly entity_type: "world";
  readonly value: {
    readonly slug: string;
    readonly title: string;
    readonly description?: string | null;
  };
}

export interface CreateCanonOperation extends CreateOperationBase {
  readonly entity_type: "canon";
  readonly value: {
    readonly world_id: string;
    readonly slug: string;
    readonly title: string;
    readonly description?: string | null;
  };
}

export interface CreateEventOperation extends CreateOperationBase {
  readonly entity_type: "event";
  readonly value: {
    readonly canon_id: string;
    readonly slug?: string | null;
    readonly kind: "atomic" | "composite";
    readonly title: string;
    readonly summary?: string | null;
    readonly roles: readonly string[];
    readonly attributes: Readonly<Record<string, unknown>>;
  };
}

export type CreateOperation =
  CreateWorldOperation | CreateCanonOperation | CreateEventOperation;

export interface CreateChangeSet {
  readonly contract_version: typeof CONTRACT_VERSION;
  readonly change_set_id: string;
  readonly world_id: string;
  readonly expected_revision: number;
  readonly actor: string;
  readonly intent: string;
  readonly operations: readonly CreateOperation[];
  readonly origins: readonly {
    readonly kind:
      | "source_explicit"
      | "human_instruction"
      | "llm_inference"
      | "system_derived";
    readonly summary: string;
  }[];
}

export interface CommitResult {
  readonly change_set_id: string;
  readonly world_id: string;
  readonly current_revision: number;
  readonly publication_target_revision: number;
  readonly served_revision: number;
  readonly idempotent_replay: boolean;
}

export interface PublicWorld {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PublicCanon {
  readonly id: string;
  readonly world_id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PublicEvent {
  readonly id: string;
  readonly canon_id: string;
  readonly slug: string | null;
  readonly kind: "atomic" | "composite";
  readonly title: string;
  readonly summary: string | null;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface PublicationPointer {
  readonly world_id: string;
  readonly served_revision: number;
  readonly current_revision: number;
  readonly publication_target_revision: number;
  readonly projection_status: "ready";
  readonly manifest_key: string;
  readonly format_version: string;
  readonly generated_at: string;
}

export interface PublicationManifest {
  readonly world_id: string;
  readonly served_revision: number;
  readonly format_version: string;
  readonly generated_at: string;
  readonly algorithms: { readonly canonical: string };
  readonly documents: readonly {
    readonly key: string;
    readonly media_type: "application/json";
    readonly sha256: string;
  }[];
  readonly completeness: "complete";
}

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
    service: { enum: ["atropos-web", "lachesis-api", "lachesis-worker"] },
    version: { type: "string", minLength: 1 },
    commit_sha: { type: "string", minLength: 1 }
  }
} as const;

export interface SyntheticWorldStatus {
  readonly world_id: string;
  readonly canon_id: string;
  readonly event_id: string;
  readonly label: string;
  readonly current_revision: number;
  readonly publication_target_revision: number;
  readonly served_revision: number;
  readonly projection_status: ProjectionStatus;
}

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
  readonly synthetic_world: SyntheticWorldStatus;
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
