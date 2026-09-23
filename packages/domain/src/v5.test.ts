import { describe, expect, it } from "vitest";
import { applyV5Operations } from "./v5-operations.js";
import type {
  CanonicalState,
  Event,
  Narrative,
  Relation
} from "@moirai/contracts/v5";
import { assertV5CanonicalState, compositeChildCounts } from "./v5.js";

const event = (id: string, world_id = "history"): Event => ({
  id,
  world_id,
  slug: null,
  title: id,
  summary: null,
  roles: [],
  attributes: {}
});
const narrative = (
  id: string,
  scope_type: "event" | "collection" = "event",
  world_id = "history"
): Narrative => ({
  id: `n-${id}`,
  world_id,
  scope_type,
  scope_id: id,
  locale: "ko",
  title: null,
  body: `Account of ${id}`,
  notes: [],
  public_references: []
});
const relation = (
  id: string,
  source: string,
  target: string,
  type: Relation["type"] = "contains"
): Relation => ({
  id,
  world_id: "history",
  type,
  source_ref: { kind: "event", event_id: source },
  target_ref: { kind: "event", event_id: target },
  direction: type === "coincides" ? "undirected" : "directed",
  attributes: {}
});
function fixture(): CanonicalState {
  return {
    world: {
      id: "history",
      slug: "history",
      title: "실제 세계사",
      description: null
    },
    events: [
      event("danjong-process"),
      event("coup"),
      event("abdication"),
      event("imjin-war"),
      event("naval-battle"),
      event("sengoku")
    ],
    collections: [
      {
        id: "joseon",
        world_id: "history",
        slug: "joseon",
        title: "조선 전기",
        description: null
      },
      {
        id: "danjong",
        world_id: "history",
        slug: "danjong",
        title: "단종 폐위",
        description: null
      }
    ],
    eventCollectionMemberships: [
      { event_id: "coup", collection_id: "joseon" },
      { event_id: "coup", collection_id: "danjong" },
      { event_id: "danjong-process", collection_id: "danjong" }
    ],
    relations: [
      relation("r1", "danjong-process", "coup"),
      relation("r2", "danjong-process", "abdication"),
      relation("r3", "imjin-war", "naval-battle")
    ],
    narratives: [
      "danjong-process",
      "coup",
      "abdication",
      "imjin-war",
      "naval-battle",
      "sengoku"
    ]
      .map((id) => narrative(id))
      .concat([
        narrative("joseon", "collection"),
        narrative("danjong", "collection")
      ]),
    timeSystems: [],
    collectionTimeSystems: []
  };
}

describe("v5 World final-state invariants", () => {
  it("shares one Event and Narrative across selections; zero membership is valid", () => {
    const state = fixture();
    expect(() => assertV5CanonicalState(state)).not.toThrow();
    expect(state.events.filter((e) => e.id === "coup")).toHaveLength(1);
    expect(state.narratives.filter((n) => n.scope_id === "coup")).toHaveLength(
      1
    );
    expect(() =>
      assertV5CanonicalState({
        ...state,
        collections: [],
        collectionTimeSystems: [],
        eventCollectionMemberships: [],
        narratives: state.narratives.filter((n) => n.scope_type === "event")
      })
    ).not.toThrow();
  });
  it("derives composition from World facts independently of selection and counts unique children", () => {
    const state = fixture();
    const counts = compositeChildCounts([
      ...state.relations,
      relation("duplicate-assertion", "danjong-process", "coup")
    ]);
    expect(counts.get("danjong-process")).toBe(2);
    expect(counts.has("danjong")).toBe(false);
    expect(counts.get("imjin-war")).toBe(1);
  });
  it("rejects contains cycles across Collection boundaries", () => {
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        relations: [
          ...state.relations,
          relation("cycle", "coup", "danjong-process")
        ]
      })
    ).toThrow("containment cycle");
  });
  it("rejects temporal contradictions in the World union", () => {
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        relations: [
          ...state.relations,
          relation("p1", "coup", "abdication", "precedes"),
          relation("p2", "abdication", "coup", "not_after")
        ]
      })
    ).toThrow();
  });
  it("keeps actual history, Romance and MCU separate while permitting compatible definitions", () => {
    for (const [worldId, title] of [
      ["history", "실제 세계사"],
      ["romance", "삼국지연의"],
      ["mcu", "MCU"]
    ]) {
      const base = fixture();
      const state: CanonicalState = {
        ...base,
        world: { ...base.world, id: worldId!, title: title! },
        collections: base.collections.map((c) => ({
          ...c,
          world_id: worldId!
        })),
        events: base.events.map((e) => ({ ...e, world_id: worldId! })),
        relations: base.relations.map((r) => ({ ...r, world_id: worldId! })),
        narratives: base.narratives.map((n) => ({ ...n, world_id: worldId! })),
        timeSystems: [
          {
            id: `time-${worldId}`,
            world_id: worldId!,
            slug: "relative",
            title: "Compatible scalar",
            kind: "relative",
            definition_version: "1",
            definition: {
              coordinate_codec: "continuous-decimal-v1",
              unit: "year",
              direction: "ascending",
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
      // No Collection-TimeSystem link is needed to validate a World time fact.
      const anchor: Relation = {
        ...relation("anchor", "coup", "abdication", "not_after"),
        world_id: worldId!,
        source_ref: {
          kind: "time_event",
          time_system_ref: { time_system_id: `time-${worldId}` },
          definition_version: "1",
          coordinate: "0"
        }
      };
      expect(() =>
        assertV5CanonicalState({
          ...state,
          relations: [...state.relations, anchor]
        })
      ).not.toThrow();
    }
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        events: [...state.events, event("fictional", "mcu")]
      })
    ).toThrow("world scope mismatch");
  });
  it("requires one Narrative per owner and preserves it when selection changes", () => {
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        narratives: state.narratives.filter((n) => n.scope_id !== "coup")
      })
    ).toThrow("owner narrative required");
    expect(() =>
      assertV5CanonicalState({
        ...state,
        narratives: [
          ...state.narratives,
          { ...narrative("coup"), id: "another-id" }
        ]
      })
    ).toThrow("duplicate owner narrative");
    expect(() =>
      assertV5CanonicalState({ ...state, eventCollectionMemberships: [] })
    ).not.toThrow();
  });
  it("rejects an Event withdrawal that leaves active dependent facts or a Narrative", () => {
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        events: state.events.filter((e) => e.id !== "coup")
      })
    ).toThrow("dangling");
  });
  it("rejects old ownership/type/applicability payloads instead of treating them as v5", () => {
    const state = fixture();
    expect(() =>
      assertV5CanonicalState({
        ...state,
        events: state.events.map((e) => ({ ...e, kind: "atomic" }))
      })
    ).toThrow("legacy event semantics");
    expect(() =>
      assertV5CanonicalState({
        ...state,
        relations: state.relations.map((r) => ({
          ...r,
          canon_memberships: ["joseon"]
        }))
      })
    ).toThrow("relation selection is not applicability");
    expect(() =>
      assertV5CanonicalState({
        ...state,
        narratives: state.narratives.map((n) => ({ ...n, canon_id: "joseon" }))
      })
    ).toThrow("legacy narrative semantics");
  });
  it("validates a deep 10k-event World without recursive containment traversal", () => {
    const state = fixture();
    const events = Array.from({ length: 10_000 }, (_, i) => event(`e${i}`));
    const relations = events
      .slice(1)
      .map((e, i) => relation(`r${i}`, `e${i}`, e.id));
    expect(() =>
      assertV5CanonicalState({
        ...state,
        collections: [],
        eventCollectionMemberships: [],
        events,
        relations,
        narratives: events.map((e) => narrative(e.id))
      })
    ).not.toThrow();
  });
});

describe("v5 atomic candidate operations", () => {
  const origin_refs = [{ field: "*", origin_index: 0 }];
  it("withdraws a Collection without withdrawing its Events, Relations or Event Narratives", () => {
    const state = fixture();
    const before = JSON.stringify(state);
    const next = applyV5Operations(state, "history", [
      {
        kind: "withdraw",
        entity_type: "collection",
        entity_id: "danjong",
        origin_refs
      }
    ]);
    expect(next.events).toEqual(state.events);
    expect(next.relations).toEqual(state.relations);
    expect(next.narratives.filter((n) => n.scope_type === "event")).toEqual(
      state.narratives.filter((n) => n.scope_type === "event")
    );
    expect(
      next.eventCollectionMemberships.some((m) => m.collection_id === "danjong")
    ).toBe(false);
    expect(next.narratives.some((n) => n.scope_id === "danjong")).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("rejects incomplete creation atomically but accepts an Event and its Narrative together", () => {
    const state = fixture();
    const { id: eventId, ...eventValue } = event("new-event");
    const { id: narrativeId, ...narrativeValue } = narrative("new-event");
    const create = {
      kind: "create" as const,
      entity_type: "event" as const,
      entity_id: eventId,
      origin_refs,
      value: eventValue
    };
    expect(() => applyV5Operations(state, "history", [create])).toThrow(
      "owner narrative required"
    );
    expect(state.events.some((e) => e.id === eventId)).toBe(false);
    const next = applyV5Operations(state, "history", [
      create,
      {
        kind: "create",
        entity_type: "narrative",
        entity_id: narrativeId,
        origin_refs,
        value: narrativeValue
      }
    ]);
    expect(next.events).toHaveLength(state.events.length + 1);
    expect(next.eventCollectionMemberships).toEqual(
      state.eventCollectionMemberships
    );
  });
  it("requires explicit cleanup for Event withdrawal and forbids Narrative owner reassignment", () => {
    const state = fixture();
    expect(() =>
      applyV5Operations(state, "history", [
        {
          kind: "withdraw",
          entity_type: "event",
          entity_id: "sengoku",
          origin_refs
        }
      ])
    ).toThrow("dangling narrative owner");
    const next = applyV5Operations(state, "history", [
      {
        kind: "withdraw",
        entity_type: "narrative",
        entity_id: "n-sengoku",
        origin_refs
      },
      {
        kind: "withdraw",
        entity_type: "event",
        entity_id: "sengoku",
        origin_refs
      }
    ]);
    expect(next.events).toHaveLength(state.events.length - 1);
    const { id, ...value } = narrative("coup");
    expect(() =>
      applyV5Operations(state, "history", [
        {
          kind: "update",
          entity_type: "narrative",
          entity_id: id,
          origin_refs,
          value: { ...value, scope_id: "abdication" }
        }
      ])
    ).toThrow("immutable narrative owner");
  });
});
