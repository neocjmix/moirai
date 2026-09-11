import { describe, expect, it } from "vitest";

import {
  MOCK_GRAPH_SOURCE_CATALOG,
  buildGraphUrlSearch,
  createDefaultGraphUrlState,
  focusGraphEntity,
  getGraphSourceCompatibility,
  parseGraphUrlState,
  replaceGraphSources,
  searchGraphEntities
} from "./moirai-graph-source-query.js";

describe("M4.5-C Moirai graph source query", () => {
  it("selects two natively compatible Worlds and preserves their three Canons and revisions", () => {
    const state = createDefaultGraphUrlState();

    expect(state.query.sources.map((source) => source.world_id)).toEqual([
      "world:reality-observatory",
      "world:marvel-cinematic"
    ]);
    expect(
      state.query.sources.flatMap((source) => source.canon_ids)
    ).toHaveLength(3);
    expect(state.query.sources.map((source) => source.served_revision)).toEqual(
      [7, 42]
    );
  });

  it("does not infer compatibility for a different adapter and comparison domain", () => {
    const [frame] = MOCK_GRAPH_SOURCE_CATALOG.frames;
    const incompatibleWorld = MOCK_GRAPH_SOURCE_CATALOG.worlds[2]!;

    expect(
      getGraphSourceCompatibility(incompatibleWorld.timeSystem, frame!.target)
    ).toEqual({
      compatible: false,
      status: "incompatible",
      reasonCode: "adapter_identity_or_domain_mismatch"
    });
  });

  it("round-trips the versioned source set through a shareable URL", () => {
    const state = createDefaultGraphUrlState();
    const search = buildGraphUrlSearch("?screen=graph", state);

    expect(parseGraphUrlState(search)).toEqual(state);
    expect(new URLSearchParams(search).get("screen")).toBe("graph");
  });

  it("rejects stale served revisions instead of silently upgrading them", () => {
    const state = createDefaultGraphUrlState();
    const stale = {
      ...state,
      query: {
        ...state.query,
        sources: [
          { ...state.query.sources[0]!, served_revision: 8 },
          ...state.query.sources.slice(1)
        ]
      }
    };

    expect(parseGraphUrlState(buildGraphUrlSearch("", stale))).toBeNull();
  });

  it("changes temporal frame only with an explicit replacement source set", () => {
    const state = createDefaultGraphUrlState();
    const nextFrame = MOCK_GRAPH_SOURCE_CATALOG.frames[1]!;
    const nextWorld = MOCK_GRAPH_SOURCE_CATALOG.worlds[2]!;
    const next = replaceGraphSources(state, nextFrame.target, [
      {
        world_id: nextWorld.id,
        served_revision: nextWorld.servedRevision,
        canon_ids: [nextWorld.canons[0]!.id],
        time_systems: [nextWorld.timeSystem]
      }
    ]);

    expect(next.query.temporal_frame.target).toEqual(nextFrame.target);
    expect(next.query.sources.map((source) => source.world_id)).toEqual([
      nextWorld.id
    ]);
    expect(next.query.sources[0]!.served_revision).toBe(19);
  });
});

describe("M4.5-D1 identity-aware entity search", () => {
  it("returns each shared Event identity once with matched and complete Canon memberships", () => {
    const results = searchGraphEntities(createDefaultGraphUrlState());
    const shared = results.filter((entity) =>
      ["event:observatory-a", "event:observatory-b"].includes(entity.identity)
    );

    expect(shared.map((entity) => entity.identity)).toEqual([
      "event:observatory-a",
      "event:observatory-b"
    ]);
    expect(shared[0]!.matchedCanonIds).toEqual([
      "canon:recorded-history",
      "canon:archival-observations"
    ]);
    expect(shared[0]!.canonMemberships).toEqual(shared[0]!.matchedCanonIds);
  });

  it("treats a Canon filter as membership matching instead of ownership partitioning", () => {
    const initial = createDefaultGraphUrlState();
    const state = replaceGraphSources(
      initial,
      initial.query.temporal_frame.target,
      initial.query.sources.map((source) =>
        source.world_id === "world:reality-observatory"
          ? { ...source, canon_ids: ["canon:archival-observations"] }
          : source
      )
    );
    const eventA = searchGraphEntities(state).find(
      (entity) => entity.identity === "event:observatory-a"
    );

    expect(eventA?.matchedCanonIds).toEqual(["canon:archival-observations"]);
    expect(eventA?.canonMemberships).toEqual([
      "canon:recorded-history",
      "canon:archival-observations"
    ]);
  });

  it("round-trips focus and selection without losing entity filters", () => {
    const initial = createDefaultGraphUrlState();
    const eventA = searchGraphEntities(initial).find(
      (entity) => entity.identity === "event:observatory-a"
    )!;
    const focused = focusGraphEntity(initial, eventA.reference);
    const restored = parseGraphUrlState(buildGraphUrlSearch("", focused));

    expect(restored).toEqual(focused);
    expect(restored?.query.scope.kind).toBe("selection");
    expect(restored?.focus).toEqual(eventA.reference);
  });

  it("fails closed on a malformed public focus reference", () => {
    const initial = createDefaultGraphUrlState();
    const malformed = {
      ...initial,
      focus: {
        kind: "event",
        world_id: "world:reality-observatory",
        canon_id: "canon:recorded-history",
        served_revision: 7
      }
    };

    expect(
      parseGraphUrlState(buildGraphUrlSearch("", malformed as never))
    ).toBeNull();
  });

  it("never synthesizes persisted search results from virtual Time Events", () => {
    const state = createDefaultGraphUrlState();
    expect(state.query.entity_filter.include_virtual_time_events).toBe(true);
    expect(
      searchGraphEntities(state).every(
        (entity) => !entity.identity.startsWith("time_event:")
      )
    ).toBe(true);
  });
});
