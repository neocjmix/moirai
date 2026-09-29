import { describe, expect, it } from "vitest";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { prepareCompositeWorldGeometry } from "../urdr-port/src/components/graph-shell-world";
import { renderTileViewport } from "./v5-render-viewport";

const box = { minX: 0, maxX: 100, minY: 0, maxY: 80 };
const base = {
  bounds: box,
  label: "과정",
  collectionIds: ["history"],
  lod: { visible: [0, 8] as [number, number], groupId: "outer" }
};
const hull: RenderPrimitive = {
  ...base,
  id: "event:outer:hull",
  entity: { kind: "composite", id: "outer" },
  geometry: {
    kind: "polygon",
    rings: [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 80, y: 80 }
      ]
    ]
  },
  composite: {
    childEventIds: ["a", "b"],
    supportComplete: true,
    worldBounds: box
  }
};
const point: RenderPrimitive = {
  ...base,
  id: "event:a:point",
  label: "첫 사건",
  entity: { kind: "event", id: "a" },
  geometry: { kind: "point", xy: { x: 10, y: 10 } }
};

describe("tile data through the original GraphShell presentation contract", () => {
  it("retains authored hierarchy and prepared hull without viewport descendants", () => {
    const viewport = renderTileViewport({
      worldId: "world",
      revision: 7,
      primitives: [hull, point],
      relationTypes: []
    });
    expect(viewport.regions).toMatchObject([
      {
        id: "outer",
        contains: ["a", "b"],
        childrenComplete: true
      }
    ]);
    const world = prepareCompositeWorldGeometry(
      [...viewport.entities, ...viewport.regions],
      [{ id: "a", x: 10, y: 10 }],
      "concave"
    );
    expect(world.regions[0]).toMatchObject({
      id: "outer",
      supportComplete: true,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 80, y: 80 }
      ]
    });
  });

  it("never renders grid count clusters as authored Events or Composites", () => {
    const viewport = renderTileViewport({
      worldId: "world",
      revision: 7,
      primitives: [
        hull,
        point,
        {
          ...base,
          id: "cluster:3:1:1:abc",
          entity: { kind: "cluster", id: "cluster:3:1:1:abc" },
          geometry: { kind: "point", xy: { x: 50, y: 40 } },
          memberCount: 17
        }
      ],
      relationTypes: []
    });
    expect(viewport.entities.map((entity) => entity.id)).toEqual(["a"]);
    expect(viewport.regions.map((entity) => entity.id)).toEqual(["outer"]);
  });

  it("fails closed if a selected Composite has no published hierarchy", () => {
    const { composite: _metadata, ...incompleteHull } = hull;
    expect(() =>
      renderTileViewport({
        worldId: "world",
        revision: 7,
        primitives: [incompleteHull],
        relationTypes: []
      })
    ).toThrow("render_composite_metadata_missing");
  });
});
