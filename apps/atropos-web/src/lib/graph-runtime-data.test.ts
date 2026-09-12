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
  narratives: []
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
    expect(detail.notes).toContain("12345678901234567890");
    expect(detail.notes).toContain(k2);
    expect(detail.notes).toContain('"geometry_status": "unplaced"');
    expect(detail.notes).toContain(`events/${ids.thirdEventId}?revision=4&mq=`);
    await expect(graphSpatialDetail(state, "unscoped")).rejects.toThrow(
      "graph_identity_outside_query"
    );
  });
});
