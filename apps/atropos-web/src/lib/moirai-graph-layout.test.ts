import { describe, expect, it } from "vitest";

import type {
  MoiraiGraphEvent,
  MoiraiGraphQueryResult,
  MoiraiGraphRelation
} from "@moirai/contracts";

import {
  layoutMoiraiGraph,
  MOIRAI_GRAPH_VISIBLE_NODE_CAP
} from "./moirai-graph-layout.js";

const worldId = "world-a";
const k1 = "canon-k1";
const k2 = "canon-k2";
const timeRef = {
  kind: "time_event",
  time_system_ref: { time_system_id: "time-a" },
  definition_version: "1",
  coordinate: "2026-09-12T00:00:00.000000000000Z"
} as const;

function event(
  id: string,
  position: MoiraiGraphEvent["temporal_position"] = {
    kind: "unplaced",
    reason_code: "no_authored_temporal_placement",
    evidence_ids: []
  }
): MoiraiGraphEvent {
  return {
    world_id: worldId,
    served_revision: 4,
    canon_memberships: [k1, k2],
    matched_canon_ids: [k1, k2],
    id,
    slug: null,
    event_kind: "atomic",
    title: id,
    summary: null,
    roles: [],
    attributes: {},
    temporal_position: position,
    narrative_ids: [],
    evidence_ids: []
  };
}

function relation(
  id: string,
  type: MoiraiGraphRelation["type"]
): MoiraiGraphRelation {
  return {
    world_id: worldId,
    served_revision: 4,
    canon_memberships: [k1, k2],
    matched_canon_ids: [k1, k2],
    id,
    type,
    direction: "directed",
    source_ref: { kind: "event", event_id: "event-a" },
    target_ref: { kind: "event", event_id: "event-b" },
    attributes: {},
    evidence_ids: [id]
  };
}

function result(
  events: readonly MoiraiGraphEvent[],
  relations: readonly MoiraiGraphRelation[] = []
): MoiraiGraphQueryResult {
  return {
    contract_version: 3,
    query: {
      contract_version: 1,
      temporal_frame: {
        target: {
          time_system_id: "time-a",
          definition_version: "1",
          adapter_identity: "adapter-a",
          comparison_domain: "domain-a"
        }
      },
      sources: [
        {
          world_id: worldId,
          served_revision: 4,
          canon_ids: [k1, k2],
          time_systems: []
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
        types: ["influences", "causes"],
        directions: ["directed"]
      },
      diagnostics_filter: {
        include_codes: [],
        include_unplaced: true,
        include_unresolved: true
      },
      budget: {
        detail_level: "overview",
        max_entities: 100_000,
        max_relations: 200_000,
        max_evidence: 200_000
      }
    },
    revision_vector: [{ world_id: worldId, served_revision: 4 }],
    compatibility: [],
    time_systems: [],
    events,
    virtual_time_events: [
      {
        world_id: worldId,
        canon_id: k1,
        served_revision: 4,
        id: "time-event-a",
        persisted: false,
        reference: timeRef,
        evidence_ids: ["time-evidence"]
      }
    ],
    relations,
    subjects: [
      {
        world_id: worldId,
        canon_id: k1,
        served_revision: 4,
        subject_handle_id: "subject-a",
        label: "Subject A",
        anchor_event_id: "event-a",
        member_event_ids: ["event-a", "event-b"],
        identity_relation_ids: [],
        lineage_relation_ids: [],
        narrative_ids: [],
        evidence_ids: [],
        diagnostics: [],
        completeness: "complete"
      }
    ],
    composites: [],
    states: [],
    narratives: [],
    evidence: [],
    diagnostics: [],
    algorithm_versions: { temporal: "temporal/1" },
    source_artifact_digests: { source: "digest" },
    completeness: "complete",
    budget: {
      detail_level: "overview",
      max_entities: 100_000,
      max_relations: 200_000,
      max_evidence: 200_000,
      returned_entities: events.length,
      returned_relations: relations.length,
      returned_evidence: 0,
      truncated: false,
      next_scope_hint: null
    }
  };
}

describe("M4.5-H native graph layout", () => {
  it("keeps World identity singular while preserving Canon context and relation identity", () => {
    const input = result(
      [
        event("event-a", {
          kind: "exact",
          at: timeRef,
          evidence_ids: ["exact"]
        }),
        event("event-a", {
          kind: "exact",
          at: timeRef,
          evidence_ids: ["exact"]
        }),
        event("event-b", {
          kind: "relative_only",
          component_id: "component-a",
          rank: 1,
          evidence_ids: ["relative"]
        })
      ],
      [
        relation("relation-shared", "influences"),
        relation("relation-shared", "influences"),
        relation("relation-k1", "causes")
      ]
    );
    const layout = layoutMoiraiGraph(input);

    expect(
      layout.nodes.filter((node) => node.entityId === "event-a")
    ).toHaveLength(1);
    expect(layout.nodes.some((node) => node.kind === "time_event")).toBe(true);
    expect(layout.edges).toHaveLength(2);
    expect(layout.edges.map((edge) => edge.relation.id)).toEqual([
      "relation-shared",
      "relation-k1"
    ]);
    expect(layout.lanes).toContainEqual(
      expect.objectContaining({ label: "Subject · Subject A" })
    );
  });

  it("distinguishes exact, bounded, relative-only, mixed and unplaced without canonical coordinates in the contract", () => {
    const layout = layoutMoiraiGraph(
      result([
        event("exact", { kind: "exact", at: timeRef, evidence_ids: [] }),
        event("bounded", {
          kind: "bounded",
          lower: timeRef,
          lower_inclusive: true,
          upper: null,
          upper_inclusive: false,
          evidence_ids: []
        }),
        event("relative", {
          kind: "relative_only",
          component_id: "r",
          rank: 0,
          evidence_ids: []
        }),
        event("mixed", {
          kind: "mixed",
          component_id: "m",
          rank: 0,
          bounds: [timeRef],
          evidence_ids: []
        }),
        event("unplaced")
      ])
    );
    expect(
      new Set(
        layout.nodes
          .filter((node) => node.kind === "event")
          .map((node) => node.placementKind)
      )
    ).toEqual(
      new Set(["exact", "bounded", "relative_only", "mixed", "unplaced"])
    );
  });

  it("enforces the 2,500 visible-node hard cap for a 100k fixture", () => {
    const events = Array.from({ length: 100_000 }, (_, index) =>
      event(`event-${String(index).padStart(6, "0")}`)
    );
    const layout = layoutMoiraiGraph(result(events));
    expect(layout.nodes).toHaveLength(MOIRAI_GRAPH_VISIBLE_NODE_CAP);
    expect(layout.omittedNodeCount).toBe(97_501);
    expect(layout.diagnostics[0]).toContain("visible_node_cap");
  });
});
