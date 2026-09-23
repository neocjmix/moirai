import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { buildV5ContentPages } from "./v5-content.js";

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
const collection = (id: string) => ({
  id,
  world_id: worldId,
  slug: id,
  title: id,
  description: null
});
const narrative = (id: string, scope_type: "event" | "collection") => ({
  id: `n-${id}`,
  world_id: worldId,
  scope_type,
  scope_id: id,
  locale: "ko",
  title: null,
  body: `Reader account of ${id}`,
  public_references: [],
  notes: []
});
const fixture = (): CanonicalState => ({
  world: {
    id: worldId,
    slug: "history",
    title: "실제 세계사",
    description: null
  },
  collections: [collection("joseon"), collection("danjong")],
  timeSystems: [],
  collectionTimeSystems: [],
  events: [event("coup"), event("process"), event("orphan")],
  eventCollectionMemberships: [
    { event_id: "coup", collection_id: "joseon" },
    { event_id: "coup", collection_id: "danjong" },
    { event_id: "process", collection_id: "danjong" }
  ],
  relations: [
    {
      id: "part",
      world_id: worldId,
      type: "contains",
      source_ref: { kind: "event", event_id: "process" },
      target_ref: { kind: "event", event_id: "coup" },
      direction: "directed",
      attributes: {}
    }
  ],
  narratives: [
    narrative("joseon", "collection"),
    narrative("danjong", "collection"),
    narrative("coup", "event"),
    narrative("process", "event"),
    narrative("orphan", "event")
  ]
});
const get = (pages: ReturnType<typeof buildV5ContentPages>, suffix: string) =>
  pages.find((page) => page.key.endsWith(suffix))?.value;

describe("content-only v5 projection (not an active Publication)", () => {
  it("keeps World facts, single owner prose, and shared Event identity separate from selections", () => {
    const pages = buildV5ContentPages(fixture(), 31);
    expect(
      pages.filter((page) => page.key.endsWith("/events/coup/detail.json"))
    ).toHaveLength(1);
    expect(get(pages, "/events/coup/collections/0.json")).toMatchObject({
      collection_ids: ["danjong", "joseon"]
    });
    expect(get(pages, "/events/coup/detail.json")).toMatchObject({
      narrative: { scope_type: "event", scope_id: "coup" },
      composite_child_count: 0
    });
    expect(get(pages, "/events/process/detail.json")).toMatchObject({
      composite_child_count: 1
    });
    expect(get(pages, "/events/orphan/detail.json")).toMatchObject({
      collection_page_count: 0
    });
    expect(
      pages.filter((page) => page.key.endsWith("/relations/part.json"))
    ).toHaveLength(1);
    expect(JSON.stringify(pages)).not.toContain("origin_refs");
    expect(buildV5ContentPages(fixture(), 31)).toEqual(pages);
  });
  it("Collection withdrawal retains the shared Event and World Relation", () => {
    const state = fixture();
    const withoutDan = buildV5ContentPages(
      {
        ...state,
        collections: state.collections.filter((c) => c.id !== "danjong"),
        eventCollectionMemberships: state.eventCollectionMemberships.filter(
          (m) => m.collection_id !== "danjong"
        ),
        narratives: state.narratives.filter((n) => n.scope_id !== "danjong")
      },
      32
    );
    expect(get(withoutDan, "/events/coup/detail.json")).toMatchObject({
      narrative: { id: "n-coup" }
    });
    expect(get(withoutDan, "/events/coup/collections/0.json")).toMatchObject({
      collection_ids: ["joseon"]
    });
    expect(get(withoutDan, "/relations/part.json")).toBeDefined();
    expect(get(withoutDan, "/events/process/detail.json")).toMatchObject({
      composite_child_count: 1
    });
  });
  it("pages a large Collection without enlarging the root catalog", () => {
    const state = fixture();
    const added = Array.from({ length: 256 }, (_, i) => event(`extra-${i}`));
    const pages = buildV5ContentPages(
      {
        ...state,
        events: [...state.events, ...added],
        eventCollectionMemberships: [
          ...state.eventCollectionMemberships,
          ...added.map((e) => ({ event_id: e.id, collection_id: "joseon" }))
        ],
        narratives: [
          ...state.narratives,
          ...added.map((e) => narrative(e.id, "event"))
        ]
      },
      33
    );
    expect(get(pages, "/collections/joseon/detail.json")).toMatchObject({
      member_count: 257,
      member_page_count: 3
    });
    expect(get(pages, "/collections/joseon/members/0.json")).toMatchObject({
      event_ids: expect.any(Array)
    });
    expect(
      (get(pages, "/collections/joseon/members/0.json")?.event_ids as string[])
        .length
    ).toBe(128);
    expect(JSON.stringify(get(pages, "/world.json")).length).toBeLessThan(1000);
  });
});
