import { describe, expect, it } from "vitest";

import type {
  MoiraiGraphEvent,
  MoiraiGraphQueryResult
} from "@moirai/contracts";

import {
  LEGACY_VIEWPORT_CELL_LIMIT,
  adaptMoiraiGraphToLegacyViewport
} from "./moirai-legacy-adapter.js";

function event(id: string, memberships = ["canon-a"]): MoiraiGraphEvent {
  return {
    world_id: "world-a",
    served_revision: 4,
    canon_memberships: memberships,
    matched_canon_ids: memberships,
    id,
    slug: id,
    event_kind: "atomic",
    title: id,
    summary: null,
    roles: [],
    attributes: {},
    temporal_position: {
      kind: "relative_only",
      component_id: "component-a",
      rank: Number(id.split("-").at(-1)) || 0,
      evidence_ids: []
    },
    narrative_ids: [],
    evidence_ids: []
  };
}

function result(events: readonly MoiraiGraphEvent[]): MoiraiGraphQueryResult {
  return {
    contract_version: 3,
    query: {
      contract_version: 1,
      temporal_frame: {
        target: {
          time_system_id: "frame",
          definition_version: "1",
          adapter_identity: "adapter",
          comparison_domain: "domain"
        }
      },
      sources: [
        {
          world_id: "world-a",
          served_revision: 4,
          canon_ids: ["canon-a", "canon-b"],
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
      relation_filter: { types: ["influences"], directions: ["directed"] },
      diagnostics_filter: {
        include_codes: [],
        include_unplaced: true,
        include_unresolved: true
      },
      budget: {
        detail_level: "overview",
        max_entities: 100_000,
        max_relations: 100_000,
        max_evidence: 100_000
      }
    },
    revision_vector: [{ world_id: "world-a", served_revision: 4 }],
    compatibility: [],
    time_systems: [],
    events,
    virtual_time_events: [],
    relations: [],
    subjects: [],
    composites: [],
    states: [],
    narratives: [],
    evidence: [],
    diagnostics: [],
    algorithm_versions: {},
    source_artifact_digests: {},
    completeness: "complete",
    budget: {
      detail_level: "overview",
      max_entities: 100_000,
      max_relations: 100_000,
      max_evidence: 100_000,
      returned_entities: events.length,
      returned_relations: 0,
      returned_evidence: 0,
      truncated: false,
      next_scope_hint: null
    }
  };
}

describe("Moirai v3 legacy viewport bridge", () => {
  it("renders a shared Event once and reports its single-Canon display approximation", () => {
    const adapted = adaptMoiraiGraphToLegacyViewport(
      result([event("event-shared", ["canon-a", "canon-b"])])
    );

    expect(adapted.viewport_model.entities).toHaveLength(1);
    expect(adapted.viewport_model.entities[0]?.eventId).toBe("event-shared");
    expect(adapted.loss_report.losses).toContainEqual(
      expect.objectContaining({
        semantic_kind: "event",
        reason_code: "legacy_single_canon_display_slot",
        source_ids: ["world-a:event-shared"]
      })
    );
  });

  it("bounds a 100k input without returning one browser cell or loss row per omitted Event", () => {
    const events = Array.from({ length: 100_000 }, (_, index) =>
      event(`event-${index}`)
    );
    const adapted = adaptMoiraiGraphToLegacyViewport(result(events));

    expect(adapted.viewport_model.entities).toHaveLength(
      LEGACY_VIEWPORT_CELL_LIMIT
    );
    expect(adapted.viewport_model.truncated).toBe(true);
    const budgetLoss = adapted.loss_report.losses.find(
      (loss) => loss.reason_code === "legacy_visible_cell_budget"
    );
    expect(budgetLoss?.source_ids).toEqual([
      "world-a:query:event-overflow:97500"
    ]);
    expect(adapted.loss_report.losses.length).toBeLessThan(10);
  });
});
