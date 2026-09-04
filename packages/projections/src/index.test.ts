import { describe, expect, it } from "vitest";

import { projectPublicDocuments, projectTimeline } from "./index.js";

const timelineView = {
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
  timeSystems: [
    {
      id: "time",
      world_id: "world",
      slug: "time",
      title: "Time",
      kind: "ordinal" as const,
      definition_version: "1",
      definition: {}
    }
  ],
  canonTimeSystems: [
    { id: "canon-time", canon_id: "canon", time_system_id: "time" }
  ],
  events: [
    {
      id: "event-a",
      canon_id: "canon",
      slug: null,
      kind: "atomic" as const,
      title: "A",
      summary: null,
      roles: [],
      attributes: {}
    },
    {
      id: "event-b",
      canon_id: "canon",
      slug: null,
      kind: "atomic" as const,
      title: "B",
      summary: null,
      roles: [],
      attributes: {}
    },
    {
      id: "event-c",
      canon_id: "canon",
      slug: null,
      kind: "atomic" as const,
      title: "C",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  temporalPlacements: [
    {
      id: "placement-a",
      event_id: "event-a",
      time_system_id: "time",
      kind: "point" as const,
      earliest_start: { value: 1 },
      latest_start: { value: 2 },
      earliest_end: null,
      latest_end: null,
      precision: "step",
      certainty: "uncertain" as const,
      display_label: "First or second"
    },
    {
      id: "placement-b",
      event_id: "event-b",
      time_system_id: "time",
      kind: "point" as const,
      earliest_start: { value: 2 },
      latest_start: { value: 3 },
      earliest_end: null,
      latest_end: null,
      precision: "step",
      certainty: "uncertain" as const,
      display_label: "Second or third"
    }
  ],
  relations: [
    {
      id: "precedes-b-c",
      canon_id: "canon",
      type: "precedes" as const,
      source_event_id: "event-b",
      target_event_id: "event-c",
      direction: "directed" as const,
      attributes: {}
    }
  ],
  narratives: []
};

describe("public projection allowlist", () => {
  it("emits only public World, Canon and Event fields", () => {
    const source = {
      world: {
        id: "world",
        slug: "world",
        title: "World",
        description: null
      },
      canons: [
        {
          id: "canon",
          world_id: "world",
          slug: "canon",
          title: "Canon",
          description: null
        }
      ],
      events: [
        {
          id: "event",
          canon_id: "canon",
          slug: null,
          kind: "atomic",
          title: "Event",
          summary: null,
          roles: [],
          attributes: {},
          actor: "private-actor-must-not-publish"
        }
      ],
      timeSystems: [],
      canonTimeSystems: [],
      temporalPlacements: [],
      relations: [],
      narratives: []
    } as const;
    const documents = projectPublicDocuments(
      source,
      1,
      "2026-08-30T00:00:00.000Z"
    );
    const serialized = JSON.stringify(documents);
    expect(serialized).toContain('"served_revision":1');
    expect(serialized).not.toContain("actor");
    expect(serialized).not.toContain("origin");
    expect(serialized).not.toContain("change_set");
    expect(
      documents.some((document) => document.key.endsWith("/search/en.json"))
    ).toBe(true);
  });
});

describe("Timeline projection", () => {
  it("is deterministic across canonical input order and preserves overlapping ranges", () => {
    const original = JSON.stringify(timelineView);
    const first = projectTimeline(timelineView, 7, {
      canonId: "canon",
      timeSystemId: "time"
    });
    const shuffled = projectTimeline(
      {
        ...timelineView,
        events: [...timelineView.events].reverse(),
        temporalPlacements: [...timelineView.temporalPlacements].reverse(),
        relations: [...timelineView.relations].reverse()
      },
      7,
      { canonId: "canon", timeSystemId: "time" }
    );

    expect(shuffled).toEqual(first);
    expect(first.semantic_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.items[0]?.unordered_group).toBe(
      first.items[1]?.unordered_group
    );
    expect(first.items[2]).toMatchObject({
      event_id: "event-c",
      placement_kind: "structural_order",
      structural_rank: 1
    });
    expect(JSON.stringify(timelineView)).toBe(original);
  });

  it("reports cycles and events without time or structural evidence", () => {
    const result = projectTimeline(
      {
        ...timelineView,
        temporalPlacements: [],
        relations: [
          {
            ...timelineView.relations[0]!,
            id: "a-b",
            source_event_id: "event-a",
            target_event_id: "event-b"
          },
          {
            ...timelineView.relations[0]!,
            id: "b-a",
            source_event_id: "event-b",
            target_event_id: "event-a"
          }
        ]
      },
      8,
      { canonId: "canon", timeSystemId: "time" }
    );

    expect(result.completeness).toBe("partial");
    expect(result.diagnostics).toEqual([
      {
        code: "timeline_cycle",
        affected_ids: ["event-a", "event-b"]
      },
      { code: "timeline_unplaced", affected_ids: ["event-c"] }
    ]);
  });
});
