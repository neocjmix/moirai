import { describe, expect, it } from "vitest";
import { buildRenderConcaveHull } from "./v5-render-hull.js";
describe("World-level concave Composite hull", () => {
  it("preserves the Y-sweep indentation that a convex hull would erase", () => {
    expect(
      buildRenderConcaveHull(
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
          { x: 0, y: 2 },
          { x: 2, y: 2 }
        ],
        []
      )
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 2, y: 0 }
    ]);
  });
  it("includes a nested child polygon without reading descendants at viewport time", () => {
    const child = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 2 }
    ];
    const result = buildRenderConcaveHull(
      [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 2 }
      ],
      [child]
    );
    expect(result).toContainEqual({ x: 3, y: 1 });
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});
