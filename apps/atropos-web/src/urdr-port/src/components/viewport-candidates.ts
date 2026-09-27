import type { WorldBounds, ViewportSize } from "./chart-surface";
import type { ImageViewportView } from "./image-viewport";

export function worldBoundsForScreenBounds(
  bounds: WorldBounds,
  view: ImageViewportView,
  size: ViewportSize
): WorldBounds {
  const x1 = (bounds.minX - size.width / 2 - view.x) / view.scaleX;
  const x2 = (bounds.maxX - size.width / 2 - view.x) / view.scaleX;
  const y1 = (bounds.minY - size.height / 2 - view.y) / view.scaleY;
  const y2 = (bounds.maxY - size.height / 2 - view.y) / view.scaleY;
  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2)
  };
}

/** Indexed per response, never over the revisit cache. Candidate order is stable. */
export function createWorldPointQuery<
  T extends { id: string; x: number; y: number }
>(points: readonly T[]) {
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const byId = new Map(points.map((point) => [point.id, point]));
  return {
    byId,
    query(bounds: WorldBounds): T[] {
      let low = 0,
        high = sorted.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (sorted[mid]!.y < bounds.minY) low = mid + 1;
        else high = mid;
      }
      const result: T[] = [];
      for (let i = low; i < sorted.length && sorted[i]!.y <= bounds.maxY; i++) {
        const point = sorted[i]!;
        if (point.x >= bounds.minX && point.x <= bounds.maxX)
          result.push(point);
      }
      return result;
    }
  };
}

/** Keep crossing segments even when both endpoints are outside the viewport. */
export function segmentIntersectsBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: WorldBounds
) {
  return (
    Math.max(start.x, end.x) >= bounds.minX &&
    Math.min(start.x, end.x) <= bounds.maxX &&
    Math.max(start.y, end.y) >= bounds.minY &&
    Math.min(start.y, end.y) <= bounds.maxY
  );
}
