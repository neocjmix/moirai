import { expect, it } from "vitest";
import { areaD, FillRule, intersectD } from "clipper2-ts";
import { expandCompositePolygon } from "./composite-local-padding";
import { createCompositePanGeometryCache } from "./composite-pan-geometry";
import { DEFAULT_COMPOSITE_SPLINE_TUNING as tuning } from "./graph-shell-region-geometry";

const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 400 }, { x: 0, y: 400 }];
const profile = [
  { minY: 0, maxY: 150, depth: 1 },
  { minY: 150, maxY: 250, depth: 3 },
  { minY: 250, maxY: 400, depth: 1 }
];
function widthAt(polygon: { x: number; y: number }[], y: number) {
  const xs = polygon.flatMap((a, index) => {
    const b = polygon[(index + 1) % polygon.length]!;
    if (a.y === b.y || y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) return [];
    return [a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)];
  });
  return Math.max(...xs) - Math.min(...xs);
}
it("only widens the nested Y section and contains all the original support", () => {
  const expanded = expandCompositePolygon(points, profile);
  expect(widthAt(expanded, 50)).toBeCloseTo(122, 2);
  expect(widthAt(expanded, 200)).toBeCloseTo(142, 2);
  expect(widthAt(expanded, 350)).toBeCloseTo(122, 2);
  const covered = intersectD([expanded], [points], FillRule.NonZero, 3).reduce((area, path) => area + Math.abs(areaD(path)), 0);
  expect(covered).toBeCloseTo(40_000, 2);
  expect(expandCompositePolygon(points.toReversed(), profile).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
});
it("retains a zero-height nested Composite without widening distant sections", () => {
  const expanded = expandCompositePolygon(points, [
    { minY: 0, maxY: 200, depth: 1 }, { minY: 200, maxY: 200, depth: 3 }, { minY: 200, maxY: 400, depth: 1 }
  ]);
  expect(widthAt(expanded, 50)).toBeCloseTo(122, 2);
  expect(widthAt(expanded, 200)).toBeCloseTo(142, 2);
});
it("preserves restored local padding through pans and independent axis zoom", () => {
  const cache = createCompositePanGeometryCache();
  const request = { id: "life", points, padding: 21, paddingProfile: profile, view: { x: 0, y: 0, scaleX: 1, scaleY: 1 }, viewport: { width: 390, height: 700 }, tuning };
  const original = cache.project(request);
  const restored = cache.project({ ...request, paddingProfile: JSON.parse(JSON.stringify(profile)), view: { ...request.view, x: 17, y: -9 } });
  expect(restored.path).toBe(original.path);
  expect(restored.projectedPoints).toEqual(original.projectedPoints.map((point) => ({ x: point.x + 17, y: point.y - 9 })));
  expect(cache.inspect()).toMatchObject({ builds: 1, hits: 1 });
  const zoomed = cache.project({ ...request, view: { ...request.view, scaleX: 2, scaleY: 0.5 } });
  expect(widthAt(zoomed.projectedPoints, 375)).toBeCloseTo(222, 2);
  expect(widthAt(zoomed.projectedPoints, 450)).toBeCloseTo(242, 2);
  cache.project({ ...request, paddingProfile: profile.map((band) => ({ ...band, depth: 1 })) });
  expect(cache.inspect()).toMatchObject({ builds: 3, hits: 1 });
});
