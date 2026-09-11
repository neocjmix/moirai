import type {
  PublicEvent,
  PublicRelation,
  PublicRelationalTemporalProjection
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";
import type { CanonicalRevisionView } from "./index.js";
import {
  GRAPH_SCOPE_ALGORITHM_VERSION,
  projectCanonGraphScope
} from "./graph-scope.js";

const event = (index: number): PublicEvent => ({
  id: `event-${String(index).padStart(3, "0")}`,
  world_id: "world",
  canon_memberships: ["canon"],
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
    eventCanonMemberships: events.map((item) => ({
      event_id: item.id,
      canon_id: "canon"
    })),
    events,
    relations,
    narratives: []
  };
}

function temporal(
  source: CanonicalRevisionView
): PublicRelationalTemporalProjection {
  const evidence = source.relations.map((item) => item.id).sort();
  return {
    projection_type: "event_relational_time",
    solver_algorithm_version: "test-solver",
    world_id: source.world.id,
    canon_id: "canon",
    source_revision: 1,
    algorithm_version: "test-projection",
    time_systems: source.timeSystems,
    positions: source.events.map((item) => ({
      event_id: item.id,
      kind: source.relations.some(
        (relation) =>
          relation.type === "precedes" &&
          ((relation.source_ref.kind === "event" &&
            relation.source_ref.event_id === item.id) ||
            (relation.target_ref.kind === "event" &&
              relation.target_ref.event_id === item.id))
      )
        ? "relative-only"
        : "unresolved",
      reason: "test fixture",
      source_constraint_ids: evidence,
      algorithm_version: "test-solver",
      display_label: "test",
      knowledge_span: null
    })),
    composites: [],
    virtual_time_events: [],
    relations: source.relations,
    evidence,
    semantic_digest: "test"
  };
}

const scope = (source: CanonicalRevisionView, revision: number) =>
  projectCanonGraphScope(source, revision, "canon", temporal(source));

describe("Canon overview graph scope", () => {
  it("is deterministic and keeps presentation layout distinct from time", () => {
    const events = Array.from({ length: 8 }, (_, index) => event(index));
    const relations = Array.from({ length: 7 }, (_, index) => relation(index));
    const first = scope(view(events, relations), 3);
    const shuffled = scope(
      view([...events].reverse(), [...relations].reverse()),
      3
    );
    expect(first.semantic_digest).toBe(shuffled.semantic_digest);
    expect(first.algorithm_version).toBe(GRAPH_SCOPE_ALGORITHM_VERSION);
    expect(
      first.nodes.every((node) => node.layout_basis === "inferred_chronology")
    ).toBe(true);
    expect(JSON.stringify(first)).not.toContain("coordinate");
    expect(first.truncated).toBe(false);
  });

  it("never exceeds the mobile cell and label budgets", () => {
    const events = Array.from({ length: 260 }, (_, index) => event(index));
    const relations = Array.from({ length: 1100 }, (_, index) =>
      relation(index)
    );
    const artifact = scope(view(events, relations), 4);
    expect(artifact.nodes).toHaveLength(200);
    expect(artifact.budget.visible_cells).toBeLessThanOrEqual(1000);
    expect(artifact.budget.visible_labels).toBeLessThanOrEqual(250);
    expect(artifact.truncated).toBe(true);
    expect(artifact.next_scope_hint).not.toBeNull();
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
    const artifact = scope(view(events, relations), 5);
    expect(artifact.links.map((link) => link.relation_id)).toEqual([
      "relation-0000"
    ]);
    expect(artifact.nodes.map((node) => node.event_id)).toEqual([
      "event-000",
      "event-001"
    ]);
  });

  it("separates incompatible clocks and preserves authored cross-system order", () => {
    const events = Array.from({ length: 5 }, (_, index) => event(index));
    const systems = [
      {
        id: "geology",
        world_id: "world",
        slug: "geology",
        title: "Ma before present",
        kind: "relative" as const,
        definition_version: "1",
        definition: {
          coordinate_codec: "continuous-decimal-v1",
          unit: "Ma",
          direction: "descending",
          capabilities: ["canonicalize", "equality", "compare"]
        }
      },
      {
        id: "cosmic",
        world_id: "world",
        slug: "cosmic",
        title: "Big Bang elapsed seconds",
        kind: "relative" as const,
        definition_version: "1",
        definition: {
          coordinate_codec: "continuous-decimal-v1",
          unit: "second",
          direction: "ascending",
          capabilities: ["canonicalize", "equality", "compare", "difference"]
        }
      },
      {
        id: "fictional",
        world_id: "world",
        slug: "fictional",
        title: "Fictional calendar",
        kind: "custom" as const,
        definition_version: "1",
        definition: {
          coordinate_codec: "opaque-cycle-v1",
          coordinate_pattern: "^[0-9]+ ABY/Cycle-[0-9]+$",
          capabilities: ["canonicalize", "equality"]
        }
      }
    ];
    const source = {
      ...view(events, []),
      timeSystems: systems,
      canonTimeSystems: systems.map((system, index) => ({
        id: `link-${index}`,
        canon_id: "canon",
        time_system_id: system.id
      }))
    };
    const crossSystem: PublicRelation = {
      ...relation(99),
      id: "impact-before-cosmic-observation",
      type: "precedes",
      source_ref: { kind: "event", event_id: events[1]!.id },
      target_ref: { kind: "event", event_id: events[2]!.id }
    };
    const point = (event_id: string, system: string, coordinate: string) => ({
      event_id,
      kind: "exact" as const,
      time_event: {
        kind: "time_event" as const,
        id: `time:${system}:${coordinate}`,
        time_system_ref: { time_system_id: system },
        definition_version: "1",
        coordinate,
        persisted: false as const
      },
      source_constraint_ids: [`position:${event_id}`],
      algorithm_version: "test-solver",
      display_label: "exact",
      knowledge_span: null
    });
    const projection: PublicRelationalTemporalProjection = {
      ...temporal(source),
      time_systems: systems,
      relations: [crossSystem],
      positions: [
        point(events[0]!.id, "geology", "66.05"),
        point(events[1]!.id, "geology", "65.95"),
        point(
          events[2]!.id,
          "cosmic",
          "0.0000000000000000000000000000000000000000001"
        ),
        point(
          events[3]!.id,
          "cosmic",
          "0.0000000000000000000000000000000000000000002"
        ),
        point(events[4]!.id, "fictional", "4 ABY/Cycle-7")
      ]
    };
    const artifact = projectCanonGraphScope(source, 9, "canon", projection);
    const nodes = new Map(artifact.nodes.map((node) => [node.event_id, node]));
    expect(nodes.get(events[0]!.id)!.chronology.mode).toBe("mixed");
    expect(nodes.get(events[2]!.id)!.chronology.mode).toBe("mixed");
    expect(nodes.get(events[0]!.id)!.chronology.time_system_ref).toBeNull();
    expect(nodes.get(events[3]!.id)!.chronology).toMatchObject({
      mode: "mixed",
      time_system_ref: null
    });
    expect(nodes.get(events[4]!.id)!.chronology).toMatchObject({
      mode: "unplaced",
      time_system_ref: null
    });
    expect(JSON.stringify(artifact)).not.toContain("66.05");
    expect(JSON.stringify(artifact)).not.toContain(
      "0.0000000000000000000000000000000000000000001"
    );
    expect(JSON.stringify(artifact)).not.toContain("4 ABY/Cycle-7");
  });
});
