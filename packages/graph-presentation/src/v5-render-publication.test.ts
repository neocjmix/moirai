import { describe, expect, it } from "vitest";
import type { CanonicalState } from "@moirai/contracts/v5";
import type { V5WorldLayout } from "./v5-world-layout.js";
import {
  compileV5RenderPublication,
  verifyRenderVisibilityCoverage,
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
    expect(primitives.get("event:outer:hull")?.composite).toMatchObject({
      childEventIds: ["c", "d", "inner"],
      supportComplete: true,
      worldBounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    });
    expect(primitives.get("event:outer:far")).toBeUndefined();
    expect(primitives.get("event:outer:hull")?.composite).toMatchObject({
      hullBounds: { minX: 1, maxX: 100, minY: 1, maxY: 100 },
      anchor: { x: 50.5, y: 50.5 },
      depth: 2,
      transitions: {
        pointEnterMaxSizePx: 32,
        pointExitMaxSizePx: 48,
        childFadeHeightPx: [58, 100]
      }
    });
    expect(primitives.get("event:a:point")?.parentCompositeIds).toEqual([
      "inner"
    ]);
    expect(primitives.get("event:a:point")?.ancestorCompositeIds).toEqual([
      "inner",
      "outer"
    ]);
    expect(
      publication.tiles.some(
        (tile) => tile.level === 3 && tile.x === 0 && tile.y === 0
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
        [{ ...tiles.find((tile) => tile.level === 0)!, revision: 2 }],
        publication.bounds!,
        0
      )
    ).toThrow("render_mixed_revision");
    expect(() =>
      selectRenderScene(
        publication,
        [{ ...tiles.find((tile) => tile.level === 0)!, primitives: [] }],
        publication.bounds!,
        0
      )
    ).toThrow("render_tile_digest_invalid");
  });

  it("preserves individual Events and exact Collection filtering at every spatial level without clusters", () => {
    const many = Array.from({ length: 1000 }, (_, i) => String(i));
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
        position: { x: (i % 100) * 64, y: Math.floor(i / 100) * 256 }
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
    expect(far.length).toBeGreaterThan(0);
    expect(far.length).toBeLessThanOrEqual(256);
    expect(far.every((primitive) => primitive.entity.kind === "event")).toBe(
      true
    );
    expect(
      tiles.some((tile) =>
        tile.primitives.some((primitive) => primitive.entity.kind === "cluster")
      )
    ).toBe(false);
    const near = selectRenderScene(
      publication,
      tiles.filter((t) => t.level === publication.maxLevel),
      publication.bounds!,
      publication.maxLevel,
      ["one"]
    );
    expect(near.filter((p) => p.entity.kind === "event")).toHaveLength(500);
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

  it("publishes relations only at Levels where both endpoints are represented and externalizes long lines", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `node-${i}`);
    const dense = {
      ...state,
      events: ids.map(event),
      eventCollectionMemberships: [],
      relations: [relation("long", "causes", ids[0]!, ids[299]!)]
    } as unknown as CanonicalState;
    const positions = {
      ...layout,
      shapes: ids.map((id, i) => ({
        event_id: id,
        kind: "point" as const,
        position: { x: (i % 20) * 100, y: Math.floor(i / 20) * 100 }
      }))
    };
    const publication = compileV5RenderPublication(dense, positions);
    const tiles = publication.documents.map(
      (d) => JSON.parse(d.body) as RenderTile
    );
    const far = tiles
      .filter((tile) => tile.level === 0)
      .flatMap((tile) => tile.primitives);
    for (const edge of far.filter(
      (primitive) => primitive.entity.kind === "relation"
    )) {
      expect(
        edge.endpointIds?.every((id) =>
          far.some((primitive) => primitive.entity.id === id)
        )
      ).toBe(true);
    }
    const near = tiles
      .filter(
        (t) => t.level === publication.maxLevel || t.bucketKind === "overflow"
      )
      .flatMap((t) => t.primitives)
      .find((p) => p.id === "relation:long");
    expect(near?.endpointIds).toEqual([ids[0], ids[299]]);
    expect(near?.geometry.kind).toBe("external");
    const ref = near?.geometry;
    if (ref?.kind !== "external") throw Error("expected_external_line");
    const body = publication.geometryDocuments.find(
      (d) => d.key === ref.key
    )?.body;
    expect(resolveRenderGeometry(publication, near!, body!)).toMatchObject({
      kind: "line"
    });
  });

  it("keeps relation selection exact when only one endpoint belongs to an active Collection", () => {
    const selectedState = {
      ...state,
      eventCollectionMemberships: [
        ...state.eventCollectionMemberships,
        { event_id: "c", collection_id: "three" }
      ]
    } as CanonicalState;
    const publication = compileV5RenderPublication(selectedState, layout);
    const tiles = publication.documents.map(
      (d) => JSON.parse(d.body) as RenderTile
    );
    const scene = (selection: string[]) =>
      selectRenderScene(
        publication,
        tiles.filter((t) => t.level === 3),
        publication.bounds!,
        3,
        selection
      );
    expect(scene(["one"]).some((p) => p.id === "relation:ac")).toBe(false);
    expect(scene(["one", "three"]).some((p) => p.id === "relation:ac")).toBe(
      true
    );
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

  it("does not invent semantic clusters for coincident Events", () => {
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
    const publication = compileV5RenderPublication(dense, positions);
    expect(
      publication.documents.every(
        (document) =>
          (JSON.parse(document.body) as RenderTile).primitives.length === 128
      )
    ).toBe(true);
  });

  it("keeps existing cell bounds, content and geometry stable when occupied extrema expand", () => {
    const first = compileV5RenderPublication(state, layout);
    const next = compileV5RenderPublication(
      {
        ...state,
        events: [...state.events, event("distant")]
      } as CanonicalState,
      {
        ...layout,
        shapes: [
          ...layout.shapes,
          {
            event_id: "distant",
            kind: "point",
            position: { x: -10_000_000, y: 20_000_000 }
          }
        ]
      }
    );
    expect(first.format).toBe("render-publication/2");
    expect(first.algorithmVersion).toBe("render-compiler/4");
    expect(first.spatialFrame).toEqual(next.spatialFrame);
    expect(first.minLevel).toBe(-8);
    expect(next.bounds).not.toEqual(first.bounds);
    const nextDocuments = new Map(
      next.documents.map((document) => [document.key, document.body])
    );
    for (const document of first.documents)
      expect(nextDocuments.get(document.key)).toBe(document.body);
    expect(next.geometryDocuments).toEqual(first.geometryDocuments);
    expect(next.tiles.some((tile) => tile.x < 0)).toBe(true);
  });

  it("uses one positive-side cell for boundary points at every signed spatial level", () => {
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: [event("zero"), event("negative")],
        relations: [],
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: [
          { event_id: "zero", kind: "point", position: { x: 0, y: 0 } },
          {
            event_id: "negative",
            kind: "point",
            position: { x: -4096, y: -16384 }
          }
        ]
      }
    );
    const tiles = publication.documents.map(
      (document) => JSON.parse(document.body) as RenderTile
    );
    for (
      let level = publication.minLevel!;
      level <= publication.maxLevel;
      level++
    ) {
      for (const id of ["zero", "negative"]) {
        const owners = tiles.filter(
          (tile) =>
            tile.level === level &&
            tile.primitives.some((primitive) => primitive.entity.id === id)
        );
        expect(owners).toHaveLength(1);
        if (id === "zero") expect(owners[0]).toMatchObject({ x: 0, y: 0 });
      }
    }
  });

  it("bounds dense ungrouped metadata with explicit omissions and stable individual priorities", () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `large-${i}`);
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: ids.map(event),
        relations: [],
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: ids.map((id) => ({
          event_id: id,
          kind: "point",
          position: { x: 0, y: 0 }
        }))
      }
    );
    for (const document of publication.documents) {
      const tile = JSON.parse(document.body) as RenderTile;
      expect(tile.primitives).toHaveLength(128);
      expect(tile.visibility).toMatchObject({
        candidateCount: 5000,
        omittedCount: 4872,
        normalBudget: 64,
        smallBudget: 32,
        bufferBudget: 32
      });
      expect(
        tile.primitives.every(
          (primitive) =>
            primitive.entity.kind === "event" &&
            primitive.visibility?.policy === "render-visibility/1"
        )
      ).toBe(true);
      expect(Buffer.byteLength(document.body)).toBeLessThan(100_000);
    }
    expect(() =>
      verifyRenderVisibilityCoverage(publication, new Set(ids), new Set())
    ).not.toThrow();
    const invalid = {
      ...publication,
      documents: publication.documents.map((document) => {
        const tile = JSON.parse(document.body) as RenderTile;
        return {
          ...document,
          body: JSON.stringify({
            ...tile,
            visibility: { ...tile.visibility, omittedCount: 0 }
          })
        };
      })
    };
    expect(() =>
      verifyRenderVisibilityCoverage(invalid, new Set(ids), new Set())
    ).toThrow("v5_render_visibility_policy_invalid");
    expect(() =>
      verifyRenderVisibilityCoverage(publication, new Set(), new Set())
    ).toThrow("v5_render_event_coverage_invalid");
  });

  it("retains crossing relation endpoints in the positive-side boundary cell", () => {
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: [event("start"), event("end")],
        relations: [relation("edge", "causes", "start", "end")],
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: [
          { event_id: "start", kind: "point", position: { x: -10, y: 0 } },
          { event_id: "end", kind: "point", position: { x: 512, y: 0 } }
        ]
      }
    );
    const tile = publication.documents
      .map((document) => JSON.parse(document.body) as RenderTile)
      .find((item) => item.level === 3 && item.x === 1 && item.y === 0)!;
    expect(tile.primitives.map((primitive) => primitive.id)).toContain(
      "relation:edge"
    );
    expect(
      selectRenderScene(
        publication,
        [tile],
        { minX: 512, maxX: 600, minY: 0, maxY: 1 },
        3
      ).map((primitive) => primitive.id)
    ).toContain("relation:edge");
  });

  it("propagates incomplete authored support through nested Composites", () => {
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: [...state.events, event("missing")],
        relations: [
          ...state.relations,
          relation("missing-support", "contains", "inner", "missing")
        ]
      } as unknown as CanonicalState,
      layout
    );
    const primitives = publication.documents.flatMap(
      (document) => (JSON.parse(document.body) as RenderTile).primitives
    );
    expect(
      primitives.find((primitive) => primitive.id === "event:inner:hull")
        ?.composite?.supportComplete
    ).toBe(false);
    expect(
      primitives.find((primitive) => primitive.id === "event:outer:hull")
        ?.composite?.supportComplete
    ).toBe(false);
  });

  it("retains the same fixed frame and signed level window for an empty World", () => {
    const publication = compileV5RenderPublication(
      { ...state, events: [], relations: [] } as unknown as CanonicalState,
      { ...layout, shapes: [] }
    );
    expect(publication).toMatchObject({
      format: "render-publication/2",
      algorithmVersion: "render-compiler/4",
      minLevel: -8,
      maxLevel: 12,
      bounds: null,
      tiles: []
    });
    expect(publication.spatialFrame?.originX).toBe(0);
  });

  it("keeps a local read constant as distant Event count grows from 1k to 10k to 100k", () => {
    let localBody: string | undefined;
    let tileCount: number | undefined;
    for (const count of [1000, 10_000, 100_000]) {
      const ids = Array.from({ length: count }, (_, i) => `scale-${i}`);
      const publication = compileV5RenderPublication(
        {
          ...state,
          events: ids.map(event),
          relations: [],
          eventCollectionMemberships: []
        } as unknown as CanonicalState,
        {
          ...layout,
          shapes: ids.map((id, i) => ({
            event_id: id,
            kind: "point",
            position:
              i < 128
                ? { x: (i % 16) * 16, y: Math.floor(i / 16) * 16 }
                : { x: 5_000_000 + (i % 10), y: 5_000_000 + (i % 10) }
          }))
        }
      );
      const local = publication.documents.find((document) =>
        document.key.endsWith("/3/0/0.json")
      )!;
      localBody ??= local.body;
      expect(local.body).toBe(localBody);
      for (const document of publication.documents) {
        const tile = JSON.parse(document.body) as RenderTile;
        expect(tile.primitives.length).toBeLessThanOrEqual(128);
        expect(Buffer.byteLength(document.body)).toBeLessThan(100_000);
      }
      tileCount ??= publication.documents.length;
      expect(publication.documents).toHaveLength(tileCount);
    }
  }, 30_000);

  it("budgets authored Composite representations as well as independent Event points", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `composite-${i}`);
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: [...ids.map(event), event("support")],
        relations: ids.map((id) =>
          relation(`contains-${id}`, "contains", id, "support")
        ),
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: [
          ...ids.map((id) => ({
            event_id: id,
            kind: "region" as const,
            bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
          })),
          { event_id: "support", kind: "point", position: { x: 5, y: 5 } }
        ]
      }
    );
    const tile = JSON.parse(publication.documents[0]!.body) as RenderTile;
    expect(tile.primitives).toHaveLength(128);
    expect(
      tile.primitives.filter(
        (primitive) => primitive.entity.kind === "composite"
      ).length
    ).toBe(127);
    expect(
      tile.primitives.some((primitive) => primitive.entity.id === "support")
    ).toBe(true);
    expect(tile.visibility?.omittedCount).toBe(173);
  });

  it("stores huge hulls at a bounded coarse home and resolves them alongside fine points", () => {
    const bigState = {
      ...state,
      events: ["region", "a", "b", "c"].map(event),
      relations: ["a", "b", "c"].map((id) =>
        relation(`big-${id}`, "contains", "region", id)
      ),
      eventCollectionMemberships: []
    } as unknown as CanonicalState;
    const bigLayout = {
      ...layout,
      shapes: [
        {
          event_id: "region",
          kind: "region",
          bounds: { minX: 0, maxX: 100_000, minY: 0, maxY: 500_000 }
        },
        { event_id: "a", kind: "point", position: { x: 0, y: 0 } },
        { event_id: "b", kind: "point", position: { x: 100_000, y: 0 } },
        { event_id: "c", kind: "point", position: { x: 0, y: 500_000 } }
      ]
    } as V5WorldLayout;
    const publication = compileV5RenderPublication(bigState, bigLayout);
    const tiles = publication.documents.map(
      (document) => JSON.parse(document.body) as RenderTile
    );
    const overflow = tiles.filter((tile) => tile.bucketKind === "overflow");
    expect(overflow.length).toBeGreaterThan(0);
    expect(overflow.length).toBeLessThanOrEqual(16);
    expect(publication.overflowLevels).toHaveLength(1);
    expect(
      tiles
        .filter((tile) => tile.level === 12)
        .every((tile) =>
          tile.primitives.every(
            (primitive) => primitive.entity.kind === "event"
          )
        )
    ).toBe(true);
    const visible = selectRenderScene(
      publication,
      overflow,
      { minX: 10, maxX: 11, minY: 10, maxY: 11 },
      12
    );
    expect(
      visible.some((primitive) => primitive.id === "event:region:hull")
    ).toBe(true);
    expect(
      publication.tiles
        .filter((tile) => tile.bucketKind === "overflow")
        .every((tile) => tile.key.includes("/overflow/"))
    ).toBe(true);
  });

  it("reveals previously omitted distinct Events when fixed cells refine beyond legacy level3", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `zoom-${i}`);
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: ids.map(event),
        relations: [],
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: ids.map((id, i) => ({
          event_id: id,
          kind: "point",
          position: { x: i % 100, y: Math.floor(i / 100) }
        }))
      }
    );
    const tiles = publication.documents.map(
      (document) => JSON.parse(document.body) as RenderTile
    );
    const at = (level: number) =>
      new Set(
        tiles
          .filter((tile) => tile.level === level)
          .flatMap((tile) => tile.primitives.map((primitive) => primitive.id))
      );
    expect(at(3).size).toBe(128);
    expect(at(12).size).toBe(1000);
  });

  it("compiles a 100k-child authored star with bounded child hints and complete ancestor constraints", () => {
    const ids = Array.from({ length: 100_000 }, (_, i) => `star-${i}`);
    const publication = compileV5RenderPublication(
      {
        ...state,
        events: [event("star-root"), ...ids.map(event)],
        relations: ids.map((id) =>
          relation(`contains-${id}`, "contains", "star-root", id)
        ),
        eventCollectionMemberships: []
      } as unknown as CanonicalState,
      {
        ...layout,
        shapes: [
          {
            event_id: "star-root",
            kind: "region",
            bounds: { minX: 0, maxX: 99, minY: 0, maxY: 9 }
          },
          ...ids.map((id, i) => ({
            event_id: id,
            kind: "point" as const,
            position: { x: i % 100, y: Math.floor(i / 100) % 10 }
          }))
        ]
      }
    );
    const primitives = publication.documents.flatMap((document) => {
      const tile = JSON.parse(document.body) as RenderTile;
      expect(tile.primitives.length).toBeLessThanOrEqual(128);
      expect(Buffer.byteLength(document.body)).toBeLessThan(1024 * 1024);
      return tile.primitives;
    });
    const root = primitives.find(
      (primitive) => primitive.entity.id === "star-root"
    )!;
    expect(root.composite).toMatchObject({
      childEventCount: 100_000,
      childIdsComplete: false,
      supportComplete: true
    });
    expect(root.composite?.childEventIds).toHaveLength(128);
    expect(
      primitives
        .filter((primitive) => primitive.entity.kind === "event")
        .every(
          (primitive) =>
            JSON.stringify(primitive.ancestorCompositeIds) ===
            JSON.stringify(["star-root"])
        )
    ).toBe(true);
  }, 60_000);
});
