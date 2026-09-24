import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { rehearseV5Publication } from "./ip011-v5-publication-rehearsal.js";

const state: CanonicalState = {
  world: {
    id: "world-1",
    slug: "history",
    title: "Actual history",
    description: null
  },
  collections: ["joseon", "japan"].map((id) => ({
    id,
    world_id: "world-1",
    slug: id,
    title: id,
    description: null
  })),
  events: ["shared", "undated"].map((id) => ({
    id,
    world_id: "world-1",
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: ["joseon", "japan"].map((collection_id) => ({
    event_id: "shared",
    collection_id
  })),
  relations: [
    {
      id: "date",
      world_id: "world-1",
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: "shared" },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: "gregorian" },
        definition_version: "1",
        coordinate: "1453-01-01T00:00:00.000000000000Z"
      },
      attributes: {}
    }
  ],
  narratives: [
    ...["shared", "undated"].map((id) => ({
      id: `n-${id}`,
      world_id: "world-1",
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: id,
      public_references: [],
      notes: []
    })),
    ...["joseon", "japan"].map((id) => ({
      id: `n-${id}`,
      world_id: "world-1",
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: id,
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [
    {
      id: "gregorian",
      world_id: "world-1",
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

describe("isolated v5 Publication rehearsal", () => {
  it("round-trips exact shared selection over a digest tree without producing a pointer", async () => {
    const result = await rehearseV5Publication(state, 31);
    expect(result).toMatchObject({
      operation: "ip011_v5_publication_rehearsal",
      world_id: "world-1",
      revision: 31,
      pointer_written: false,
      placed: 1,
      unplaced: 1,
      viewport_pages: 2
    });
    expect(result.max_object_reads).toBeLessThanOrEqual(256);
    expect(result.tree_bytes).toBeGreaterThan(0);
  });
});
