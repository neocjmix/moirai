import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";
import {
  compileV5RenderPublication,
  selectRenderScene,
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
          (document) =>
            (
              JSON.parse(document.body) as {
                primitives: {
                  id: string;
                  geometry: unknown;
                  collectionIds: string[];
                }[];
              }
            ).primitives
        )
        .map((primitive) => [primitive.id, primitive])
    );
    expect(primitives.get("event:outer:hull")?.geometry).toMatchObject({
      kind: "polygon",
      rings: [expect.arrayContaining([{ x: 100, y: 100 }])]
    });
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

  it("rejects the dense root-tile format until bounded LOD representations exist", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => String(i));
    const dense = {
      ...state,
      events: many.map(event),
      eventCollectionMemberships: [],
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
    expect(() => compileV5RenderPublication(dense, positions)).toThrow(
      "render_tile_budget_exceeded"
    );
  });
});
