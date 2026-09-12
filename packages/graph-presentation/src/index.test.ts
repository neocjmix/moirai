import { describe, expect, it } from "vitest";
import type {
  MoiraiGraphEvent,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import {
  findPresentationEvent,
  presentationIdentityKey,
  projectPresentationInput
} from "./index.js";

const frame = {
  time_system_id: "t",
  definition_version: "1",
  adapter_identity: "ordinal",
  comparison_domain: "test"
};
const time = {
  kind: "time_event" as const,
  time_system_ref: { time_system_id: "t" },
  definition_version: "1",
  coordinate: "12345678901234567890"
};
const address = { world_id: "w", served_revision: 4 };
const membership = {
  ...address,
  canon_memberships: ["k1", "k2"],
  matched_canon_ids: ["k1", "k2"]
};
const budget = {
  detail_level: "full" as const,
  max_entities: 1000,
  max_relations: 2000,
  max_evidence: 4000
};
const event = (
  id: string,
  kind: "atomic" | "composite" = "atomic"
): MoiraiGraphEvent => ({
  ...membership,
  id,
  slug: null,
  event_kind: kind,
  title: id,
  summary: null,
  roles: [],
  attributes: { precision: "unchanged" },
  temporal_position: { kind: "exact", at: time, evidence_ids: ["r"] },
  narrative_ids: [],
  evidence_ids: [id]
});
const fixture = (): MoiraiGraphQueryResult => ({
  contract_version: 3,
  query: {
    contract_version: 1,
    temporal_frame: { target: frame },
    sources: [{ ...address, canon_ids: ["k2", "k1"], time_systems: [frame] }],
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
      types: ["contains", "precedes", "coincides"],
      directions: ["directed", "undirected"]
    },
    diagnostics_filter: {
      include_codes: [],
      include_unplaced: true,
      include_unresolved: true
    },
    budget
  },
  revision_vector: [address],
  compatibility: [],
  time_systems: [],
  events: [event("a"), event("b"), event("c", "composite")],
  virtual_time_events: [
    {
      ...address,
      canon_id: "k1",
      id: "a",
      persisted: false,
      reference: time,
      evidence_ids: ["r"]
    }
  ],
  relations: [
    {
      ...membership,
      id: "r",
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "a" },
      target_ref: time,
      attributes: { note: "precise" },
      evidence_ids: ["r"]
    },
    {
      ...membership,
      id: "contains",
      type: "contains",
      direction: "directed",
      source_ref: { kind: "event", event_id: "c" },
      target_ref: { kind: "event", event_id: "a" },
      attributes: {},
      evidence_ids: ["contains"]
    }
  ],
  subjects: [],
  composites: [],
  states: [],
  narratives: [],
  evidence: [],
  diagnostics: [],
  algorithm_versions: { temporal: "test/1" },
  source_artifact_digests: { temporal: "unchanged" },
  completeness: "complete",
  budget: {
    ...budget,
    returned_entities: 4,
    returned_relations: 2,
    returned_evidence: 0,
    truncated: false,
    next_scope_hint: null
  }
});

describe("M4.6-B one-way presentation input", () => {
  it("keeps stable identity and all memberships behind Canon-specific instances", () => {
    const input = fixture();
    const before = structuredClone(input);
    const output = projectPresentationInput(input);
    expect(output.scopes.map((s) => s.source.canon_id)).toEqual(["k2", "k1"]);
    const instances = output.scopes.flatMap((s) =>
      s.nodes.filter(
        (n) => n.reference.kind === "event" && n.reference.event_id === "a"
      )
    );
    expect(instances).toHaveLength(2);
    expect(new Set(instances.map((n) => n.id)).size).toBe(2);
    expect(new Set(instances.map((n) => n.identityKey)).size).toBe(1);
    expect(output.scopes[0]!.links[0]!.identityKey).toBe(
      output.scopes[1]!.links[0]!.identityKey
    );
    expect(findPresentationEvent(output, instances[0]!.id)).toEqual(
      input.events[0]
    );
    expect(findPresentationEvent(output, instances[1]!.id)).toEqual(
      input.events[0]
    );
    expect(output.sidecar).toEqual(before);
    expect(input).toEqual(before);
  });

  it("never treats the first merged Canon temporal result as every Canon's fact", () => {
    const result = projectPresentationInput(fixture());
    for (const scope of result.scopes) {
      expect(
        scope.nodes
          .filter((n) => n.shape !== "anchor")
          .every((n) => n.temporalPosition === null)
      ).toBe(true);
      expect(
        result.diagnostics.some(
          (d) =>
            d.code === "m46_context_time_requires_resolution" &&
            d.source.canon_id === scope.source.canon_id
        )
      ).toBe(true);
    }
  });

  it("separates virtual anchors from persisted Events even if their input IDs coincide", () => {
    const result = projectPresentationInput(fixture());
    const scope = result.scopes[1]!;
    const anchor = scope.nodes.find((n) => n.shape === "anchor")!;
    expect(anchor.id).toMatch(/^t_anchor_/);
    expect(anchor.reference).toEqual(time);
    expect(findPresentationEvent(result, anchor.id)).toBeNull();
    expect(presentationIdentityKey("w", time)).not.toBe(
      presentationIdentityKey("w", { kind: "event", event_id: "a" })
    );
    expect(presentationIdentityKey("w:other", time)).not.toBe(
      anchor.identityKey
    );
  });

  it("retains missing endpoints and unsupported geometry as explicit diagnostic plus sidecar", () => {
    const input = fixture();
    const partial = {
      ...input,
      events: input.events.filter((e) => e.id !== "a")
    };
    const result = projectPresentationInput(partial);
    expect(result.scopes.every((s) => s.links.length === 0)).toBe(true);
    expect(result.sidecar.relations).toEqual(input.relations);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "m46_relation_endpoint_unavailable"
    );
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "m46_containment_partial"
    );
  });

  it("does not mix served Revisions or off-scope membership", () => {
    const input = fixture();
    expect(
      projectPresentationInput({
        ...input,
        revision_vector: [{ ...address, served_revision: 5 }]
      }).scopes
    ).toEqual([]);
    const wrong = { ...input.events[0]!, served_revision: 5 };
    const result = projectPresentationInput({ ...input, events: [wrong] });
    expect(
      result.scopes.flatMap((s) => s.nodes).filter((n) => n.shape !== "anchor")
    ).toEqual([]);
  });

  it("uses deterministic instance geometry input when entity order changes", () => {
    const input = fixture();
    const original = projectPresentationInput(input);
    const reordered = projectPresentationInput({
      ...input,
      events: [...input.events].reverse(),
      relations: [...input.relations].reverse()
    });
    expect(reordered.scopes).toEqual(original.scopes);
    expect(reordered.diagnostics).toEqual(original.diagnostics);
  });

  it("preserves unplaced reasons, membership, evidence and attributes verbatim", () => {
    const input = fixture();
    const unplaced = {
      ...input.events[0]!,
      matched_canon_ids: ["k1"],
      temporal_position: {
        kind: "unplaced" as const,
        reason_code: "opaque_time_system",
        evidence_ids: ["proof"]
      }
    };
    const output = projectPresentationInput({ ...input, events: [unplaced] });
    const node = output.scopes[1]!.nodes.find((n) => n.shape === "point")!;
    expect(node.temporalPosition).toEqual(unplaced.temporal_position);
    expect(output.diagnostics.map((d) => d.code)).toContain(
      "m46_event_unplaced"
    );
    expect(findPresentationEvent(output, node.id)).toEqual(unplaced);
  });
});
