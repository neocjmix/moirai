import { describe, expect, it } from "vitest";
import { applyV5Operations } from "../packages/domain/src/v5-operations.js";
import type { CanonicalState } from "../packages/contracts/src/v5.js";
import {
  corpusBatch,
  worldId,
  calendarId,
  themes
} from "./a5-discovery-corpus.js";

describe("authorized A5 operational synthetic corpus", () => {
  it("validates every bounded batch, unique ownership, shared identity and chronology", () => {
    let state: CanonicalState = {
      world: {
        id: worldId,
        slug: "fixture",
        title: "fixture",
        description: null
      },
      collections: [],
      collectionTimeSystems: [],
      events: [],
      relations: [],
      narratives: [],
      eventCollectionMemberships: [],
      timeSystems: [
        {
          id: calendarId,
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
      ]
    };
    for (let group = 0; group < themes.length; group++) {
      const operations = corpusBatch(group);
      expect(operations.length).toBeLessThan(500);
      state = applyV5Operations(state, worldId, operations);
    }
    expect(state.collections).toHaveLength(24);
    expect(state.events).toHaveLength(552);
    expect(state.narratives).toHaveLength(576);
    expect(state.relations).toHaveLength(1008);
    expect(state.eventCollectionMemberships.length).toBeGreaterThan(650);
    expect(new Set(state.events.map((e) => e.id)).size).toBe(552);
    expect(corpusBatch(0)).toEqual(corpusBatch(0));
  });
});
