import type {
  CanonicalEventReference,
  ProjectionCompleteness,
  RelationType
} from "./index.js";

/** First public contract for Moirai-native graph exploration. */
export const MOIRAI_GRAPH_CONTRACT_VERSION = 1 as const;
/** Result v3 separates World-owned Event/Relation identity from matched Canon context. */
export const MOIRAI_GRAPH_RESULT_CONTRACT_VERSION = 3 as const;
export const MOIRAI_GRAPH_URL_STATE_VERSION = 1 as const;
export const MOIRAI_GRAPH_RELATION_TYPES = [
  "contains",
  "precedes",
  "not_after",
  "coincides",
  "causes",
  "enables",
  "prevents",
  "influences",
  "starts",
  "ends",
  "identity_continues",
  "identity_instance_of",
  "identity_splits",
  "identity_merges",
  "derives_from",
  "transfers"
] as const satisfies readonly RelationType[];

export type MoiraiGraphContractVersion = typeof MOIRAI_GRAPH_CONTRACT_VERSION;
export type MoiraiGraphResultContractVersion =
  typeof MOIRAI_GRAPH_RESULT_CONTRACT_VERSION;
export type MoiraiGraphUrlStateVersion = typeof MOIRAI_GRAPH_URL_STATE_VERSION;

export interface MoiraiGraphTimeSystemIdentity {
  readonly time_system_id: string;
  readonly definition_version: string;
  /** Stable implementation identity; never inferred from title, slug or kind. */
  readonly adapter_identity: string;
  /** Domain in which the adapter can compare lossless coordinates. */
  readonly comparison_domain: string;
}

export interface MoiraiGraphTemporalFrame {
  readonly target: MoiraiGraphTimeSystemIdentity;
}

export interface MoiraiGraphSource {
  readonly world_id: string;
  readonly served_revision: number;
  readonly canon_ids: readonly string[];
  readonly time_systems: readonly MoiraiGraphTimeSystemIdentity[];
}

export interface MoiraiGraphSourceAddress {
  readonly world_id: string;
  readonly canon_id: string;
  readonly served_revision: number;
}

export interface MoiraiGraphEventReference extends MoiraiGraphSourceAddress {
  readonly event_ref: CanonicalEventReference;
}

export type MoiraiGraphEntityReference =
  | (MoiraiGraphSourceAddress & {
      readonly kind: "event";
      readonly event_ref: CanonicalEventReference;
    })
  | (MoiraiGraphSourceAddress & {
      readonly kind: "subject";
      readonly subject_handle_id: string;
    })
  | (MoiraiGraphSourceAddress & {
      readonly kind: "state";
      readonly composite_event_id: string;
      readonly subject_handle_id: string;
      readonly state_family: string;
    })
  | (MoiraiGraphSourceAddress & {
      readonly kind: "narrative";
      readonly narrative_id: string;
    });

export type MoiraiGraphScope =
  | { readonly kind: "overview" }
  | {
      readonly kind: "selection";
      readonly references: readonly MoiraiGraphEntityReference[];
    }
  | {
      readonly kind: "neighborhood";
      readonly event: MoiraiGraphEventReference;
      readonly depth: number;
    }
  | (MoiraiGraphSourceAddress & {
      readonly kind: "subject";
      readonly subject_handle_id: string;
    })
  | {
      readonly kind: "composite";
      readonly event: MoiraiGraphEventReference;
    }
  | (MoiraiGraphSourceAddress & {
      readonly kind: "state";
      readonly composite_event_id: string;
      readonly subject_handle_id: string;
      readonly state_family: string;
    });

export interface MoiraiGraphEntityFilter {
  readonly event_kinds: readonly ("atomic" | "composite")[];
  readonly roles: readonly string[];
  readonly subject_handle_ids: readonly string[];
  readonly include_states: boolean;
  readonly include_narratives: boolean;
  readonly include_virtual_time_events: boolean;
}

export interface MoiraiGraphRelationFilter {
  readonly types: readonly RelationType[];
  readonly directions: readonly ("directed" | "undirected")[];
}

export interface MoiraiGraphDiagnosticsFilter {
  readonly include_codes: readonly string[];
  readonly include_unplaced: boolean;
  readonly include_unresolved: boolean;
}

export interface MoiraiGraphBudget {
  readonly detail_level: "overview" | "standard" | "full";
  readonly max_entities: number;
  readonly max_relations: number;
  readonly max_evidence: number;
}

export interface MoiraiGraphQuery {
  readonly contract_version: MoiraiGraphContractVersion;
  readonly temporal_frame: MoiraiGraphTemporalFrame;
  readonly sources: readonly MoiraiGraphSource[];
  readonly scope: MoiraiGraphScope;
  readonly entity_filter: MoiraiGraphEntityFilter;
  readonly relation_filter: MoiraiGraphRelationFilter;
  readonly diagnostics_filter: MoiraiGraphDiagnosticsFilter;
  readonly budget: MoiraiGraphBudget;
}

export interface MoiraiGraphUrlState {
  readonly version: MoiraiGraphUrlStateVersion;
  readonly query: MoiraiGraphQuery;
  readonly focus: MoiraiGraphEntityReference | null;
}

export type MoiraiGraphCompatibilityStatus =
  | "native"
  | "convertible"
  | "incompatible"
  | "adapter_unavailable"
  | "definition_version_mismatch";

export interface MoiraiGraphCompatibility {
  readonly source: MoiraiGraphTimeSystemIdentity;
  readonly target: MoiraiGraphTimeSystemIdentity;
  readonly status: MoiraiGraphCompatibilityStatus;
  readonly reason_code: string;
  readonly adapter_id: string | null;
  readonly lossless: boolean;
}

export interface MoiraiGraphRevision {
  readonly world_id: string;
  readonly served_revision: number;
}

export interface MoiraiGraphTimeSystem {
  readonly world_id: string;
  readonly served_revision: number;
  readonly identity: MoiraiGraphTimeSystemIdentity;
  readonly definition: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly (
    | "canonicalize"
    | "equality"
    | "compare"
    | "boundary"
    | "difference"
    | "conversion"
  )[];
}

export type MoiraiGraphTemporalPosition =
  | {
      readonly kind: "exact";
      readonly at: CanonicalEventReference;
      readonly evidence_ids: readonly string[];
    }
  | {
      readonly kind: "bounded";
      readonly lower: CanonicalEventReference | null;
      readonly lower_inclusive: boolean;
      readonly upper: CanonicalEventReference | null;
      readonly upper_inclusive: boolean;
      readonly evidence_ids: readonly string[];
    }
  | {
      readonly kind: "relative_only";
      readonly component_id: string;
      readonly rank: number;
      readonly evidence_ids: readonly string[];
    }
  | {
      readonly kind: "mixed";
      readonly component_id: string;
      readonly rank: number;
      readonly bounds: readonly CanonicalEventReference[];
      readonly evidence_ids: readonly string[];
    }
  | {
      readonly kind: "unplaced";
      readonly reason_code: string;
      readonly evidence_ids: readonly string[];
    };

export interface MoiraiGraphEvent {
  readonly world_id: string;
  readonly served_revision: number;
  readonly canon_memberships: readonly string[];
  readonly matched_canon_ids: readonly string[];
  readonly id: string;
  readonly slug: string | null;
  readonly event_kind: "atomic" | "composite";
  readonly title: string;
  readonly summary: string | null;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly temporal_position: MoiraiGraphTemporalPosition;
  readonly narrative_ids: readonly string[];
  readonly evidence_ids: readonly string[];
}

export interface MoiraiGraphTimeEvent extends MoiraiGraphSourceAddress {
  readonly id: string;
  readonly persisted: false;
  readonly reference: Extract<CanonicalEventReference, { kind: "time_event" }>;
  readonly evidence_ids: readonly string[];
}

export interface MoiraiGraphRelation {
  readonly world_id: string;
  readonly served_revision: number;
  readonly canon_memberships: readonly string[];
  readonly matched_canon_ids: readonly string[];
  readonly id: string;
  readonly type: RelationType;
  readonly direction: "directed" | "undirected";
  readonly source_ref: CanonicalEventReference;
  readonly target_ref: CanonicalEventReference;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly evidence_ids: readonly string[];
}

export interface MoiraiGraphSubject extends MoiraiGraphSourceAddress {
  readonly subject_handle_id: string;
  readonly label: string;
  readonly anchor_event_id: string;
  readonly member_event_ids: readonly string[];
  readonly identity_relation_ids: readonly string[];
  readonly lineage_relation_ids: readonly string[];
  readonly narrative_ids: readonly string[];
  readonly evidence_ids: readonly string[];
  readonly diagnostics: readonly string[];
  readonly completeness: ProjectionCompleteness;
}

export interface MoiraiGraphComposite extends MoiraiGraphSourceAddress {
  readonly event_id: string;
  readonly direct_child_event_ids: readonly string[];
  readonly descendant_event_ids: readonly string[];
  readonly boundary: {
    readonly start_event_id: string | null;
    readonly end_event_id: string | null;
  };
  readonly duration: Readonly<Record<string, unknown>> | null;
  readonly descendant_span: Readonly<Record<string, unknown>> | null;
  readonly evidence_ids: readonly string[];
  readonly diagnostics: readonly string[];
  readonly completeness: ProjectionCompleteness;
}

export interface MoiraiGraphState extends MoiraiGraphSourceAddress {
  readonly composite_event_id: string;
  readonly subject_handle_id: string;
  readonly state_family: string;
  readonly status: "resolved" | "ambiguous" | "unresolved";
  readonly value: Readonly<Record<string, unknown>> | null;
  readonly candidate_values: readonly Readonly<Record<string, unknown>>[];
  readonly open_ended: boolean | null;
  readonly start: {
    readonly earliest: CanonicalEventReference | null;
    readonly latest: CanonicalEventReference | null;
  };
  readonly end: {
    readonly earliest: CanonicalEventReference | null;
    readonly latest: CanonicalEventReference | null;
  };
  readonly algorithm_version: string;
  readonly evidence_ids: readonly string[];
  readonly diagnostics: readonly string[];
  readonly completeness: ProjectionCompleteness;
}

export interface MoiraiGraphNarrative extends MoiraiGraphSourceAddress {
  readonly id: string;
  readonly scope_type: "canon" | "event";
  readonly scope_id: string;
  readonly locale: string;
  readonly narrative_kind: "primary" | "summary" | "annotation";
  readonly title: string | null;
  readonly body: string;
  readonly public_references: readonly {
    readonly label: string;
    readonly url: string;
  }[];
}

export interface MoiraiGraphEvidence extends MoiraiGraphSourceAddress {
  readonly id: string;
  readonly kind:
    "event" | "relation" | "narrative" | "time_system" | "projection";
  readonly source_ids: readonly string[];
  readonly algorithm_version: string | null;
  readonly artifact_key: string | null;
  readonly artifact_sha256: string | null;
}

export interface MoiraiGraphDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly source: Partial<MoiraiGraphSourceAddress>;
  readonly affected_ids: readonly string[];
  readonly message: string;
}

export interface MoiraiGraphBudgetResult extends MoiraiGraphBudget {
  readonly returned_entities: number;
  readonly returned_relations: number;
  readonly returned_evidence: number;
  readonly truncated: boolean;
  readonly next_scope_hint: string | null;
}

export interface MoiraiGraphQueryResult {
  readonly contract_version: MoiraiGraphResultContractVersion;
  readonly query: MoiraiGraphQuery;
  /** Never replace this World-scoped vector with one synthetic revision. */
  readonly revision_vector: readonly MoiraiGraphRevision[];
  readonly compatibility: readonly MoiraiGraphCompatibility[];
  readonly time_systems: readonly MoiraiGraphTimeSystem[];
  readonly events: readonly MoiraiGraphEvent[];
  readonly virtual_time_events: readonly MoiraiGraphTimeEvent[];
  readonly relations: readonly MoiraiGraphRelation[];
  readonly subjects: readonly MoiraiGraphSubject[];
  readonly composites: readonly MoiraiGraphComposite[];
  readonly states: readonly MoiraiGraphState[];
  readonly narratives: readonly MoiraiGraphNarrative[];
  readonly evidence: readonly MoiraiGraphEvidence[];
  readonly diagnostics: readonly MoiraiGraphDiagnostic[];
  readonly algorithm_versions: Readonly<Record<string, string>>;
  readonly source_artifact_digests: Readonly<Record<string, string>>;
  readonly completeness: ProjectionCompleteness;
  readonly budget: MoiraiGraphBudgetResult;
}

const stringSchema = { type: "string", minLength: 1 } as const;
const nonNegativeIntegerSchema = {
  type: "integer",
  minimum: 0
} as const;
const sourceAddressProperties = {
  world_id: stringSchema,
  canon_id: stringSchema,
  served_revision: nonNegativeIntegerSchema
} as const;
const timeSystemIdentitySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "time_system_id",
    "definition_version",
    "adapter_identity",
    "comparison_domain"
  ],
  properties: {
    time_system_id: stringSchema,
    definition_version: stringSchema,
    adapter_identity: stringSchema,
    comparison_domain: stringSchema
  }
} as const;
const canonicalEventReferenceSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "event_id"],
      properties: { kind: { const: "event" }, event_id: stringSchema }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "time_system_ref", "definition_version", "coordinate"],
      properties: {
        kind: { const: "time_event" },
        time_system_ref: {
          type: "object",
          additionalProperties: false,
          required: ["time_system_id"],
          properties: { time_system_id: stringSchema }
        },
        definition_version: stringSchema,
        coordinate: stringSchema
      }
    }
  ]
} as const;
const stringArraySchema = {
  type: "array",
  items: stringSchema,
  uniqueItems: true
} as const;
const sourceAddressRequired = [
  "world_id",
  "canon_id",
  "served_revision"
] as const;
const graphEventAddressSchema = {
  type: "object",
  additionalProperties: false,
  required: [...sourceAddressRequired, "event_ref"],
  properties: {
    ...sourceAddressProperties,
    event_ref: canonicalEventReferenceSchema
  }
} as const;
const entityReferenceSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [...sourceAddressRequired, "kind", "event_ref"],
      properties: {
        ...sourceAddressProperties,
        kind: { const: "event" },
        event_ref: canonicalEventReferenceSchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: [...sourceAddressRequired, "kind", "subject_handle_id"],
      properties: {
        ...sourceAddressProperties,
        kind: { const: "subject" },
        subject_handle_id: stringSchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        ...sourceAddressRequired,
        "kind",
        "composite_event_id",
        "subject_handle_id",
        "state_family"
      ],
      properties: {
        ...sourceAddressProperties,
        kind: { const: "state" },
        composite_event_id: stringSchema,
        subject_handle_id: stringSchema,
        state_family: stringSchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: [...sourceAddressRequired, "kind", "narrative_id"],
      properties: {
        ...sourceAddressProperties,
        kind: { const: "narrative" },
        narrative_id: stringSchema
      }
    }
  ]
} as const;
const temporalPositionSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "at", "evidence_ids"],
      properties: {
        kind: { const: "exact" },
        at: canonicalEventReferenceSchema,
        evidence_ids: stringArraySchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "lower",
        "lower_inclusive",
        "upper",
        "upper_inclusive",
        "evidence_ids"
      ],
      properties: {
        kind: { const: "bounded" },
        lower: { anyOf: [canonicalEventReferenceSchema, { type: "null" }] },
        lower_inclusive: { type: "boolean" },
        upper: { anyOf: [canonicalEventReferenceSchema, { type: "null" }] },
        upper_inclusive: { type: "boolean" },
        evidence_ids: stringArraySchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "component_id", "rank", "evidence_ids"],
      properties: {
        kind: { const: "relative_only" },
        component_id: stringSchema,
        rank: nonNegativeIntegerSchema,
        evidence_ids: stringArraySchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "component_id", "rank", "bounds", "evidence_ids"],
      properties: {
        kind: { const: "mixed" },
        component_id: stringSchema,
        rank: nonNegativeIntegerSchema,
        bounds: { type: "array", items: canonicalEventReferenceSchema },
        evidence_ids: stringArraySchema
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "reason_code", "evidence_ids"],
      properties: {
        kind: { const: "unplaced" },
        reason_code: stringSchema,
        evidence_ids: stringArraySchema
      }
    }
  ]
} as const;

/** JSON Schema for shareable source/scope/filter state. */
export const MOIRAI_GRAPH_QUERY_SCHEMA = {
  $id: "moirai.graph-query.v1",
  type: "object",
  additionalProperties: false,
  required: [
    "contract_version",
    "temporal_frame",
    "sources",
    "scope",
    "entity_filter",
    "relation_filter",
    "diagnostics_filter",
    "budget"
  ],
  properties: {
    contract_version: { const: MOIRAI_GRAPH_CONTRACT_VERSION },
    temporal_frame: {
      type: "object",
      additionalProperties: false,
      required: ["target"],
      properties: { target: timeSystemIdentitySchema }
    },
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["world_id", "served_revision", "canon_ids", "time_systems"],
        properties: {
          world_id: stringSchema,
          served_revision: nonNegativeIntegerSchema,
          canon_ids: { type: "array", minItems: 1, items: stringSchema },
          time_systems: {
            type: "array",
            minItems: 1,
            items: timeSystemIdentitySchema
          }
        }
      }
    },
    scope: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "overview" } }
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "references"],
          properties: {
            kind: { const: "selection" },
            references: { type: "array", items: entityReferenceSchema }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "event", "depth"],
          properties: {
            kind: { const: "neighborhood" },
            event: graphEventAddressSchema,
            depth: nonNegativeIntegerSchema
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [...sourceAddressRequired, "kind", "subject_handle_id"],
          properties: {
            ...sourceAddressProperties,
            kind: { const: "subject" },
            subject_handle_id: stringSchema
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "event"],
          properties: {
            kind: { const: "composite" },
            event: graphEventAddressSchema
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            ...sourceAddressRequired,
            "kind",
            "composite_event_id",
            "subject_handle_id",
            "state_family"
          ],
          properties: {
            ...sourceAddressProperties,
            kind: { const: "state" },
            composite_event_id: stringSchema,
            subject_handle_id: stringSchema,
            state_family: stringSchema
          }
        }
      ]
    },
    entity_filter: {
      type: "object",
      additionalProperties: false,
      required: [
        "event_kinds",
        "roles",
        "subject_handle_ids",
        "include_states",
        "include_narratives",
        "include_virtual_time_events"
      ],
      properties: {
        event_kinds: {
          type: "array",
          items: { enum: ["atomic", "composite"] },
          uniqueItems: true
        },
        roles: { type: "array", items: stringSchema, uniqueItems: true },
        subject_handle_ids: {
          type: "array",
          items: stringSchema,
          uniqueItems: true
        },
        include_states: { type: "boolean" },
        include_narratives: { type: "boolean" },
        include_virtual_time_events: { type: "boolean" }
      }
    },
    relation_filter: {
      type: "object",
      additionalProperties: false,
      required: ["types", "directions"],
      properties: {
        types: {
          type: "array",
          items: { enum: MOIRAI_GRAPH_RELATION_TYPES },
          uniqueItems: true
        },
        directions: {
          type: "array",
          items: { enum: ["directed", "undirected"] },
          uniqueItems: true
        }
      }
    },
    diagnostics_filter: {
      type: "object",
      additionalProperties: false,
      required: ["include_codes", "include_unplaced", "include_unresolved"],
      properties: {
        include_codes: {
          type: "array",
          items: stringSchema,
          uniqueItems: true
        },
        include_unplaced: { type: "boolean" },
        include_unresolved: { type: "boolean" }
      }
    },
    budget: {
      type: "object",
      additionalProperties: false,
      required: [
        "detail_level",
        "max_entities",
        "max_relations",
        "max_evidence"
      ],
      properties: {
        detail_level: { enum: ["overview", "standard", "full"] },
        max_entities: nonNegativeIntegerSchema,
        max_relations: nonNegativeIntegerSchema,
        max_evidence: nonNegativeIntegerSchema
      }
    }
  }
} as const;

/** JSON Schema for the semantic result; renderer cells and coordinates are absent. */
export const MOIRAI_GRAPH_QUERY_RESULT_SCHEMA = {
  $id: "moirai.graph-query-result.v3",
  type: "object",
  additionalProperties: false,
  required: [
    "contract_version",
    "query",
    "revision_vector",
    "compatibility",
    "time_systems",
    "events",
    "virtual_time_events",
    "relations",
    "subjects",
    "composites",
    "states",
    "narratives",
    "evidence",
    "diagnostics",
    "algorithm_versions",
    "source_artifact_digests",
    "completeness",
    "budget"
  ],
  properties: {
    contract_version: { const: MOIRAI_GRAPH_RESULT_CONTRACT_VERSION },
    query: MOIRAI_GRAPH_QUERY_SCHEMA,
    revision_vector: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["world_id", "served_revision"],
        properties: {
          world_id: stringSchema,
          served_revision: nonNegativeIntegerSchema
        }
      }
    },
    compatibility: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source",
          "target",
          "status",
          "reason_code",
          "adapter_id",
          "lossless"
        ],
        properties: {
          source: timeSystemIdentitySchema,
          target: timeSystemIdentitySchema,
          status: {
            enum: [
              "native",
              "convertible",
              "incompatible",
              "adapter_unavailable",
              "definition_version_mismatch"
            ]
          },
          reason_code: stringSchema,
          adapter_id: { type: ["string", "null"] },
          lossless: { type: "boolean" }
        }
      }
    },
    time_systems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "world_id",
          "served_revision",
          "identity",
          "definition",
          "capabilities"
        ],
        properties: {
          world_id: stringSchema,
          served_revision: nonNegativeIntegerSchema,
          identity: timeSystemIdentitySchema,
          definition: { type: "object" },
          capabilities: {
            type: "array",
            uniqueItems: true,
            items: {
              enum: [
                "canonicalize",
                "equality",
                "compare",
                "boundary",
                "difference",
                "conversion"
              ]
            }
          }
        }
      }
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "world_id",
          "served_revision",
          "canon_memberships",
          "matched_canon_ids",
          "id",
          "slug",
          "event_kind",
          "title",
          "summary",
          "roles",
          "attributes",
          "temporal_position",
          "narrative_ids",
          "evidence_ids"
        ],
        properties: {
          world_id: stringSchema,
          served_revision: nonNegativeIntegerSchema,
          canon_memberships: stringArraySchema,
          matched_canon_ids: stringArraySchema,
          id: stringSchema,
          slug: { type: ["string", "null"] },
          event_kind: { enum: ["atomic", "composite"] },
          title: stringSchema,
          summary: { type: ["string", "null"] },
          roles: stringArraySchema,
          attributes: { type: "object" },
          temporal_position: temporalPositionSchema,
          narrative_ids: stringArraySchema,
          evidence_ids: stringArraySchema
        }
      }
    },
    virtual_time_events: {
      type: "array",
      items: {
        type: "object",
        required: [
          ...Object.keys(sourceAddressProperties),
          "id",
          "persisted",
          "reference",
          "evidence_ids"
        ],
        additionalProperties: false,
        properties: {
          ...sourceAddressProperties,
          id: stringSchema,
          persisted: { const: false },
          reference: canonicalEventReferenceSchema,
          evidence_ids: { type: "array", items: stringSchema }
        }
      }
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        required: [
          "world_id",
          "served_revision",
          "canon_memberships",
          "matched_canon_ids",
          "id",
          "type",
          "direction",
          "source_ref",
          "target_ref",
          "attributes",
          "evidence_ids"
        ],
        additionalProperties: false,
        properties: {
          world_id: stringSchema,
          served_revision: nonNegativeIntegerSchema,
          canon_memberships: stringArraySchema,
          matched_canon_ids: stringArraySchema,
          id: stringSchema,
          type: { enum: MOIRAI_GRAPH_RELATION_TYPES },
          direction: { enum: ["directed", "undirected"] },
          source_ref: canonicalEventReferenceSchema,
          target_ref: canonicalEventReferenceSchema,
          attributes: { type: "object" },
          evidence_ids: { type: "array", items: stringSchema }
        }
      }
    },
    subjects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          ...sourceAddressRequired,
          "subject_handle_id",
          "label",
          "anchor_event_id",
          "member_event_ids",
          "identity_relation_ids",
          "lineage_relation_ids",
          "narrative_ids",
          "evidence_ids",
          "diagnostics",
          "completeness"
        ],
        properties: {
          ...sourceAddressProperties,
          subject_handle_id: stringSchema,
          label: stringSchema,
          anchor_event_id: stringSchema,
          member_event_ids: stringArraySchema,
          identity_relation_ids: stringArraySchema,
          lineage_relation_ids: stringArraySchema,
          narrative_ids: stringArraySchema,
          evidence_ids: stringArraySchema,
          diagnostics: stringArraySchema,
          completeness: { enum: ["complete", "partial", "unresolved"] }
        }
      }
    },
    composites: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          ...sourceAddressRequired,
          "event_id",
          "direct_child_event_ids",
          "descendant_event_ids",
          "boundary",
          "duration",
          "descendant_span",
          "evidence_ids",
          "diagnostics",
          "completeness"
        ],
        properties: {
          ...sourceAddressProperties,
          event_id: stringSchema,
          direct_child_event_ids: stringArraySchema,
          descendant_event_ids: stringArraySchema,
          boundary: {
            type: "object",
            additionalProperties: false,
            required: ["start_event_id", "end_event_id"],
            properties: {
              start_event_id: { type: ["string", "null"] },
              end_event_id: { type: ["string", "null"] }
            }
          },
          duration: { type: ["object", "null"] },
          descendant_span: { type: ["object", "null"] },
          evidence_ids: stringArraySchema,
          diagnostics: stringArraySchema,
          completeness: { enum: ["complete", "partial", "unresolved"] }
        }
      }
    },
    states: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          ...sourceAddressRequired,
          "composite_event_id",
          "subject_handle_id",
          "state_family",
          "status",
          "value",
          "candidate_values",
          "open_ended",
          "start",
          "end",
          "algorithm_version",
          "evidence_ids",
          "diagnostics",
          "completeness"
        ],
        properties: {
          ...sourceAddressProperties,
          composite_event_id: stringSchema,
          subject_handle_id: stringSchema,
          state_family: stringSchema,
          status: { enum: ["resolved", "ambiguous", "unresolved"] },
          value: { type: ["object", "null"] },
          candidate_values: { type: "array", items: { type: "object" } },
          open_ended: { type: ["boolean", "null"] },
          start: {
            type: "object",
            additionalProperties: false,
            required: ["earliest", "latest"],
            properties: {
              earliest: {
                anyOf: [canonicalEventReferenceSchema, { type: "null" }]
              },
              latest: {
                anyOf: [canonicalEventReferenceSchema, { type: "null" }]
              }
            }
          },
          end: {
            type: "object",
            additionalProperties: false,
            required: ["earliest", "latest"],
            properties: {
              earliest: {
                anyOf: [canonicalEventReferenceSchema, { type: "null" }]
              },
              latest: {
                anyOf: [canonicalEventReferenceSchema, { type: "null" }]
              }
            }
          },
          algorithm_version: stringSchema,
          evidence_ids: stringArraySchema,
          diagnostics: stringArraySchema,
          completeness: { enum: ["complete", "partial", "unresolved"] }
        }
      }
    },
    narratives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          ...sourceAddressRequired,
          "id",
          "scope_type",
          "scope_id",
          "locale",
          "narrative_kind",
          "title",
          "body",
          "public_references"
        ],
        properties: {
          ...sourceAddressProperties,
          id: stringSchema,
          scope_type: { enum: ["canon", "event"] },
          scope_id: stringSchema,
          locale: stringSchema,
          narrative_kind: { enum: ["primary", "summary", "annotation"] },
          title: { type: ["string", "null"] },
          body: { type: "string" },
          public_references: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "url"],
              properties: { label: stringSchema, url: stringSchema }
            }
          }
        }
      }
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          ...sourceAddressRequired,
          "id",
          "kind",
          "source_ids",
          "algorithm_version",
          "artifact_key",
          "artifact_sha256"
        ],
        properties: {
          ...sourceAddressProperties,
          id: stringSchema,
          kind: {
            enum: [
              "event",
              "relation",
              "narrative",
              "time_system",
              "projection"
            ]
          },
          source_ids: stringArraySchema,
          algorithm_version: { type: ["string", "null"] },
          artifact_key: { type: ["string", "null"] },
          artifact_sha256: { type: ["string", "null"] }
        }
      }
    },
    diagnostics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "severity", "source", "affected_ids", "message"],
        properties: {
          code: stringSchema,
          severity: { enum: ["info", "warning", "error"] },
          source: {
            type: "object",
            additionalProperties: false,
            properties: sourceAddressProperties
          },
          affected_ids: stringArraySchema,
          message: stringSchema
        }
      }
    },
    algorithm_versions: { type: "object", additionalProperties: stringSchema },
    source_artifact_digests: {
      type: "object",
      additionalProperties: stringSchema
    },
    completeness: { enum: ["complete", "partial", "unresolved"] },
    budget: {
      type: "object",
      additionalProperties: false,
      required: [
        "detail_level",
        "max_entities",
        "max_relations",
        "max_evidence",
        "returned_entities",
        "returned_relations",
        "returned_evidence",
        "truncated",
        "next_scope_hint"
      ],
      properties: {
        detail_level: { enum: ["overview", "standard", "full"] },
        max_entities: nonNegativeIntegerSchema,
        max_relations: nonNegativeIntegerSchema,
        max_evidence: nonNegativeIntegerSchema,
        returned_entities: nonNegativeIntegerSchema,
        returned_relations: nonNegativeIntegerSchema,
        returned_evidence: nonNegativeIntegerSchema,
        truncated: { type: "boolean" },
        next_scope_hint: { type: ["string", "null"] }
      }
    }
  }
} as const;

export const MOIRAI_GRAPH_URL_STATE_SCHEMA = {
  $id: "moirai.graph-url-state.v1",
  type: "object",
  additionalProperties: false,
  required: ["version", "query", "focus"],
  properties: {
    version: { const: MOIRAI_GRAPH_URL_STATE_VERSION },
    query: MOIRAI_GRAPH_QUERY_SCHEMA,
    focus: { anyOf: [entityReferenceSchema, { type: "null" }] }
  }
} as const;
