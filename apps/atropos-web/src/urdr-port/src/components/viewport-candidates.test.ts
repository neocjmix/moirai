import { expect, it } from "vitest";
import {
  createWorldPointQuery,
  segmentIntersectsBounds,
  worldBoundsForScreenBounds
} from "./viewport-candidates";
import { projectWorldPoint } from "./chart-surface";
import { resolveCompositeEdgeLabelPlacement } from "./graph-shell-region-geometry";

const points = Array.from({ length: 1600 }, (_, i) => ({
  id: String(i),
  x: ((i * 37) % 1600) - 800,
  y: ((i * 91) % 1600) - 800
}));
const size = { width: 390, height: 844 };

it("queries inverse bounds before projection, preserving point boundaries under independent axes", () => {
  const index = createWorldPointQuery(points);
  for (const scaleX of [0.2, 1, 4])
    for (const scaleY of [0.3, 2, 7]) {
      const view = { x: 17, y: -39, scaleX, scaleY };
      const screen = {
        minX: -16,
        maxX: size.width + 16,
        minY: -16,
        maxY: size.height + 16
      };
      const bounds = worldBoundsForScreenBounds(screen, view, size);
      const expected = points
        .filter((point) => {
          const p = projectWorldPoint(view, size, point);
          return (
            p.x >= screen.minX &&
            p.x <= screen.maxX &&
            p.y >= screen.minY &&
            p.y <= screen.maxY
          );
        })
        .map((p) => p.id)
        .sort();
      expect(
        index
          .query(bounds)
          .map((p) => p.id)
          .sort()
      ).toEqual(expected);
    }
});

it("retains crossing edges with both endpoints outside and rejects distant edges before projection", () => {
  const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  expect(
    segmentIntersectsBounds({ x: -100, y: 0 }, { x: 100, y: 0 }, bounds)
  ).toBe(true);
  expect(
    segmentIntersectsBounds({ x: -100, y: 5 }, { x: 100, y: 5 }, bounds)
  ).toBe(false);
  expect(segmentIntersectsBounds({ x: 1, y: 1 }, { x: 1, y: 1 }, bounds)).toBe(
    true
  );
});

it("indexed label neighborhoods produce the same placement and hysteresis as projecting every point", () => {
  const index = createWorldPointQuery(points);
  let candidateCount = 0,
    queries = 0;
  for (const scaleX of [0.3, 1, 3])
    for (const scaleY of [0.4, 1, 4]) {
      const view = { x: 0, y: 0, scaleX, scaleY };
      const projected = points
        .map((p) => projectWorldPoint(view, size, p))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const query = (bounds: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      }) => {
        const candidates = index.query(
          worldBoundsForScreenBounds(bounds, view, size)
        );
        candidateCount += candidates.length;
        queries++;
        return candidates.map((p) => projectWorldPoint(view, size, p));
      };
      for (const polygon of [
        [
          { x: 10, y: 20 },
          { x: 360, y: 20 },
          { x: 360, y: 800 },
          { x: 10, y: 800 }
        ],
        [
          { x: -100, y: -80 },
          { x: 800, y: 0 },
          { x: 100, y: 400 },
          { x: 800, y: 950 },
          { x: -100, y: 950 }
        ]
      ]) {
        const full = resolveCompositeEdgeLabelPlacement(
          polygon,
          144,
          18,
          size,
          8,
          4,
          projected
        );
        expect(
          resolveCompositeEdgeLabelPlacement(
            polygon,
            144,
            18,
            size,
            8,
            4,
            query
          )
        ).toEqual(full);
        expect(
          resolveCompositeEdgeLabelPlacement(
            polygon,
            144,
            18,
            size,
            8,
            4,
            query,
            full
          )
        ).toEqual(
          resolveCompositeEdgeLabelPlacement(
            polygon,
            144,
            18,
            size,
            8,
            4,
            projected,
            full
          )
        );
      }
    }
  expect(queries).toBeGreaterThan(0);
  expect(candidateCount).toBeLessThan((queries * points.length) / 4);
});
