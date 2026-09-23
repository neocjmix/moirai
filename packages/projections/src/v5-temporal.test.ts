import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "./v5-temporal.js";

const worldId = "w";
const event = (id: string) => ({
  id,
  world_id: worldId,
  slug: null,
  title: id,
  summary: null,
  roles: [],
  attributes: {}
});
const narrative = (
  id: string,
  scope_type: "event" | "collection" = "event"
) => ({
  id: `n-${id}`,
  world_id: worldId,
  scope_type,
  scope_id: id,
  locale: "ko",
  title: null,
  body: `Public account of ${id}`,
  public_references: [],
  notes: []
});
const relation = (
  id: string,
  source: string,
  target: string,
  type: "contains" | "precedes"
) => ({
  id,
  world_id: worldId,
  type,
  source_ref: { kind: "event" as const, event_id: source },
  target_ref: { kind: "event" as const, event_id: target },
  direction: "directed" as const,
  attributes: {}
});
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "실제 세계사",
    description: null
  },
  collections: [
    {
      id: "selection",
      world_id: worldId,
      slug: "selection",
      title: "단종 폐위",
      description: null
    }
  ],
  events: [event("process"), event("coup"), event("abdication")],
  eventCollectionMemberships: [
    { event_id: "coup", collection_id: "selection" }
  ],
  relations: [
    relation("part1", "process", "coup", "contains"),
    relation("part2", "process", "abdication", "contains"),
    relation("order", "coup", "abdication", "precedes")
  ],
  narratives: [
    narrative("process"),
    narrative("coup"),
    narrative("abdication"),
    narrative("selection", "collection")
  ],
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive World temporal adapter", () => {
  it("derives Composite from the entire World and removes every synthetic Canon field", () => {
    const result = projectV5WorldTemporal(state, 31);
    expect(
      result.positions.map((position) => position.event_id).sort()
    ).toEqual(["abdication", "coup", "process"]);
    expect(result.composites).toHaveLength(1);
    expect(result.composites[0]).toMatchObject({
      event_id: "process",
      descendant_event_ids: ["abdication", "coup"]
    });
    expect(result.relations).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("canon_id");
    expect(JSON.stringify(result)).not.toContain("canon_memberships");
    expect(JSON.stringify(result)).not.toContain(
      "internal-world-temporal-scope"
    );
  });
  it("keeps time and digest invariant when a Collection is toggled or retired", () => {
    const first = projectV5WorldTemporal(state, 31);
    const noSelection = projectV5WorldTemporal(
      {
        ...state,
        collections: [],
        eventCollectionMemberships: [],
        narratives: state.narratives.filter(
          (item) => item.scope_type === "event"
        )
      },
      31
    );
    expect(noSelection).toEqual(first);
    expect(
      projectV5WorldTemporal(
        {
          ...state,
          events: [...state.events].reverse(),
          relations: [...state.relations].reverse()
        },
        31
      )
    ).toEqual(first);
  });
});
