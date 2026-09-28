import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";
import {
  compileV5RenderPublication,
  selectRenderScene,
  resolveRenderGeometry,
  type RenderTile
} from "./v5-render-publication.js";

const event = (id: string) => ({ id, title: id });
const relation = (
  id: string,
  type: string,
  source: string,
  target: string
) => ({
  id,
  type,
  source_ref: { kind: "event", event_id: source },
  target_ref: { kind: "event", event_id: target }
});
const state = {
  world: { id: "w" },
  events: ["outer", "inner", "a", "b", "c", "d"].map(event),
  eventCollectionMemberships: [
    { event_id: "a", collection_id: "one" },
    { event_id: "a", collection_id: "two" }
  ],
  relations: [
    relation("oi", "contains", "outer", "inner"),
    relation("ia", "contains", "inner", "a"),
    relation("ib", "contains", "inner", "b"),
    relation("oc", "contains", "outer", "c"),
    relation("od", "contains", "outer", "d"),
    relation("ac", "causes", "a", "c")
  ]
} as unknown as CanonicalState;
const layout = {
  world_id: "w",
  revision: 1,
  time_system_id: "t",
  algorithm_version: "v5-world-layout/1",
  temporal_digest: "x",
  unplaced_event_ids: [],
  diagnostics: [],
  shapes: [
    {
      event_id: "outer",
      kind: "region",
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    },
    {
      event_id: "inner",
      kind: "region",
      bounds: { minX: 1, maxX: 3, minY: 1, maxY: 2 }
    },
    { event_id: "a", kind: "point", position: { x: 1, y: 1 } },
    { event_id: "b", kind: "point", position: { x: 3, y: 1 } },
    { event_id: "c", kind: "point", position: { x: 2, y: 3 } },
    { event_id: "d", kind: "point", position: { x: 100, y: 100 } }
  ]
} as V5WorldLayout;

describe("render publication compiler", () => {
  it("compiles transitive World support and relation geometry independent of viewport", () => {
    const publication = compileV5RenderPublication(state, layout);
    const primitives = new Map(
      publication.documents
        .flatMap(
          (document) => (JSON.parse(document.body) as RenderTile).primitives
        )
        .map((primitive) => [primitive.id, primitive])
    );
    const external = primitives.get("event:outer:hull")?.geometry as {
      kind: "external";
      key: string;
    };
    expect(external.kind).toBe("external");
    const body = publication.geometryDocuments.find(
      (doc) => doc.key === external.key
    )?.body;
    expect(body).toBeDefined();
    const hull = resolveRenderGeometry(
      publication,
      primitives.get("event:outer:hull")!,
      body!
    );
    expect(hull).toMatchObject({
      kind: "polygon",
      rings: [expect.arrayContaining([{ x: 100, y: 100 }])]
    });
    expect(() =>
      resolveRenderGeometry(
        publication,
        primitives.get("event:outer:hull")!,
        body! + " "
      )
    ).toThrow("render_geometry_digest_invalid");
    expect(primitives.get("relation:ac")?.geometry).toEqual({
      kind: "line",
      paths: [
        [
          { x: 1, y: 1 },
          { x: 2, y: 3 }
        ]
      ]
    });
    expect(primitives.get("event:a:point")?.collectionIds).toEqual([
      "one",
      "two"
    ]);
    expect(
      publication.tiles.some(
        (tile) => tile.level === 3 && tile.x === 7 && tile.y === 7
      )
    ).toBe(true);
  });

  it("is deterministic regardless of input order and rejects contains cycles", () => {
    const first = compileV5RenderPublication(state, layout);
    const reordered = {
      ...state,
      relations: [...state.relations].reverse(),
      events: [...state.events].reverse()
    } as unknown as CanonicalState;
    expect(
      compileV5RenderPublication(reordered, {
        ...layout,
        shapes: [...layout.shapes].reverse()
      }).documents
    ).toEqual(first.documents);
    const cyclic = {
      ...state,
      relations: [
        ...state.relations,
        relation("cycle", "contains", "inner", "outer")
      ]
    } as CanonicalState;
    expect(() => compileV5RenderPublication(cyclic, layout)).toThrow(
      "render_contains_cycle"
    );
  });

  it("deduplicates tile replicas and rejects a mixed or modified revision", () => {
    const publication = compileV5RenderPublication(state, layout);
    const tiles = publication.documents.map(
      (document) => JSON.parse(document.body) as RenderTile
    );
    const scene = selectRenderScene(
      publication,
      tiles.filter((tile) => tile.level === 3),
      publication.bounds!,
      3
    );
    expect(
      scene.filter((primitive) => primitive.id === "event:outer:hull")
    ).toHaveLength(1);
    expect(() =>
      selectRenderScene(
        publication,
        [{ ...tiles[0]!, revision: 2 }],
        publication.bounds!,
        0
      )
    ).toThrow("render_mixed_revision");
    expect(() =>
      selectRenderScene(
        publication,
        [{ ...tiles[0]!, primitives: [] }],
        publication.bounds!,
        0
      )
    ).toThrow("render_tile_digest_invalid");
  });

  it("aggregates dense coarse levels by exact Collection membership and restores Event points nearby", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => String(i));
    const dense = {
      ...state,
      events: many.map(event),
      eventCollectionMemberships: many.map((id, i) => ({
        event_id: id,
        collection_id: i % 2 ? "one" : "two"
      })),
      relations: []
    } as unknown as CanonicalState;
    const positions = {
      ...layout,
      shapes: many.map((id, i) => ({
        event_id: id,
        kind: "point" as const,
        position: { x: i % 100, y: Math.floor(i / 100) }
      }))
    };
    const publication = compileV5RenderPublication(dense, positions);
    expect(
      Math.max(...publication.documents.map((d) => Buffer.byteLength(d.body)))
    ).toBeLessThanOrEqual(1024 * 1024);
    const tiles = publication.documents.map(
      (d) => JSON.parse(d.body) as RenderTile
    );
    const far = selectRenderScene(
      publication,
      tiles.filter((t) => t.level === 0),
      publication.bounds!,
      0,
      ["one"]
    );
    expect(far).toHaveLength(1);
    expect(far[0]).toMatchObject({
      entity: { kind: "cluster" },
      memberCount: 5000,
      collectionIds: ["one"]
    });
    const near = selectRenderScene(
      publication,
      tiles.filter((t) => t.level === publication.maxLevel),
      publication.bounds!,
      publication.maxLevel,
      ["one"]
    );
    expect(near.filter((p) => p.entity.kind === "event")).toHaveLength(5000);
    expect(
      selectRenderScene(
        publication,
        tiles.filter((t) => t.level === 0),
        publication.bounds!,
        0,
        []
      )
    ).toHaveLength(0);
  });

  it("keeps nested convex support bounded to child hull vertices", () => {
    const depth = 250;
    const nested = {
      ...state,
      events: [
        ...state.events,
        ...Array.from({ length: depth }, (_, i) => event(`nest-${i}`))
      ],
      relations: [
        ...state.relations,
        relation("root-nest", "contains", "outer", "nest-0"),
        ...Array.from({ length: depth - 1 }, (_, i) =>
          relation(`nest-link-${i}`, "contains", `nest-${i}`, `nest-${i + 1}`)
        ),
        relation("nest-leaf", "contains", `nest-${depth - 1}`, "a")
      ]
    } as unknown as CanonicalState;
    const positioned = {
      ...layout,
      shapes: [
        ...layout.shapes,
        ...Array.from({ length: depth }, (_, i) => ({
          event_id: `nest-${i}`,
          kind: "region" as const,
          bounds: { minX: 1, maxX: 1, minY: 1, maxY: 1 }
        }))
      ]
    };
    const publication = compileV5RenderPublication(nested, positioned);
    expect(publication.tiles.length).toBeGreaterThan(0);
    const hull = publication.documents
      .flatMap(
        (document) => (JSON.parse(document.body) as RenderTile).primitives
      )
      .find((primitive) => primitive.id === "event:outer:hull");
    expect(hull?.bounds.maxX).toBe(100);
  });

  it("fails closed if even the finest level cannot expose individual Events", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `dense-${i}`);
    const dense = {
      ...state,
      events: ids.map(event),
      eventCollectionMemberships: [],
      relations: []
    } as unknown as CanonicalState;
    const positions = {
      ...layout,
      shapes: ids.map((id) => ({
        event_id: id,
        kind: "point" as const,
        position: { x: 0, y: 0 }
      }))
    };
    expect(() => compileV5RenderPublication(dense, positions)).toThrow(
      "render_level_capacity_exceeded"
    );
  });
});
