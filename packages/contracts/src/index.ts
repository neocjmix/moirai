import type { CONTRACT_VERSION } from "./versions.js";
export * from "./versions.js";
export * from "./clotho.js";

export const SYNTHETIC_FIXTURE = Object.freeze({
  changeSetId: "01995c2a-7b00-7000-8000-000000000004",
  expansionChangeSetId: "01995c2a-7b00-7000-8000-000000000005",
  worldId: "01995c2a-7b00-7000-8000-000000000001",
  canonId: "01995c2a-7b00-7000-8000-000000000002",
  eventId: "01995c2a-7b00-7000-8000-000000000003",
  timeSystemId: "01995c2a-7b00-7000-8000-000000000006",
  canonTimeSystemId: "01995c2a-7b00-7000-8000-000000000007",
  secondEventId: "01995c2a-7b00-7000-8000-000000000008",
  thirdEventId: "01995c2a-7b00-7000-8000-000000000009",
  firstPlacementId: "01995c2a-7b00-7000-8000-00000000000a",
  secondPlacementId: "01995c2a-7b00-7000-8000-00000000000b",
  thirdPlacementId: "01995c2a-7b00-7000-8000-00000000000c",
  causalRelationId: "01995c2a-7b00-7000-8000-00000000000d",
  structuralRelationId: "01995c2a-7b00-7000-8000-00000000000e",
  canonNarrativeId: "01995c2a-7b00-7000-8000-00000000000f",
  eventNarrativeId: "01995c2a-7b00-7000-8000-000000000010",
  worldTitle: "The Lantern Archive",
  canonTitle: "Ember Canon",
  eventTitle: "The first lantern is lit",
  secondEventTitle: "The eastern lantern answers",
  thirdEventTitle: "The archive opens its doors"
});

export type EntityType =
  | "world"
  | "canon"
  | "time_system"
  | "canon_time_system"
  | "event"
  | "event_temporal_placement"
  | "relation"
  | "narrative";
export type ProjectionStatus = "ready" | "building" | "failed";
export type SmokeResult = "passed" | "failed" | "running" | "unknown";
export type EntityReference = string | { readonly client_ref: string };

interface CreateOperationBase {
  readonly kind: "create";
  readonly entity_id?: string;
  readonly client_ref?: string;
  readonly origin_refs?: readonly {
    readonly field: string;
    readonly origin_index: number;
  }[];
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
    readonly world_id: EntityReference;
    readonly slug: string;
    readonly title: string;
    readonly description?: string | null;
  };
}

export interface CreateTimeSystemOperation extends CreateOperationBase {
  readonly entity_type: "time_system";
  readonly value: {
    readonly world_id: EntityReference;
    readonly slug: string;
    readonly title: string;
    readonly kind: "calendar" | "ordinal" | "relative" | "custom";
    readonly definition_version: string;
    readonly definition: Readonly<Record<string, unknown>>;
  };
}

export interface CreateCanonTimeSystemOperation extends CreateOperationBase {
  readonly entity_type: "canon_time_system";
  readonly value: {
    readonly canon_id: EntityReference;
    readonly time_system_id: EntityReference;
  };
}

export interface CreateEventOperation extends CreateOperationBase {
  readonly entity_type: "event";
  readonly value: {
    readonly canon_id: EntityReference;
    readonly slug?: string | null;
    readonly kind: "atomic" | "composite";
    readonly title: string;
    readonly summary?: string | null;
    readonly roles: readonly string[];
    readonly attributes: Readonly<Record<string, unknown>>;
  };
}

export interface TemporalCoordinate {
  readonly value: number;
}

export interface CreateTemporalPlacementOperation extends CreateOperationBase {
  readonly entity_type: "event_temporal_placement";
  readonly value: {
    readonly event_id: EntityReference;
    readonly time_system_id: EntityReference;
    readonly kind: "point" | "interval";
    readonly earliest_start: TemporalCoordinate;
    readonly latest_start: TemporalCoordinate;
    readonly earliest_end?: TemporalCoordinate | null;
    readonly latest_end?: TemporalCoordinate | null;
    readonly precision: string;
    readonly certainty: "exact" | "approximate" | "uncertain";
    readonly display_label?: string | null;
  };
}

export type RelationType =
  | "contains"
  | "precedes"
  | "causes"
  | "enables"
  | "prevents"
  | "influences"
  | "starts"
  | "ends"
  | "identity_continues"
  | "identity_instance_of"
  | "identity_splits"
  | "identity_merges"
  | "derives_from"
  | "transfers";

export interface CreateRelationOperation extends CreateOperationBase {
  readonly entity_type: "relation";
  readonly value: {
    readonly canon_id: EntityReference;
    readonly type: RelationType;
    readonly source_event_id: EntityReference;
    readonly target_event_id: EntityReference;
    readonly direction: "directed" | "undirected";
    readonly attributes: Readonly<Record<string, unknown>>;
  };
}

export interface PublicReference {
  readonly label: string;
  readonly url: string;
}

export interface CreateNarrativeOperation extends CreateOperationBase {
  readonly entity_type: "narrative";
  readonly value: {
    readonly canon_id: EntityReference;
    readonly scope_type: "canon" | "event";
    readonly scope_id: EntityReference;
    readonly locale: string;
    readonly kind: "primary" | "summary" | "annotation";
    readonly title?: string | null;
    readonly body: string;
    readonly public_references: readonly PublicReference[];
  };
}

export type CreateOperation =
  | CreateWorldOperation
  | CreateCanonOperation
  | CreateTimeSystemOperation
  | CreateCanonTimeSystemOperation
  | CreateEventOperation
  | CreateTemporalPlacementOperation
  | CreateRelationOperation
  | CreateNarrativeOperation;

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

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly affected_ids: readonly string[];
  readonly message: string;
  readonly retryable: boolean;
}

export interface CommitResult {
  readonly change_set_id: string;
  readonly world_id: string;
  readonly current_revision: number;
  readonly publication_target_revision: number;
  readonly served_revision: number;
  readonly idempotent_replay: boolean;
  readonly id_mapping: Readonly<Record<string, string>>;
  readonly warnings: readonly ValidationIssue[];
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

export interface PublicTimeSystem {
  readonly id: string;
  readonly world_id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: "calendar" | "ordinal" | "relative" | "custom";
  readonly definition_version: string;
  readonly definition: Readonly<Record<string, unknown>>;
}

export interface PublicCanonTimeSystem {
  readonly id: string;
  readonly canon_id: string;
  readonly time_system_id: string;
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

export interface PublicTemporalPlacement {
  readonly id: string;
  readonly event_id: string;
  readonly time_system_id: string;
  readonly kind: "point" | "interval";
  readonly earliest_start: TemporalCoordinate;
  readonly latest_start: TemporalCoordinate;
  readonly earliest_end: TemporalCoordinate | null;
  readonly latest_end: TemporalCoordinate | null;
  readonly precision: string;
  readonly certainty: "exact" | "approximate" | "uncertain";
  readonly display_label: string | null;
}

export interface PublicRelation {
  readonly id: string;
  readonly canon_id: string;
  readonly type: RelationType;
  readonly source_event_id: string;
  readonly target_event_id: string;
  readonly direction: "directed" | "undirected";
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface PublicNarrative {
  readonly id: string;
  readonly canon_id: string;
  readonly scope_type: "canon" | "event";
  readonly scope_id: string;
  readonly locale: string;
  readonly kind: "primary" | "summary" | "annotation";
  readonly title: string | null;
  readonly body: string;
  readonly public_references: readonly PublicReference[];
}

export interface PublicSearchEntry {
  readonly target_id: string;
  readonly target_type: "world" | "canon" | "event";
  readonly canonical_url: string;
  readonly world_id: string;
  readonly canon_id: string | null;
  readonly title: string;
  readonly text: string;
  readonly served_revision: number;
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
  readonly algorithms: { readonly canonical: string; readonly search: string };
  readonly locales: readonly string[];
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
