import { beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_FIXTURE as ids } from "@moirai/contracts/testing";
import type { CanonicalRevisionView } from "@moirai/projections";
import { buildPublicationArtifacts } from "@moirai/publication";
import { buildSpatialArtifacts } from "@moirai/graph-presentation/server";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import { presentationNodeId } from "@moirai/graph-presentation";
const store = vi.hoisted(() => new Map<string, string>());
const current = vi.hoisted(() => ({ observation: null as unknown }));
vi.mock("./publication", async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>("./publication");
  return {
    ...actual,
    readPublicationObject: vi.fn(async (key: string) => ({
      status: store.has(key) ? 200 : 404,
      body: store.get(key) ?? null
    })),
    readPublishedWorlds: async () => [current.observation]
  };
});
import {
  loadGraphPublicationSources,
  graphRevisionPins
} from "./graph-publication-loader";
import { createDefaultGraphUrlState } from "./moirai-graph-source-query";
import { graphSpatialQueryContext } from "./graph-spatial-query";
import { graphSpatialDetail } from "./graph-spatial-detail";
import { moiraiSpatialReader } from "./moirai-spatial";
import { graphSpatialBootstrap } from "./graph-spatial-bootstrap";
import { composeGraphPublicationQuery } from "./graph-publication-composer";
import { graphPresentationFromResult } from "./graph-query-presentation";
import { searchGraphEntities } from "./moirai-graph-source-query";
import { searchGraphReader } from "./graph-reader-search";
import { POST as readerSearch } from "../app/graph/search/route";
const k2 = "01995c2a-7b00-7000-8000-000000000020";
const view: CanonicalRevisionView = {
  world: {
    id: ids.worldId,
    title: "Runtime World",
    slug: "runtime",
    description: null
  },
  canons: [ids.canonId, k2].map((id) => ({
    id,
    world_id: ids.worldId,
    title: id,
    slug: id,
    description: null
  })),
  timeSystems: [],
  canonTimeSystems: [],
  events: [ids.eventId, ids.secondEventId, ids.thirdEventId].map((id, i) => ({
    id,
    world_id: ids.worldId,
    canon_memberships: [ids.canonId, k2],
    kind: "atomic",
    title: `revision 4 event ${i}`,
    slug: null,
    summary: null,
    roles: i === 0 ? ["signal"] : [],
    attributes: { lossless: "12345678901234567890" }
  })),
  relations: [
    {
      id: ids.causalRelationId,
      world_id: ids.worldId,
      canon_memberships: [ids.canonId, k2],
      type: "precedes",
      direction: "directed",
      source_ref: { kind: "event", event_id: ids.eventId },
      target_ref: { kind: "event", event_id: ids.secondEventId },
      attributes: { claim: "retained" }
    }
  ],
  eventCanonMemberships: [
    ids.eventId,
    ids.secondEventId,
    ids.thirdEventId
  ].flatMap((event_id) =>
    [ids.canonId, k2].map((canon_id) => ({ event_id, canon_id }))
  ),
  relationCanonMemberships: [ids.canonId, k2].map((canon_id) => ({
    relation_id: ids.causalRelationId,
    canon_id
  })),
  narratives: [ids.canonId, k2].map((canon_id, i) => ({
    id: `01995c2a-7b00-7000-8000-00000000003${i}`,
    canon_id,
    scope_type: "event" as const,
    scope_id: ids.eventId,
    locale: "ko",
    kind: "primary" as const,
    title: "사건 설명",
    body: i === 0 ? "선택한 Canon의 한국어 설명" : "다른 Canon의 설명",
    public_references: [
      { label: "역사 자료", url: "https://example.org/history" }
    ]
  }))
};
beforeAll(() => {
  for (const rev of [4, 5]) {
    const input = {
      ...view,
      events: view.events.map((e) => ({
        ...e,
        title: e.title.replace("revision 4", `revision ${rev}`)
      }))
    };
    const publication = buildPublicationArtifacts(
      input,
      rev,
      "2026-09-12T00:00:00Z"
    );
    const spatial = buildSpatialArtifacts(
      queryFromPublicationDocuments(
        publication.manifestBody,
        publication.documents
      )!,
      publication.manifestBody
    );
    for (const d of [
      ...publication.documents,
      ...spatial.documents,
      { key: publication.manifestKey, body: publication.manifestBody },
      { key: spatial.manifestKey, body: spatial.manifestBody }
    ])
      store.set(d.key, d.body);
    if (rev === 5)
      current.observation = {
        availability: "ready",
        worldId: ids.worldId,
        pointer: publication.pointer,
        world: view.world,
        canons: view.canons
      };
  }
});
describe("M4.6-E one revision across query, spatial and detail", () => {
  it("finds the existing Event by its selected-Canon Narrative without duplicate results", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    const initial = createDefaultGraphUrlState(loaded.catalog);
    const state = {
      ...initial,
      query: {
        ...initial.query,
        sources: initial.query.sources.map((s) => ({
          ...s,
          canon_ids: [ids.canonId]
        }))
      }
    };
    const result = composeGraphPublicationQuery(
      state.query,
      loaded.snapshots,
      loaded.failures
    );
    const entities = graphPresentationFromResult(result).entities;
    // Initial Graph input stays small: Event documents are fetched on search.
    expect(searchGraphEntities(state, "한국어 설명", entities)).toHaveLength(0);
    const response = await readerSearch(
      new Request("https://example.org/graph/search", {
        method: "POST",
        body: JSON.stringify({ state, term: "한국어 설명" })
      })
    );
    expect(response.status).toBe(200);
    const { matches, nextCursor } = await response.json();
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      identity: ids.eventId,
      kind: "event",
      matchedCanonIds: [ids.canonId]
    });
    expect(matches[0].reference).toMatchObject({
      canon_id: ids.canonId,
      served_revision: 4
    });
    expect(nextCursor).toBeNull();
    expect(
      (await searchGraphReader({ state, term: "다른 Canon의 설명" })).matches
    ).toHaveLength(0);
    expect(
      (
        await searchGraphReader({
          state: {
            ...state,
            query: {
              ...state.query,
              entity_filter: {
                ...state.query.entity_filter,
                include_narratives: false
              }
            }
          },
          term: "한국어 설명"
        })
      ).matches
    ).toHaveLength(0);
    const both = {
      ...state,
      query: { ...state.query, sources: initial.query.sources }
    };
    const different = await searchGraphReader({
      state: both,
      term: "다른 Canon의 설명"
    });
    expect(different.matches).toHaveLength(1);
    expect(different.matches[0]).toMatchObject({
      identity: ids.eventId,
      matchedCanonIds: [k2],
      reference: { canon_id: k2 }
    });
    const first = await searchGraphReader({
      state,
      term: "revision 4",
      limit: 1
    });
    const second = await searchGraphReader({
      state,
      term: "revision 4",
      limit: 1,
      cursor: first.nextCursor
    });
    expect(first.matches).toHaveLength(1);
    expect(second.matches).toHaveLength(1);
    expect(second.matches[0]!.identity).not.toBe(first.matches[0]!.identity);
    expect(
      (await searchGraphReader({ state, term: "revision 5" })).matches
    ).toHaveLength(0);
    const key = `worlds/${ids.worldId}/revisions/4/search/en.json`;
    const original = store.get(key)!;
    try {
      store.set(key, original + " ");
      await expect(
        searchGraphReader({ state, term: "한국어 설명" })
      ).rejects.toThrow("search_index_digest_mismatch");
    } finally {
      store.set(key, original);
    }
  });
  it("groups a shared Event's selected Canon narratives without merging their prose", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    const state = createDefaultGraphUrlState(loaded.catalog);
    const detail = await graphSpatialDetail(
      state,
      presentationNodeId(
        { world_id: ids.worldId, served_revision: 4, canon_id: ids.canonId },
        { kind: "event", event_id: ids.eventId }
      )
    );
    expect(detail.narrativeSections).toHaveLength(2);
    expect(detail.narrativeSections.map((section) => section.canonId)).toEqual([
      ids.canonId,
      k2
    ]);
    expect(detail.narrativeSections[0]!.narratives[0]!.body).toBe(
      "선택한 Canon의 한국어 설명"
    );
    expect(detail.narrativeSections[1]!.narratives[0]!.body).toBe(
      "다른 Canon의 설명"
    );
    expect(
      detail.narrativeSections[0]!.narratives[0]!.publicReferences
    ).toContainEqual({
      label: "역사 자료",
      url: "https://example.org/history"
    });
  });
  it("connects a Gregorian axis only for the registered display codec", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    const state = createDefaultGraphUrlState(loaded.catalog);
    const target = {
      ...state.query.temporal_frame.target,
      adapter_identity: "yyyy-iso-fields-fraction12-z-v1",
      comparison_domain: "yyyy-iso-fields-fraction12-z-v1"
    };
    const boot = await graphSpatialBootstrap(
      { ...state, query: { ...state.query, temporal_frame: { target } } },
      loaded.catalog
    );
    expect(boot.workspace.chronologyBoard?.axis).toMatchObject({
      startYear: 0,
      endYear: 0,
      coordinateScale: "elapsed-gregorian"
    });
  });
  it("loads URL-pinned revision 4 after current advances to 5, keeping structural frame display-only", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    expect(loaded.catalog.worlds[0]!.servedRevision).toBe(4);
    expect(
      loaded.snapshots.every(
        (s) =>
          s.servedRevision === 4 &&
          s.events.every((e) => e.title.includes("revision 4"))
      )
    ).toBe(true);
    expect(loaded.catalog.frames[0]!.target.adapter_identity).toBe(
      "structural-order-display/1"
    );
    expect(loaded.snapshots.every((s) => s.timeSystems.length === 0)).toBe(
      true
    );
    const state = createDefaultGraphUrlState(loaded.catalog);
    expect(
      graphRevisionPins(JSON.stringify(state)).map((p) => ({
        world_id: p.world_id,
        served_revision: p.served_revision
      }))
    ).toEqual([{ world_id: ids.worldId, served_revision: 4 }]);
    const boot = await graphSpatialBootstrap(state, loaded.catalog);
    expect(boot.workspace.canons).toHaveLength(2);
    expect(boot.workspace.chronologyBoard).toBeUndefined();
    expect(boot.center).not.toBeNull();
    const visible = await moiraiSpatialReader.viewport({
      sources: state.query.sources,
      viewport: {
        canonIds: boot.workspace.canons.map((c) => c.id),
        bbox: {
          minX: boot.center!.x - 1,
          maxX: boot.center!.x + 1,
          minY: boot.center!.y - 1,
          maxY: boot.center!.y + 1
        },
        scale: 1,
        viewportWidth: 390,
        viewportHeight: 844,
        includeNeighbors: false
      }
    });
    expect(
      visible.viewport.entities.some((e) => e.id.startsWith("m_event_"))
    ).toBe(true);
    const focus = {
      kind: "event" as const,
      world_id: ids.worldId,
      served_revision: 4,
      canon_id: ids.canonId,
      event_ref: { kind: "event" as const, event_id: ids.secondEventId }
    };
    const focused = await graphSpatialBootstrap(
      { ...state, focus },
      loaded.catalog
    );
    const focusedId = presentationNodeId(focus, focus.event_ref);
    const framed = await moiraiSpatialReader.viewport({
      sources: state.query.sources,
      viewport: {
        canonIds: focused.workspace.canons.map((c) => c.id),
        bbox: {
          minX: focused.center!.x - 1,
          maxX: focused.center!.x + 1,
          minY: focused.center!.y - 1,
          maxY: focused.center!.y + 1
        },
        scale: 1,
        viewportWidth: 390,
        viewportHeight: 844,
        includeNeighbors: false
      }
    });
    expect(framed.viewport.entities.some((e) => e.id === focusedId)).toBe(true);
    // A shared Event focused through the second Canon stays on the World plane.
    const secondFocus = { ...focus, canon_id: k2 };
    const secondBoot = await graphSpatialBootstrap(
      { ...state, focus: secondFocus },
      loaded.catalog
    );
    expect(secondBoot.center).toEqual(focused.center);
  });
  it("applies semantic filters without capping spatial exploration to the initial query budget", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    const state = createDefaultGraphUrlState(loaded.catalog);
    const context = await graphSpatialQueryContext({
      ...state,
      query: {
        ...state.query,
        budget: { ...state.query.budget, max_entities: 1 }
      }
    });
    expect(context.full.events).toHaveLength(3);
    expect(context.full.events[0]!.canon_memberships).toEqual([
      ids.canonId,
      k2
    ]);
    const filtered = await graphSpatialQueryContext({
      ...state,
      query: {
        ...state.query,
        entity_filter: { ...state.query.entity_filter, roles: ["signal"] }
      }
    });
    expect(filtered.full.events.map((e) => e.id)).toEqual([ids.eventId]);
    expect(
      filtered.ids.has(
        presentationNodeId(
          { world_id: ids.worldId, served_revision: 4, canon_id: ids.canonId },
          { kind: "event", event_id: ids.secondEventId }
        )
      )
    ).toBe(false);
  });
  it("keeps an unplaced Event's identity, full membership and attributes in the original detail payload", async () => {
    const loaded = await loadGraphPublicationSources([
      { world_id: ids.worldId, served_revision: 4 }
    ]);
    const state = createDefaultGraphUrlState(loaded.catalog);
    const id = presentationNodeId(
      { world_id: ids.worldId, served_revision: 4, canon_id: ids.canonId },
      { kind: "event", event_id: ids.thirdEventId }
    );
    const detail = await graphSpatialDetail(state, id);
    expect(detail.title).toBe("revision 4 event 2");
    expect(detail.readingContext?.observation).toContain(
      "12345678901234567890"
    );
    expect(detail.readingContext?.observation).toContain(k2);
    expect(detail.readingContext?.observation).toContain(
      '"geometry_status": "unplaced"'
    );
    expect(detail.readingContext?.stableEventHref).toContain(
      `/graph/events/${ids.worldId}/${ids.thirdEventId}?revision=4&mq=`
    );
    expect(detail.notes).toContain("No supported geometry is available");
    await expect(graphSpatialDetail(state, "unscoped")).rejects.toThrow(
      "graph_identity_outside_query"
    );
  });
});
