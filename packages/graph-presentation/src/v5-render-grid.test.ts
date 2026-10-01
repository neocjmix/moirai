import { describe, expect, it } from "vitest";
import {
  V5_RENDER_SPATIAL_FRAME,
  renderTileAddresses,
  renderTileBounds,
  renderTileKey,
  type RenderSpatialFrame
} from "./v5-render-grid.js";

const frame: RenderSpatialFrame = {
  format: "render-spatial-frame/1",
  originX: 0,
  originY: 0,
  baseSpanX: 16,
  baseSpanY: 8,
  minLevel: -4,
  maxLevel: 4
};

describe("fixed render spatial frame", () => {
  it("owns exact positive and negative boundaries on their positive side", () => {
    for (const [x, y, expectedX, expectedY] of [
      [0, 0, 0, 0],
      [16, 8, 1, 1],
      [-16, -8, -1, -1],
      [-0.001, -0.001, -1, -1]
    ]) {
      expect(
        renderTileAddresses(
          frame,
          { minX: x!, maxX: x!, minY: y!, maxY: y! },
          0
        )
      ).toEqual([{ level: 0, x: expectedX, y: expectedY }]);
    }
    expect(
      renderTileAddresses(frame, { minX: -16, maxX: 16, minY: -8, maxY: 8 }, 0)
    ).toEqual([
      { level: 0, x: -1, y: -1 },
      { level: 0, x: 0, y: -1 },
      { level: 0, x: -1, y: 0 },
      { level: 0, x: 0, y: 0 }
    ]);
  });

  it("nests cells around the fixed origin at signed levels", () => {
    for (const x of [-5, -1, 0, 1, 5])
      for (const y of [-3, -1, 0, 1, 3]) {
        const child = renderTileBounds(frame, { level: 1, x, y });
        const parent = renderTileBounds(frame, {
          level: 0,
          x: Math.floor(x / 2),
          y: Math.floor(y / 2)
        });
        expect(child.minX).toBeGreaterThanOrEqual(parent.minX);
        expect(child.maxX).toBeLessThanOrEqual(parent.maxX);
        expect(child.minY).toBeGreaterThanOrEqual(parent.minY);
        expect(child.maxY).toBeLessThanOrEqual(parent.maxY);
      }
    expect(renderTileBounds(frame, { level: -1, x: -1, y: 0 })).toEqual({
      minX: -32,
      maxX: 0,
      minY: 0,
      maxY: 16
    });
    expect(
      renderTileKey(
        { worldId: "w", revision: 1, timeSystemId: "t" },
        { level: -1, x: -2, y: 3 }
      )
    ).toBe("worlds/w/revisions/1/v5/render/t/-1/-2/3.json");
  });

  it("rejects invalid, unrepresentable and over-budget coverage before allocating it", () => {
    const bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    expect(() =>
      renderTileAddresses(frame, { ...bounds, maxX: Infinity }, 0)
    ).toThrow("render_viewport_invalid");
    expect(() => renderTileAddresses(frame, { ...bounds, minX: 2 }, 0)).toThrow(
      "render_viewport_invalid"
    );
    expect(() => renderTileAddresses(frame, bounds, -5)).toThrow(
      "render_level_invalid"
    );
    expect(() => renderTileAddresses(frame, bounds, 0.5)).toThrow(
      "render_level_invalid"
    );
    expect(() =>
      renderTileAddresses(frame, { ...bounds, maxX: 1e100 }, 0)
    ).toThrow("render_tile_address_invalid");
    expect(() =>
      renderTileAddresses(frame, { ...bounds, maxX: 100_000, maxY: 100_000 }, 0)
    ).toThrow("render_tile_budget_exceeded");
    expect(() =>
      renderTileAddresses({ ...frame, baseSpanX: 0 }, bounds, 0)
    ).toThrow("render_spatial_frame_invalid");
    expect(() =>
      renderTileBounds(frame, {
        level: 0,
        x: Number.MAX_SAFE_INTEGER + 1,
        y: 0
      })
    ).toThrow("render_tile_address_invalid");
    expect(Object.isFrozen(V5_RENDER_SPATIAL_FRAME)).toBe(true);
  });
});
