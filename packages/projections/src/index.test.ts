import { describe, expect, it } from "vitest";

import {
  projectPublicDocuments,
  projectProcesses,
  projectSubjects,
  projectTimeline
} from "./index.js";

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

describe("Subject projection and handle reconciliation", () => {
  const identityRelation = (
    id: string,
    source: string,
    target: string,
    type: "identity_continues" | "identity_splits" = "identity_continues"
  ) => ({
    id,
    canon_id: "canon",
    type,
    source_event_id: source,
    target_event_id: target,
    direction: "directed" as const,
    attributes: {}
  });

  it("is deterministic and does not merge matching names without identity evidence", () => {
    const view = {
      ...timelineView,
      events: [
        ...timelineView.events,
        {
          ...timelineView.events[0]!,
          id: "event-d",
          title: "A"
        }
      ],
      relations: [identityRelation("identity-a-b", "event-a", "event-b")]
    };
    const first = projectSubjects(view, 7);
    const shuffled = projectSubjects(
      {
        ...view,
        events: [...view.events].reverse(),
        relations: [...view.relations].reverse()
      },
      7
    );

    expect(shuffled).toEqual(first);
    expect(first.projections).toHaveLength(1);
    expect(first.projections[0]).toMatchObject({
      member_event_ids: ["event-a", "event-b"],
      label: "A",
      label_evidence_event_id: "event-a"
    });
    expect(first.projections[0]?.semantic_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never lets an identity Relation cross a Canon boundary", () => {
    const otherEvent = {
      ...timelineView.events[0]!,
      id: "event-other",
      canon_id: "canon-other"
    };
    const result = projectSubjects(
      {
        ...timelineView,
        canons: [
          ...timelineView.canons,
          { ...timelineView.canons[0]!, id: "canon-other" }
        ],
        events: [...timelineView.events, otherEvent],
        relations: [identityRelation("cross-canon", "event-a", "event-other")]
      },
      7
    );

    expect(result.projections).toEqual([]);
    expect(result.handles).toEqual([]);
  });

  it("keeps the anchored handle on split and redirects the younger handle on merge", () => {
    const mergedSource = {
      ...timelineView,
      relations: [
        identityRelation("identity-a-b", "event-a", "event-b"),
        identityRelation("identity-b-c", "event-b", "event-c")
      ]
    };
    const merged = projectSubjects(mergedSource, 1);
    const originalHandle = merged.handles.find(
      (handle) => handle.status === "active"
    )!;
    const split = projectSubjects(
      {
        ...mergedSource,
        relations: [identityRelation("identity-a-b", "event-a", "event-b")]
      },
      2,
      merged.handles
    );
    expect(
      split.handles.filter((handle) => handle.status === "active")
    ).toHaveLength(2);
    expect(
      split.handles.find((handle) => handle.id === originalHandle.id)
    ).toMatchObject({
      anchor_event_id: "event-a",
      member_event_ids: ["event-a", "event-b"],
      status: "active"
    });

    const remerged = projectSubjects(mergedSource, 3, split.handles);
    const active = remerged.handles.find(
      (handle) => handle.status === "active"
    )!;
    const redirected = remerged.handles.find(
      (handle) => handle.status === "redirected"
    )!;
    expect(active.id).toBe(originalHandle.id);
    expect(redirected.redirect_to).toBe(active.id);
  });

  it("keeps the handle and selects a stable replacement when its anchor is withdrawn", () => {
    const source = {
      ...timelineView,
      relations: [identityRelation("identity-a-b", "event-a", "event-b")]
    };
    const initial = projectSubjects(source, 1);
    const handle = initial.handles[0]!;
    const afterWithdrawal = projectSubjects(
      {
        ...source,
        events: source.events.filter((event) => event.id !== "event-a"),
        relations: []
      },
      2,
      initial.handles
    );
    expect(afterWithdrawal.handles).toContainEqual({
      ...handle,
      anchor_event_id: "event-b",
      projection_revision: 2,
      member_event_ids: ["event-b"]
    });
  });
});

describe("Process and Duration projection", () => {
  const processView = {
    ...timelineView,
    events: [
      {
        ...timelineView.events[0]!,
        id: "process",
        kind: "composite" as const,
        title: "A long process",
        roles: ["process"]
      },
      ...timelineView.events
    ],
    temporalPlacements: [
      {
        ...timelineView.temporalPlacements[0]!,
        id: "placement-a",
        event_id: "event-a",
        earliest_start: { value: 10 },
        latest_start: { value: 12 }
      },
      {
        ...timelineView.temporalPlacements[1]!,
        id: "placement-c",
        event_id: "event-c",
        earliest_start: { value: 20 },
        latest_start: { value: 23 }
      }
    ],
    relations: [
      {
        id: "contains-a",
        canon_id: "canon",
        type: "contains" as const,
        source_event_id: "process",
        target_event_id: "event-a",
        direction: "directed" as const,
        attributes: {}
      },
      {
        id: "contains-b",
        canon_id: "canon",
        type: "contains" as const,
        source_event_id: "process",
        target_event_id: "event-b",
        direction: "directed" as const,
        attributes: {}
      },
      {
        id: "contains-c",
        canon_id: "canon",
        type: "contains" as const,
        source_event_id: "event-b",
        target_event_id: "event-c",
        direction: "directed" as const,
        attributes: {}
      },
      {
        ...timelineView.relations[0]!,
        id: "precedes-a-c",
        source_event_id: "event-a",
        target_event_id: "event-c"
      }
    ],
    narratives: [
      {
        id: "process-narrative",
        canon_id: "canon",
        scope_type: "event" as const,
        scope_id: "process",
        locale: "en",
        kind: "primary" as const,
        title: "Process",
        body: "Process narrative",
        public_references: []
      }
    ]
  };

  it("is deterministic, closes nested containment and preserves uncertain duration bounds", () => {
    const first = projectProcesses(processView, 9);
    const shuffled = projectProcesses(
      {
        ...processView,
        events: [...processView.events].reverse(),
        relations: [...processView.relations].reverse(),
        temporalPlacements: [...processView.temporalPlacements].reverse()
      },
      9
    );

    expect(shuffled).toEqual(first);
    expect(first[0]).toMatchObject({
      projection_type: "process",
      process_event_id: "process",
      direct_child_event_ids: ["event-a", "event-b"],
      descendant_event_ids: ["event-a", "event-b", "event-c"],
      start_event_ids: ["event-a", "event-b"],
      end_event_ids: ["event-b", "event-c"],
      narrative_ids: ["process-narrative"],
      completeness: "complete",
      durations: [
        {
          time_system_id: "time",
          start_earliest: 10,
          start_latest: 12,
          end_earliest: 20,
          end_latest: 23,
          minimum: 8,
          maximum: 13,
          kind: "range",
          evidence_ids: ["placement-a", "placement-c"]
        }
      ]
    });
    expect(first[0]?.semantic_digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not invent a duration for an empty Process", () => {
    const result = projectProcesses(
      {
        ...timelineView,
        events: [
          {
            ...timelineView.events[0]!,
            id: "process",
            kind: "composite" as const,
            roles: ["process"]
          }
        ],
        temporalPlacements: [],
        relations: []
      },
      10
    );

    expect(result[0]).toMatchObject({
      durations: [],
      completeness: "partial",
      diagnostics: [
        { code: "empty_process", affected_ids: ["process"] },
        {
          code: "process_duration_unresolved",
          affected_ids: ["process"]
        }
      ]
    });
  });
});
