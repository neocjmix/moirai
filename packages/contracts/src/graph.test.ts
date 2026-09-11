import { describe, expect, it } from "vitest";

import {
  MOIRAI_GRAPH_CONTRACT_VERSION,
  MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
  MOIRAI_GRAPH_QUERY_RESULT_SCHEMA,
  MOIRAI_GRAPH_QUERY_SCHEMA,
  MOIRAI_GRAPH_RELATION_TYPES,
  MOIRAI_GRAPH_URL_STATE_SCHEMA,
  MOIRAI_GRAPH_URL_STATE_VERSION,
  type MoiraiGraphCompatibility,
  type MoiraiGraphQuery,
  type MoiraiGraphQueryResult
} from "./index.js";

const relationTypes = MOIRAI_GRAPH_RELATION_TYPES;

const targetTimeSystem = {
  time_system_id: "time-system-a",
  definition_version: "1",
  adapter_identity: "proleptic-gregorian-utc",
  comparison_domain: "utc-instant"
} as const;

const query: MoiraiGraphQuery = {
  contract_version: MOIRAI_GRAPH_CONTRACT_VERSION,
  temporal_frame: { target: targetTimeSystem },
  sources: [
    {
      world_id: "world-a",
      served_revision: 7,
      canon_ids: ["canon-a"],
      time_systems: [targetTimeSystem]
    },
    {
      world_id: "world-b",
      served_revision: 42,
      canon_ids: ["canon-b", "canon-b-alt"],
      time_systems: [
        {
          ...targetTimeSystem,
          time_system_id: "time-system-b"
        }
      ]
    }
  ],
  scope: { kind: "overview" },
  entity_filter: {
    event_kinds: ["atomic", "composite"],
    roles: [],
    subject_handle_ids: [],
    include_states: true,
    include_narratives: true,
    include_virtual_time_events: true
  },
  relation_filter: {
    types: relationTypes,
    directions: ["directed", "undirected"]
  },
  diagnostics_filter: {
    include_codes: [],
    include_unplaced: true,
    include_unresolved: true
  },
  budget: {
    detail_level: "overview",
    max_entities: 1000,
    max_relations: 2000,
    max_evidence: 4000
  }
};

const storedEvent = { kind: "event", event_id: "event-a" } as const;
const timeEvent = {
  kind: "time_event",
  time_system_ref: { time_system_id: "time-system-a" },
  definition_version: "1",
  coordinate: "2026-09-09T00:00:00.000000000000Z"
} as const;

const result: MoiraiGraphQueryResult = {
  contract_version: MOIRAI_GRAPH_RESULT_CONTRACT_VERSION,
  query,
  revision_vector: [
    { world_id: "world-a", served_revision: 7 },
    { world_id: "world-b", served_revision: 42 }
  ],
  compatibility: [
    {
      source: targetTimeSystem,
      target: targetTimeSystem,
      status: "native",
      reason_code: "same_adapter_domain_and_definition",
      adapter_id: "proleptic-gregorian-utc@1",
      lossless: true
    }
  ],
  time_systems: [
    {
      world_id: "world-a",
      served_revision: 7,
      identity: targetTimeSystem,
      definition: { calendar: "proleptic-gregorian" },
      capabilities: ["canonicalize", "equality", "compare", "boundary"]
    }
  ],
  events: [
    {
      world_id: "world-a",
      served_revision: 7,
      canon_memberships: ["canon-a", "canon-a-alt"],
      matched_canon_ids: ["canon-a"],
      id: "event-a",
      slug: null,
      event_kind: "atomic",
      title: "Event A",
      summary: null,
      roles: [],
      attributes: {},
      temporal_position: {
        kind: "exact",
        at: timeEvent,
        evidence_ids: ["relation-precedes"]
      },
      narrative_ids: [],
      evidence_ids: ["event-a"]
    }
  ],
  virtual_time_events: [
    {
      world_id: "world-a",
      canon_id: "canon-a",
      served_revision: 7,
      id: "time-event://time-system-a/1/coordinate",
      persisted: false,
      reference: timeEvent,
      evidence_ids: ["relation-precedes"]
    }
  ],
  relations: relationTypes.map((type, index) => ({
    world_id: index % 2 === 0 ? "world-a" : "world-b",
    canon_memberships: [index % 2 === 0 ? "canon-a" : "canon-b"],
    matched_canon_ids: [index % 2 === 0 ? "canon-a" : "canon-b"],
    served_revision: index % 2 === 0 ? 7 : 42,
    id: `relation-${type}`,
    type,
    direction: type === "coincides" ? "undirected" : "directed",
    source_ref: storedEvent,
    target_ref: index % 2 === 0 ? timeEvent : storedEvent,
    attributes: {},
    evidence_ids: [`relation-${type}`]
  })),
  subjects: [],
  composites: [],
  states: [],
  narratives: [],
  evidence: [],
  diagnostics: [],
  algorithm_versions: { temporal: "event-relational-projection/1" },
  source_artifact_digests: {
    "world-a@7": "sha256:a",
    "world-b@42": "sha256:b"
  },
  completeness: "complete",
  budget: {
    ...query.budget,
    returned_entities: 2,
    returned_relations: relationTypes.length,
    returned_evidence: 0,
    truncated: false,
    next_scope_hint: null
  }
};

describe("M4.5-A Moirai-native graph contracts", () => {
  it("publishes versioned query, result and URL state schemas", () => {
    expect(MOIRAI_GRAPH_QUERY_SCHEMA.$id).toBe("moirai.graph-query.v1");
    expect(MOIRAI_GRAPH_QUERY_RESULT_SCHEMA.$id).toBe(
      "moirai.graph-query-result.v3"
    );
    expect(MOIRAI_GRAPH_URL_STATE_SCHEMA.$id).toBe("moirai.graph-url-state.v1");
    expect(MOIRAI_GRAPH_URL_STATE_VERSION).toBe(1);
  });

  it("round-trips every canonical EventReference and Relation type", () => {
    const roundTripped = JSON.parse(
      JSON.stringify(result)
    ) as MoiraiGraphQueryResult;

    expect(roundTripped.relations.map((relation) => relation.type)).toEqual(
      relationTypes
    );
    expect(roundTripped.relations[0]?.source_ref).toEqual(storedEvent);
    expect(roundTripped.relations[0]?.target_ref).toEqual(timeEvent);
    expect(roundTripped.virtual_time_events[0]?.persisted).toBe(false);
  });

  it("preserves a World-scoped revision vector instead of collapsing it", () => {
    expect(result.revision_vector).toEqual([
      { world_id: "world-a", served_revision: 7 },
      { world_id: "world-b", served_revision: 42 }
    ]);
    expect(
      result.query.sources.map((source) => source.served_revision)
    ).toEqual([7, 42]);
  });

  it("represents a shared Event once with full and matched Canon context", () => {
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "event-a",
      world_id: "world-a",
      canon_memberships: ["canon-a", "canon-a-alt"],
      matched_canon_ids: ["canon-a"]
    });
    expect(result.events[0]).not.toHaveProperty("canon_id");
  });

  it("does not infer compatibility from matching display metadata", () => {
    const sameDisplayMetadataButDifferentAdapter: MoiraiGraphCompatibility = {
      source: {
        ...targetTimeSystem,
        adapter_identity: "fictional-calendar",
        comparison_domain: "fictional-era"
      },
      target: targetTimeSystem,
      status: "incompatible",
      reason_code: "adapter_identity_or_domain_mismatch",
      adapter_id: null,
      lossless: false
    };

    expect(sameDisplayMetadataButDifferentAdapter.status).toBe("incompatible");
    expect(sameDisplayMetadataButDifferentAdapter.lossless).toBe(false);
    expect("title" in sameDisplayMetadataButDifferentAdapter.source).toBe(
      false
    );
    expect("kind" in sameDisplayMetadataButDifferentAdapter.source).toBe(false);
  });

  it("keeps renderer geometry out of the semantic contract", () => {
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("workspace.tabs");
    expect(serialized).not.toContain('"cell_id"');
    expect(serialized).not.toContain('"x"');
    expect(serialized).not.toContain('"y"');
    expect(serialized).not.toContain('"svg_path"');
  });
});
