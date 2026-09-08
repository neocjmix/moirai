import type { PublicEvent, PublicRelation } from "@moirai/contracts";
import { describe, expect, it } from "vitest";
import type { CanonicalRevisionView } from "./index.js";
import {
  GRAPH_SCOPE_ALGORITHM_VERSION,
  projectCanonGraphScope
} from "./graph-scope.js";

const event = (index: number): PublicEvent => ({
  id: `event-${String(index).padStart(3, "0")}`,
  canon_id: "canon",
  slug: null,
  kind: index % 7 === 0 ? "composite" : "atomic",
  title: `Event ${index}`,
  summary: null,
  roles: index % 7 === 0 ? ["process"] : [],
  attributes: {}
});

const relation = (index: number): PublicRelation => ({
  id: `relation-${String(index).padStart(4, "0")}`,
  canon_id: "canon",
  type: index % 2 === 0 ? "precedes" : "causes",
  source_ref: {
    kind: "event",
    event_id: `event-${String(index % 8).padStart(3, "0")}`
  },
  target_ref: {
    kind: "event",
    event_id: `event-${String((index + 1) % 8).padStart(3, "0")}`
  },
  direction: "directed",
  attributes: {}
});

function view(
  events: readonly PublicEvent[],
  relations: readonly PublicRelation[]
): CanonicalRevisionView {
  return {
    world: { id: "world", slug: "world", title: "World", description: null },
    canons: [
      {
        id: "canon",
        world_id: "world",
        slug: "canon",
        title: "Canon",
        description: null
      }
    ],
    timeSystems: [],
    canonTimeSystems: [],
    events,
    relations,
    narratives: []
  };
}

describe("Canon overview graph scope", () => {
  it("is deterministic and keeps presentation layout distinct from time", () => {
    const events = Array.from({ length: 8 }, (_, index) => event(index));
    const relations = Array.from({ length: 7 }, (_, index) => relation(index));
    const first = projectCanonGraphScope(view(events, relations), 3, "canon");
    const shuffled = projectCanonGraphScope(
      view([...events].reverse(), [...relations].reverse()),
      3,
      "canon"
    );
    expect(first.semantic_digest).toBe(shuffled.semantic_digest);
    expect(first.algorithm_version).toBe(GRAPH_SCOPE_ALGORITHM_VERSION);
    expect(
      first.nodes.every((node) => node.layout_basis === "stable_overview")
    ).toBe(true);
    expect(JSON.stringify(first)).not.toContain("coordinate");
    expect(first.truncated).toBe(false);
  });

  it("never exceeds the mobile cell and label budgets", () => {
    const events = Array.from({ length: 260 }, (_, index) => event(index));
    const relations = Array.from({ length: 1100 }, (_, index) =>
      relation(index)
    );
    const scope = projectCanonGraphScope(view(events, relations), 4, "canon");
    expect(scope.nodes).toHaveLength(200);
    expect(scope.budget.visible_cells).toBeLessThanOrEqual(1000);
    expect(scope.budget.visible_labels).toBeLessThanOrEqual(250);
    expect(scope.truncated).toBe(true);
    expect(scope.next_scope_hint).not.toBeNull();
  });

  it("does not turn virtual Time Event endpoints into visible Event cells", () => {
    const events = [event(0), event(1)];
    const relations: PublicRelation[] = [
      relation(0),
      {
        ...relation(1),
        id: "relation-time",
        target_ref: {
          kind: "time_event",
          time_system_ref: { time_system_id: "system" },
          definition_version: "1",
          coordinate: "2026-09-05T08:13:21.123456789012Z"
        }
      }
    ];
    const scope = projectCanonGraphScope(view(events, relations), 5, "canon");
    expect(scope.links.map((link) => link.relation_id)).toEqual([
      "relation-0000"
    ]);
    expect(scope.nodes.map((node) => node.event_id)).toEqual([
      "event-000",
      "event-001"
    ]);
  });
});
