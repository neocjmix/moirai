import type { CONTRACT_VERSION } from "./versions.js";
export * from "./versions.js";
export * from "./clotho.js";
export * from "./graph.js";

export type EntityType =
  | "world"
  | "canon"
  | "time_system"
  | "canon_time_system"
  | "event"
  | "event_canon_membership"
  | "relation"
  | "relation_canon_membership"
  | "narrative";
export type ProjectionStatus = "ready" | "building" | "failed";
export type SmokeResult = "passed" | "failed" | "running" | "unknown";
export type EntityReference = string | { readonly client_ref: string };
export type ChangeSetContractVersion = typeof CONTRACT_VERSION;

/** A stored Event or a dynamic Time Event. Dynamic references never create Event rows. */
export type CanonicalEventReference =
  | {
      readonly kind: "event";
      readonly event_id: string;
    }
  | {
      readonly kind: "time_event";
      readonly time_system_ref: { readonly time_system_id: string };
      readonly definition_version: string;
      readonly coordinate: string;
    };

export type ChangePlanEventReference =
  | CanonicalEventReference
  | {
      readonly kind: "event";
      readonly client_ref: string;
    }
  | {
      readonly kind: "time_event";
      readonly time_system_ref: { readonly client_ref: string };
      readonly definition_version: string;
      readonly coordinate: string;
    };

export type ResolvedEventReference =
  | Extract<CanonicalEventReference, { readonly kind: "event" }>
  | (Extract<CanonicalEventReference, { readonly kind: "time_event" }> & {
      readonly id: string;
      readonly persisted: false;
    });

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
    readonly world_id: EntityReference;
    readonly slug?: string | null;
    readonly kind: "atomic" | "composite";
    readonly title: string;
    readonly summary?: string | null;
    readonly roles: readonly string[];
    readonly attributes: Readonly<Record<string, unknown>>;
  };
}

interface EventCanonMembershipOperationBase {
  readonly entity_type: "event_canon_membership";
  readonly value: {
    readonly event_id: EntityReference;
    readonly canon_id: EntityReference;
  };
  readonly origin_refs?: readonly {
    readonly field: string;
    readonly origin_index: number;
  }[];
}

export interface AddEventCanonMembershipOperation extends EventCanonMembershipOperationBase {
  readonly kind: "add";
}

export interface RemoveEventCanonMembershipOperation extends EventCanonMembershipOperationBase {
  readonly kind: "remove";
}

export interface WithdrawEventOperation {
  readonly kind: "withdraw";
  readonly entity_type: "event";
  readonly value: { readonly event_id: EntityReference };
  readonly origin_refs?: readonly {
    readonly field: string;
    readonly origin_index: number;
  }[];
}

export type RelationType =
  | "contains"
  | "precedes"
  | "not_after"
  | "coincides"
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
    readonly world_id: EntityReference;
    readonly type: RelationType;
    readonly source_ref: ChangePlanEventReference;
    readonly target_ref: ChangePlanEventReference;
    readonly direction: "directed" | "undirected";
    readonly attributes: Readonly<Record<string, unknown>>;
  };
}

interface RelationCanonMembershipOperationBase {
  readonly entity_type: "relation_canon_membership";
  readonly value: {
    readonly relation_id: EntityReference;
    readonly canon_id: EntityReference;
  };
  readonly origin_refs?: readonly {
    readonly field: string;
    readonly origin_index: number;
  }[];
}

export interface AddRelationCanonMembershipOperation extends RelationCanonMembershipOperationBase {
  readonly kind: "add";
}

export interface RemoveRelationCanonMembershipOperation extends RelationCanonMembershipOperationBase {
  readonly kind: "remove";
}

export interface WithdrawRelationOperation {
  readonly kind: "withdraw";
  readonly entity_type: "relation";
  readonly value: { readonly relation_id: EntityReference };
  readonly origin_refs?: readonly {
    readonly field: string;
    readonly origin_index: number;
  }[];
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
  | CreateRelationOperation
  | CreateNarrativeOperation;

export type ChangeOperation =
  | CreateOperation
  | AddEventCanonMembershipOperation
  | RemoveEventCanonMembershipOperation
  | WithdrawEventOperation
  | AddRelationCanonMembershipOperation
  | RemoveRelationCanonMembershipOperation
  | WithdrawRelationOperation;

export interface CreateChangeSet {
  readonly contract_version: ChangeSetContractVersion;
  readonly change_set_id: string;
  readonly world_id: string;
  readonly expected_revision: number;
  readonly actor: string;
  readonly intent: string;
  readonly operations: readonly ChangeOperation[];
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

export interface CanonicalEventCanonMembership {
  readonly event_id: string;
  readonly canon_id: string;
}

export interface CanonicalRelationCanonMembership {
  readonly relation_id: string;
  readonly canon_id: string;
}

export interface PublicEvent {
  readonly id: string;
  readonly world_id: string;
  readonly canon_memberships: readonly string[];
  readonly slug: string | null;
  readonly kind: "atomic" | "composite";
  readonly title: string;
  readonly summary: string | null;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface PublicRelation {
  readonly id: string;
  readonly world_id: string;
  readonly canon_memberships: readonly string[];
  readonly type: RelationType;
  readonly source_ref: CanonicalEventReference;
  readonly target_ref: CanonicalEventReference;
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
  readonly target_type: "world" | "canon" | "event" | "subject";
  readonly canonical_url: string;
  readonly world_id: string;
  readonly canon_ids: readonly string[];
  readonly title: string;
  readonly text: string;
  readonly served_revision: number;
}

export type ProjectionCompleteness = "complete" | "partial" | "unresolved";

export type SubjectHandleStatus = "active" | "redirected" | "unresolved";

export interface SubjectHandleRecord {
  readonly id: string;
  readonly canon_id: string;
  readonly anchor_event_id: string;
  readonly status: SubjectHandleStatus;
  readonly redirect_to: string | null;
  readonly created_revision: number;
  readonly projection_revision: number;
  readonly member_event_ids: readonly string[];
}

export interface PublicSubjectLineageEdge {
  readonly relation_id: string;
  readonly type: "identity_splits" | "identity_merges";
  readonly source_subject_handle_id: string;
  readonly target_subject_handle_id: string;
}

export interface PublicSubjectProjection {
  readonly world_id: string;
  readonly source_revision: number;
  readonly projection_type: "subject";
  readonly algorithm_version: string;
  readonly parameters_digest: string;
  readonly semantic_digest: string;
  readonly canon_id: string;
  readonly subject_handle_id: string;
  readonly anchor_event_id: string;
  readonly label: string;
  readonly label_evidence_event_id: string;
  readonly member_event_ids: readonly string[];
  readonly identity_relation_ids: readonly string[];
  readonly instance_relation_ids: readonly string[];
  readonly lineage: {
    readonly incoming: readonly PublicSubjectLineageEdge[];
    readonly outgoing: readonly PublicSubjectLineageEdge[];
  };
  readonly narrative_ids: readonly string[];
  readonly evidence: readonly string[];
  readonly diagnostics: readonly PublicProjectionDiagnostic[];
  readonly completeness: ProjectionCompleteness;
}

export interface PublicSubjectArtifactReference {
  readonly subject_handle_id: string;
  readonly key: string;
  readonly label: string;
  readonly member_count: number;
  readonly algorithm_version: string;
  readonly completeness: ProjectionCompleteness;
}

export interface PublicSubjectHandleDocument {
  readonly world_id: string;
  readonly served_revision: number;
  readonly generated_at: string;
  readonly handle: Omit<SubjectHandleRecord, "member_event_ids">;
  readonly canonical_url: string;
  readonly redirect_url: string | null;
  readonly subject: PublicSubjectProjection | null;
}

export interface PublicProjectionDiagnostic {
  readonly code: "identity_component_ambiguous" | "subject_anchor_unresolved";
  readonly affected_ids: readonly string[];
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
  readonly algorithms: {
    readonly canonical: string;
    readonly search: string;
    readonly subject?: string;
    readonly relational_time: string;
    readonly graph_scope?: string;
  };
  readonly locales: readonly string[];
  readonly documents: readonly {
    readonly key: string;
    readonly media_type: "application/json";
    readonly sha256: string;
  }[];
  readonly completeness: "complete";
}

export interface PublicGraphScopeNode {
  readonly cell_id: string;
  readonly event_id: string;
  readonly title: string;
  readonly kind: "atomic" | "composite";
  readonly roles: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly layout_basis: "inferred_chronology";
  readonly chronology: {
    readonly placement_kind: "inferred_layout";
    readonly component_id: string;
    readonly mode: "coordinate" | "relative" | "mixed" | "unplaced";
    readonly rank: number;
    readonly time_system_ref: { readonly time_system_id: string } | null;
    readonly evidence: readonly string[];
  };
  readonly canonical_url: string;
  readonly evidence: readonly string[];
}

export interface PublicGraphScopeLink {
  readonly cell_id: string;
  readonly relation_id: string;
  readonly type: RelationType;
  readonly direction: "directed" | "undirected";
  readonly source_event_id: string;
  readonly target_event_id: string;
  readonly source_cell_id: string;
  readonly target_cell_id: string;
  readonly evidence: readonly string[];
}

export interface PublicGraphScopeArtifact {
  readonly world_id: string;
  readonly canon_id: string;
  readonly source_revision: number;
  readonly served_revision: number;
  readonly projection_type: "graph_scope";
  readonly algorithm_version: string;
  readonly parameters_digest: string;
  readonly semantic_digest: string;
  readonly scope: { readonly kind: "canon"; readonly id: string };
  readonly lod: "overview";
  readonly nodes: readonly PublicGraphScopeNode[];
  readonly links: readonly PublicGraphScopeLink[];
  readonly source_counts: {
    readonly events: number;
    readonly event_relations: number;
  };
  readonly budget: {
    readonly max_cells: 1000;
    readonly max_labels: 250;
    readonly visible_cells: number;
    readonly visible_labels: number;
  };
  readonly truncated: boolean;
  readonly next_scope_hint: string | null;
}

export interface HealthResponse {
  readonly status: "ok" | "not_ready";
  readonly service:
    "atropos-web" | "clotho-api" | "lachesis-api" | "lachesis-worker";
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
      enum: ["atropos-web", "clotho-api", "lachesis-api", "lachesis-worker"]
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

export * from "./relational-time.js";
