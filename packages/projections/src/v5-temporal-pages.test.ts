import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "./v5-temporal.js";
import { buildV5TemporalDetailPages } from "./v5-temporal-pages.js";

const worldId = "w";
const children = Array.from({ length: 130 }, (_, index) => `child-${index}`);
const ids = ["process", ...children];
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "실제 세계사",
    description: null
  },
  collections: [],
  events: ids.map((id) => ({
    id,
    world_id: worldId,
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: [],
  relations: children.map((child, index) => ({
    id: `contains-${index}`,
    world_id: worldId,
    type: "contains",
    source_ref: { kind: "event", event_id: "process" },
    target_ref: { kind: "event", event_id: child },
    direction: "directed",
    attributes: {}
  })),
  narratives: ids.map((id) => ({
    id: `n-${id}`,
    world_id: worldId,
    scope_type: "event",
    scope_id: id,
    locale: "ko",
    title: null,
    body: `Historical account of ${id}`,
    public_references: [],
    notes: []
  })),
  timeSystems: [],
  collectionTimeSystems: []
};

describe("inactive World temporal detail pages", () => {
  it("pages Composite children and descendants without changing World truth", () => {
    const projection = projectV5WorldTemporal(state, 31);
    const pages = buildV5TemporalDetailPages(projection);
    const root = pages.find((page) =>
      page.key.endsWith("/temporal/world.json")
    )!;
    const composite = pages.find((page) =>
      page.key.endsWith("/events/process/composite.json")
    )!;
    expect(root.value).toMatchObject({
      semantic_digest: projection.semantic_digest,
      position_count: 131,
      composite_count: 1,
      completeness: "temporal-detail-only"
    });
    expect(composite.value.composite).toMatchObject({
      direct_children: 130,
      direct_children_pages: 2,
      descendant_count: 130,
      descendant_pages: 2
    });
    expect(JSON.stringify(root.value)).not.toContain("canon_id");
    expect(JSON.stringify(composite.value)).not.toContain("canon_id");
    expect(root.key).not.toContain("current.json");
    expect(root.value).not.toHaveProperty("positions");
    expect(
      pages.every((page) =>
        "items" in page.value
          ? (page.value.items as readonly unknown[]).length <= 128
          : true
      )
    ).toBe(true);
    expect(buildV5TemporalDetailPages(projection)).toEqual(pages);
  });
});
