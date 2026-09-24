import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "@moirai/projections";
import { buildV5WorldLayout } from "./v5-world-layout.js";
import { buildV5SpatialIndex } from "./v5-spatial-index.js";

const worldId = "world-1";
const systemId = "gregorian";
const time = (year: number) => ({
  kind: "time_event" as const,
  time_system_ref: { time_system_id: systemId },
  definition_version: "1",
  coordinate: `${year}-01-01T00:00:00.000000000000Z`
});
const event = (id: string) => ({
  id,
  world_id: worldId,
  slug: null,
  title: id,
  summary: null,
  roles: [],
  attributes: {}
});
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: ["joseon", "japan"].map((id) => ({
    id,
    world_id: worldId,
    slug: id,
    title: id,
    description: null
  })),
  events: [
    event("process"),
    event("coup"),
    event("abdication"),
    event("unresolved")
  ],
  eventCollectionMemberships: [
    { event_id: "coup", collection_id: "joseon" },
    { event_id: "coup", collection_id: "japan" },
    { event_id: "process", collection_id: "joseon" }
  ],
  relations: [
    {
      id: "contains",
      world_id: worldId,
      type: "contains",
      direction: "directed",
      source_ref: { kind: "event", event_id: "process" },
      target_ref: { kind: "event", event_id: "coup" },
      attributes: {}
    },
    {
      id: "order",
      world_id: worldId,
      type: "precedes",
      direction: "directed",
      source_ref: { kind: "event", event_id: "coup" },
      target_ref: { kind: "event", event_id: "abdication" },
      attributes: {}
    },
    {
      id: "cause",
      world_id: worldId,
      type: "causes",
      direction: "directed",
      source_ref: { kind: "event", event_id: "coup" },
      target_ref: { kind: "event", event_id: "abdication" },
      attributes: {}
    },
    {
      id: "at-1453",
      world_id: worldId,
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "coup" },
      target_ref: time(1453),
      attributes: {}
    },
    {
      id: "at-1455",
      world_id: worldId,
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "abdication" },
      target_ref: time(1455),
      attributes: {}
    }
  ],
  narratives: [
    ...["process", "coup", "abdication", "unresolved"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "World account",
      public_references: [],
      notes: []
    })),
    ...["joseon", "japan"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Selection introduction",
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [
    {
      id: systemId,
      world_id: worldId,
      slug: "gregorian",
      title: "Gregorian",
      kind: "calendar",
      definition_version: "1",
      definition: {
        coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
        calendar: "proleptic-gregorian",
        timezone: "UTC",
        fractional_digits: 12,
        leap_second_policy: "reject",
        interval_policy: "half-open",
        capabilities: [
          "canonicalize",
          "equality",
          "compare",
          "boundary",
          "difference"
        ]
      }
    }
  ],
  collectionTimeSystems: []
};

describe("offline v5 World-owned geometry", () => {
  it("keeps a one-sided temporal bound unplaced rather than indexing infinity", () => {
    const oneSided: CanonicalState = {
      ...state,
      events: [...state.events, event("before")],
      relations: [
        ...state.relations,
        {
          id: "before-1453",
          world_id: worldId,
          type: "not_after",
          direction: "directed",
          source_ref: { kind: "event", event_id: "before" },
          target_ref: time(1453),
          attributes: {}
        }
      ],
      narratives: [
        ...state.narratives,
        {
          id: "n-before",
          world_id: worldId,
          scope_type: "event",
          scope_id: "before",
          locale: "ko",
          title: null,
          body: "Uncertain earlier event",
          public_references: [],
          notes: []
        }
      ]
    };
    const layout = buildV5WorldLayout(
      oneSided,
      projectV5WorldTemporal(oneSided, 31),
      systemId
    );
    expect(layout.unplaced_event_ids).toContain("before");
    expect(() => buildV5SpatialIndex(layout)).not.toThrow();
  });
  it("preserves shared Event coordinates when Collections toggle", () => {
    const temporal = projectV5WorldTemporal(state, 31);
    const layout = buildV5WorldLayout(state, temporal, systemId);
    const noCollection: CanonicalState = {
      ...state,
      collections: [],
      collectionTimeSystems: [],
      eventCollectionMemberships: [],
      narratives: state.narratives.filter((item) => item.scope_type === "event")
    };
    expect(
      buildV5WorldLayout(
        noCollection,
        projectV5WorldTemporal(noCollection, 31),
        systemId
      )
    ).toEqual(layout);
    const reversed = {
      ...state,
      events: [...state.events].reverse(),
      relations: [...state.relations].reverse()
    };
    expect(
      buildV5WorldLayout(
        reversed,
        projectV5WorldTemporal(reversed, 31),
        systemId
      )
    ).toEqual(layout);
    const coup = layout.shapes.find((item) => item.event_id === "coup");
    const abdication = layout.shapes.find(
      (item) => item.event_id === "abdication"
    );
    expect(coup?.kind).toBe("point");
    expect(abdication?.kind).toBe("point");
    if (coup?.kind !== "point" || abdication?.kind !== "point")
      throw Error("missing point");
    expect(coup.position.y).toBeLessThan(abdication.position.y);
    expect(
      layout.shapes.filter((item) => item.event_id === "coup")
    ).toHaveLength(1);
    expect(layout.shapes).toHaveLength(3);
    expect(
      layout.shapes.find((item) => item.event_id === "process")?.kind
    ).toBe("region");
    expect(layout.unplaced_event_ids).toContain("unresolved");
    expect(JSON.stringify(layout)).not.toContain("canon_id");
  });
});
