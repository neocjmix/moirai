import { describe, expect, it } from "vitest";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { interpolateRenderLevels, levelForCamera } from "./v5-render-level.js";
const point = (id: string, lod: RenderPrimitive["lod"]): RenderPrimitive => ({
  id,
  entity: { kind: "event", id },
  geometry: { kind: "point", xy: { x: 0, y: 0 } },
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  label: id,
  collectionIds: ["c"],
  lod
});
describe("anisotropic camera and prepared Level transitions", () => {
  it("moves half a Level when only one axis doubles", () => {
    const base = {
      scaleX: 1,
      scaleY: 1,
      width: 100,
      height: 100,
      world: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
      maxLevel: 5
    };
    expect(levelForCamera(base)).toBe(0);
    expect(levelForCamera({ ...base, scaleX: 2 })).toBeCloseTo(0.5);
    expect(levelForCamera({ ...base, scaleY: 2 })).toBeCloseTo(0.5);
    expect(levelForCamera({ ...base, scaleX: 2, scaleY: 2 })).toBeCloseTo(1);
    expect(levelForCamera({ ...base, scaleX: 1e9, scaleY: 1e9 })).toBe(5);
  });
  it("crossfades prepared representations and deduplicates shared IDs", () => {
    const stable = point("stable", { visible: [0, 5], groupId: "stable" });
    const far = point("far", {
      visible: [0, 3.4],
      fadeOut: [2.8, 3.4],
      groupId: "composite"
    });
    const hull = point("hull", {
      visible: [2.7, 5],
      fadeIn: [2.7, 3.3],
      groupId: "composite"
    });
    const result = interpolateRenderLevels(
      [stable, far],
      [stable, far, hull],
      2.9
    );
    expect(
      result.find((entry) => entry.primitive.id === "stable")?.opacity
    ).toBeCloseTo(1);
    expect(
      result.find((entry) => entry.primitive.id === "far")?.opacity
    ).toBeGreaterThan(0);
    expect(
      result.find((entry) => entry.primitive.id === "hull")?.opacity
    ).toBeGreaterThan(0);
    expect(
      interpolateRenderLevels([far], [hull], 3.4).map(
        (entry) => entry.primitive.id
      )
    ).toEqual(["hull"]);
  });
});
