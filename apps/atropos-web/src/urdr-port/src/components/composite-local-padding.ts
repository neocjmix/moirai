import { areaD, FillRule, intersectD, unionD } from "clipper2-ts";
import type { CompositePaddingProfile } from "@moirai/graph-presentation/composite-padding-profile";
import type { ViewportCoordinate } from "./graph-shell-composite";
import { expandPolygon } from "./graph-shell-region-geometry";

const paddingAtDepth = (depth: number) => 6 + Math.max(1, depth) * 5;
const positive = (points: ViewportCoordinate[]) => areaD(points) < 0 ? [...points].reverse() : points;

/** Apply screen-space margins only where authored descendants are nested.
 * Expanding and joining the Y slices gives rounded transitions at depth changes,
 * while the base contour prevents seams and retains every source support point. */
export function expandCompositePolygon(
  points: ViewportCoordinate[],
  profile: CompositePaddingProfile
): ViewportCoordinate[] {
  if (!points.length) return [];
  const base = expandPolygon(points, paddingAtDepth(1));
  const bounds = points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x), maxX: Math.max(box.maxX, point.x),
    minY: Math.min(box.minY, point.y), maxY: Math.max(box.maxY, point.y)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const extras = profile.filter((band) => band.depth > 1 && band.maxY >= bounds.minY && band.minY <= bounds.maxY);
  if (!extras.length) return base;
  if (profile.length === 1) return expandPolygon(points, paddingAtDepth(profile[0]!.depth));
  const patches = [positive(base)];
  for (const band of extras) {
    const minY = Math.max(band.minY, bounds.minY), maxY = Math.min(band.maxY, bounds.maxY);
    if (minY === maxY || points.length < 3 || Math.abs(areaD(points)) < 0.000001) {
      // A Composite may contain only simultaneous or collinear descendants.
      // Intersect each segment with the closed Y slab instead of dropping it as
      // a zero-area polygon in Clipper.
      const support: ViewportCoordinate[] = [];
      for (let index = 0; index < points.length; index++) {
        const a = points[index]!, b = points[(index + 1) % points.length]!;
        if (a.y >= minY && a.y <= maxY) support.push(a);
        for (const y of minY === maxY ? [minY] : [minY, maxY]) {
          if (a.y === b.y || y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
          support.push({ x: a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y), y });
        }
      }
      const unique = [...new Map(support.map((point) => [`${point.x},${point.y}`, point])).values()];
      if (unique.length) patches.push(positive(expandPolygon(unique, paddingAtDepth(band.depth))));
    } else {
      const slices = intersectD([points], [[
        { x: bounds.minX - 1, y: minY }, { x: bounds.maxX + 1, y: minY },
        { x: bounds.maxX + 1, y: maxY }, { x: bounds.minX - 1, y: maxY }
      ]], FillRule.NonZero, 3);
      for (const slice of slices) patches.push(positive(expandPolygon(slice, paddingAtDepth(band.depth))));
    }
  }
  return unionD(patches, [], FillRule.NonZero, 3)
    .sort((a, b) => Math.abs(areaD(b)) - Math.abs(areaD(a)))[0] ?? base;
}
