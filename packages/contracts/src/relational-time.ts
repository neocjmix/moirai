import type {
  CanonicalEventReference,
  PublicRelation,
  PublicTimeSystem,
  ResolvedEventReference
} from "./index.js";

export interface PublicTemporalAmount {
  readonly value: string;
  readonly unit: string;
}
export interface PublicTemporalBound {
  readonly time_event: Extract<ResolvedEventReference, { kind: "time_event" }>;
  readonly inclusive: boolean;
  readonly constraint_ids: readonly string[];
}
export interface PublicTemporalPosition {
  readonly event_id: string;
  readonly kind: "exact" | "bounded" | "relative-only" | "unresolved";
  readonly time_event?: Extract<ResolvedEventReference, { kind: "time_event" }>;
  readonly lower?: PublicTemporalBound | null;
  readonly upper?: PublicTemporalBound | null;
  readonly reason?: string;
  readonly source_constraint_ids: readonly string[];
  readonly algorithm_version: string;
  readonly display_label: string;
  readonly knowledge_span: PublicTemporalAmount | null;
}
export interface PublicTemporalExtent {
  readonly kind: "exact" | "unresolved";
  readonly basis: "explicit_boundaries" | "descendant_span";
  readonly start: Extract<
    ResolvedEventReference,
    { kind: "time_event" }
  > | null;
  readonly end: Extract<ResolvedEventReference, { kind: "time_event" }> | null;
  readonly amount: PublicTemporalAmount | null;
  readonly evidence: readonly string[];
  readonly reason: string | null;
}
export interface PublicTemporalComposite {
  readonly event_id: string;
  readonly start_ref: CanonicalEventReference | null;
  readonly end_ref: CanonicalEventReference | null;
  readonly duration: PublicTemporalExtent;
  readonly descendant_span: PublicTemporalExtent;
  readonly direct_children: readonly CanonicalEventReference[];
  readonly descendant_event_ids: readonly string[];
  readonly during: readonly {
    readonly event_id: string;
    readonly membership: false;
    readonly evidence: readonly string[];
  }[];
  readonly membership_state: {
    readonly subject_handle_id: string | null;
    readonly status: "resolved" | "unresolved";
    readonly reason: string | null;
  } | null;
}
export interface PublicRelationalTemporalProjection {
  readonly projection_type: "event_relational_time";
  readonly solver_algorithm_version: string;
  readonly world_id: string;
  readonly canon_id: string;
  readonly source_revision: number;
  readonly algorithm_version: string;
  readonly time_systems: readonly PublicTimeSystem[];
  readonly positions: readonly PublicTemporalPosition[];
  readonly composites: readonly PublicTemporalComposite[];
  readonly virtual_time_events: readonly Extract<
    ResolvedEventReference,
    { kind: "time_event" }
  >[];
  readonly relations: readonly PublicRelation[];
  readonly evidence: readonly string[];
  readonly semantic_digest: string;
}
