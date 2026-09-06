import type {
  PublicEvent,
  PublicRelation,
  PublicTemporalPlacement
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  type CanonicalRevisionView,
  projectProcesses,
  projectStates,
  projectTimeline
} from "./index.js";

const event = (
  id: string,
  overrides: Partial<PublicEvent> = {}
): PublicEvent => ({
  id,
  canon_id: "canon",
  slug: null,
  kind: "atomic",
  title: id,
  summary: null,
  roles: [],
  attributes: {},
  ...overrides
});

const placement = (
  id: string,
  eventId: string,
  earliest: number,
  latest: number,
  precision: string,
  displayLabel: string | null = null
): PublicTemporalPlacement => ({
  id,
  event_id: eventId,
  time_system_id: "time",
  kind: "point",
  earliest_start: { value: earliest },
  latest_start: { value: latest },
  earliest_end: null,
  latest_end: null,
  precision,
  certainty: earliest === latest ? "exact" : "uncertain",
  display_label: displayLabel
});

const relation = (
  id: string,
  type: PublicRelation["type"],
  sourceEventId: string,
  targetEventId: string
): PublicRelation => ({
  id,
  canon_id: "canon",
  type,
  source_event_id: sourceEventId,
  target_event_id: targetEventId,
  direction: "directed",
  attributes: {}
});

const view = (
  events: readonly PublicEvent[],
  temporalPlacements: readonly PublicTemporalPlacement[] = [],
  relations: readonly PublicRelation[] = []
): CanonicalRevisionView => ({
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
      slug: "legacy-time",
      title: "Legacy numeric time",
      kind: "calendar",
      definition_version: "m4-d",
      definition: {}
    }
  ],
  canonTimeSystems: [
    { id: "canon-time", canon_id: "canon", time_system_id: "time" }
  ],
  events,
  temporalPlacements,
  relations,
  narratives: []
});

describe("M4-D temporal characterization", () => {
  it("treats calendar precision as opaque metadata over numeric ranges", () => {
    const source = view(
      [event("year"), event("month"), event("day"), event("millisecond")],
      [
        placement("p-year", "year", 220, 221, "year", "0220"),
        placement("p-month", "month", 196907, 196908, "month", "1969-07"),
        placement("p-day", "day", 19690720, 19690721, "day", "1969-07-20"),
        placement(
          "p-ms",
          "millisecond",
          1788596001123,
          1788596001124,
          "millisecond",
          "2026-09-05T08:13:21.123Z"
        )
      ]
    );

    const result = projectTimeline(source, 28, {
      canonId: "canon",
      timeSystemId: "time"
    });

    expect(
      result.items.map((item) => ({
        event_id: item.event_id,
        placement_kind: item.placement_kind,
        range_start: item.range_start,
        range_end: item.range_end,
        display_label: item.display_label
      }))
    ).toEqual([
      {
        event_id: "year",
        placement_kind: "authored_coordinate",
        range_start: 220,
        range_end: 221,
        display_label: "0220"
      },
      {
        event_id: "month",
        placement_kind: "authored_coordinate",
        range_start: 196907,
        range_end: 196908,
        display_label: "1969-07"
      },
      {
        event_id: "day",
        placement_kind: "authored_coordinate",
        range_start: 19690720,
        range_end: 19690721,
        display_label: "1969-07-20"
      },
      {
        event_id: "millisecond",
        placement_kind: "authored_coordinate",
        range_start: 1788596001123,
        range_end: 1788596001124,
        display_label: "2026-09-05T08:13:21.123Z"
      }
    ]);
    expect(JSON.stringify(result.items)).not.toContain('"precision"');
    expect(result.semantic_digest).toBe(
      "208255f1576982f823b6f5c0778568b12dc7451488adeea49fe9395eeeb8fca3"
    );
  });

  it("records that adjacent epoch picoseconds collapse in the numeric coordinate model", () => {
    const lowerCoordinate = "1788596001123456789012";
    const upperCoordinate = "1788596001123456789013";
    const lower = Number(lowerCoordinate);
    const upper = Number(upperCoordinate);

    expect(lower).toBe(upper);

    const result = projectTimeline(
      view(
        [event("picosecond")],
        [
          placement(
            "p-ps",
            "picosecond",
            lower,
            upper,
            "picosecond",
            "2026-09-05T08:13:21.123456789012Z–2026-09-05T08:13:21.123456789013Z"
          )
        ]
      ),
      28,
      { canonId: "canon", timeSystemId: "time" }
    );

    expect(result.items[0]).toMatchObject({
      event_id: "picosecond",
      range_start: lower,
      range_end: lower
    });
    expect(result.semantic_digest).toBe(
      "2595a59595dd672181dccd9d5af2654599e280471f5a6f8d66aaa32f272f9cd4"
    );
  });

  it("preserves relative-only order without inventing absolute coordinates", () => {
    const result = projectTimeline(
      view(
        [event("relative-a"), event("relative-b")],
        [
          // Deliberately empty: the current structural projection needs no Placement.
        ],
        [relation("before", "precedes", "relative-a", "relative-b")]
      ),
      28,
      { canonId: "canon", timeSystemId: "time" }
    );

    expect(result.items).toMatchObject([
      {
        event_id: "relative-a",
        placement_kind: "structural_order",
        range_start: null,
        range_end: null,
        structural_rank: 0
      },
      {
        event_id: "relative-b",
        placement_kind: "structural_order",
        range_start: null,
        range_end: null,
        structural_rank: 1
      }
    ]);
    expect(result.semantic_digest).toBe(
      "a1d44f6b9086dce50408a17edf68dc0ac5109a1fb8e7a8e61b5b353a654393f9"
    );
  });

  it("reports a precedes cycle only as a projection diagnostic", () => {
    const result = projectTimeline(
      view(
        [event("cycle-a"), event("cycle-b")],
        [],
        [
          relation("a-before-b", "precedes", "cycle-a", "cycle-b"),
          relation("b-before-a", "precedes", "cycle-b", "cycle-a")
        ]
      ),
      28,
      { canonId: "canon", timeSystemId: "time" }
    );

    expect(result).toMatchObject({
      completeness: "partial",
      diagnostics: [
        { code: "timeline_cycle", affected_ids: ["cycle-a", "cycle-b"] }
      ]
    });
    expect(result.semantic_digest).toBe(
      "2a311e832284b8c8dd2a436d4f2cfaa06a4e84e32399dea630bbaf4559e3d325"
    );
  });

  it("uses descendant span as Process duration and excludes a during-only event", () => {
    const events = [
      event("process", { kind: "composite", roles: ["process"] }),
      event("child-start"),
      event("child-end"),
      event("explicit-start"),
      event("explicit-end"),
      event("during-only")
    ];
    const placements = [
      placement("p-child-start", "child-start", 10, 10, "step"),
      placement("p-child-end", "child-end", 20, 20, "step"),
      placement("p-explicit-start", "explicit-start", 0, 0, "step"),
      placement("p-explicit-end", "explicit-end", 30, 30, "step"),
      placement("p-during", "during-only", 15, 15, "step")
    ];
    const relations = [
      relation("contains-start", "contains", "process", "child-start"),
      relation("contains-end", "contains", "process", "child-end"),
      relation("child-order", "precedes", "child-start", "child-end"),
      relation("explicit-starts", "starts", "explicit-start", "process"),
      relation("explicit-ends", "ends", "explicit-end", "process")
    ];

    const result = projectProcesses(
      view(events, placements, relations),
      28
    )[0]!;

    expect(result).toMatchObject({
      descendant_event_ids: ["child-end", "child-start"],
      start_event_ids: ["child-start"],
      end_event_ids: ["child-end"],
      durations: [
        {
          start_earliest: 10,
          end_latest: 20,
          minimum: 10,
          maximum: 10,
          kind: "exact",
          evidence_ids: ["p-child-end", "p-child-start"]
        }
      ]
    });
    expect(result.descendant_event_ids).not.toContain("during-only");
    expect(result.evidence).not.toContain("explicit-starts");
    expect(result.evidence).not.toContain("explicit-ends");
    expect(result.semantic_digest).toBe(
      "346c32d594200419142443f9ea4d598007cdda64937cc811f9cf4ed6c50aaf33"
    );
  });

  it("derives membership State duration from numeric boundary Event Placements", () => {
    const events = [
      event("member-start"),
      event("member-end"),
      event("membership", {
        kind: "composite",
        roles: ["state", "state:membership"],
        attributes: { state_value: "guild" }
      })
    ];
    const placements = [
      placement("p-member-start", "member-start", 100, 100, "step"),
      placement("p-member-end", "member-end", 105, 105, "step")
    ];
    const relations = [
      relation("identity", "identity_continues", "member-start", "member-end"),
      relation("state-start", "starts", "member-start", "membership"),
      relation("state-end", "ends", "member-end", "membership")
    ];

    const result = projectStates(view(events, placements, relations), 28)[0]!;

    expect(result.items[0]).toMatchObject({
      state_event_id: "membership",
      start_event_id: "member-start",
      end_event_id: "member-end",
      start_earliest: 100,
      end_latest: 105,
      duration: { minimum: 5, maximum: 5, kind: "exact" },
      completeness: "complete"
    });
    expect(result.semantic_digest).toBe(
      "ba18757afc8370df6599397c5521afa4f2e45f617bc11d6473751c15d62d38ca"
    );
  });
});
