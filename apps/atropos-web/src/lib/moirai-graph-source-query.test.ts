import { describe, expect, it } from "vitest";

import { MOIRAI_GRAPH_RELATION_TYPES } from "@moirai/contracts";

import {
  MOCK_GRAPH_SOURCE_CATALOG,
  GRAPH_RELATION_FAMILIES,
  buildGraphUrlSearch,
  createDefaultGraphUrlState,
  focusGraphEntity,
  getGraphSourceCompatibility,
  graphDiagnostics,
  parseGraphUrlState,
  replaceGraphSources,
  searchGraphEntities,
  searchGraphRelations
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

describe("M4.5-D2 R1 Relation and diagnostics query", () => {
  it("returns a shared Relation once with matched and complete memberships", () => {
    const relations = searchGraphRelations(createDefaultGraphUrlState());
    const shared = relations.filter(
      (relation) => relation.id === "relation:observatory-shared-influences"
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]!.matchedCanonIds).toEqual([
      "canon:recorded-history",
      "canon:archival-observations"
    ]);
    expect(shared[0]!.canonMemberships).toEqual(shared[0]!.matchedCanonIds);
  });

  it("selects distinct K1 causes and K2 prevents assertions by membership", () => {
    const initial = createDefaultGraphUrlState();
    const selectCanon = (canonId: string) =>
      replaceGraphSources(
        initial,
        initial.query.temporal_frame.target,
        initial.query.sources.map((source) =>
          source.world_id === "world:reality-observatory"
            ? { ...source, canon_ids: [canonId] }
            : source
        )
      );

    expect(
      searchGraphRelations(selectCanon("canon:recorded-history")).map(
        (relation) => relation.type
      )
    ).toContain("causes");
    expect(
      searchGraphRelations(selectCanon("canon:recorded-history")).map(
        (relation) => relation.type
      )
    ).not.toContain("prevents");
    expect(
      searchGraphRelations(selectCanon("canon:archival-observations")).map(
        (relation) => relation.type
      )
    ).toContain("prevents");
  });

  it("addresses every Relation type through exactly one family", () => {
    const familyTypes = Object.values(GRAPH_RELATION_FAMILIES).flat();
    expect(new Set(familyTypes)).toEqual(new Set(MOIRAI_GRAPH_RELATION_TYPES));
    expect(familyTypes).toHaveLength(MOIRAI_GRAPH_RELATION_TYPES.length);
  });

  it("keeps endpoint and Time System evidence and treats contradiction as valid knowledge", () => {
    const state = createDefaultGraphUrlState();
    expect(
      searchGraphRelations(state).every(
        (relation) =>
          relation.endpointEvidence.length > 0 &&
          relation.timeSystemEvidence.length > 0
      )
    ).toBe(true);
    expect(
      graphDiagnostics(state).find(
        (diagnostic) => diagnostic.code === "contradiction"
      )
    ).toMatchObject({
      severity: "knowledge",
      invalid: false
    });
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
