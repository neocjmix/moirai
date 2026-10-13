import { contextViewportMetrics } from "../../../lib/graph-context-policy";
import type { GraphShellPreparedWorldTrace } from "../../shared/contracts";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** Serialize each closed fragment independently: no spline, rounding, padding,
 * or edge connecting distinct fragments is introduced by the product renderer. */
export function fixedCompositePath(rings: readonly (readonly Point[])[]) {
  return rings.filter((ring) => ring.length >= 3).map((ring) =>
    ring.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ") + " Z"
  ).join(" ");
}

export function contourArea(points: readonly Point[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return area + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

/** One label remains attached to one actual fragment, never an invented bridge. */
export function fixedCompositeLabelRing(rings: readonly Point[][], size: Size): Point[] {
  const visible = rings.filter((ring) => ring.length && Math.max(...ring.map(point => point.x)) >= 0 && Math.min(...ring.map(point => point.x)) <= size.width && Math.max(...ring.map(point => point.y)) >= 0 && Math.min(...ring.map(point => point.y)) <= size.height);
  return [...(visible.length ? visible : rings)].sort((a, b) => contourArea(b) - contourArea(a))[0] ?? [];
}

export function fixedCompositeContextMetrics(rings: readonly (readonly Point[])[], size: Size) {
  const measured = rings.map((ring) => contextViewportMetrics(ring, size));
  return {
    centerDistance: Math.min(2, ...measured.map((value) => value.centerDistance)),
    viewportSpan: Math.max(0, ...measured.map((value) => value.viewportSpan))
  };
}

/** Open polylines never acquire a closing edge, even when they share an owner. */
export function fixedCompositeTracePath(points: readonly Point[]) {
  return points.length < 2 ? "" : points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

/** Liang–Barsky clipping checks real segments, including diagonal traces. */
function traceSegmentVisible(a: Point, b: Point, size: Size) {
  let start = 0, end = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x], [dx, size.width - a.x], [-dy, a.y], [dy, size.height - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return false;
  }
  return true;
}

/** Measure only authored open segments. Treating flattened traces as a polygon
 * would invent edges, center containment and HUD priority between fragments. */
export function fixedCompositeTraceMetrics(traces: readonly GraphShellPreparedWorldTrace[], size: Size) {
  let centerDistance = 2, viewportSpan = 0, visible = false;
  let labelPoint: Point | undefined;
  if (size.width <= 0 || size.height <= 0) return {centerDistance, viewportSpan, visible, labelPoint};
  for (const trace of traces) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of trace.points) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }
    viewportSpan = Math.max(viewportSpan, (maxX - minX) / size.width, (maxY - minY) / size.height);
    for (let i = 1; i < trace.points.length; i++) {
      const a = trace.points[i - 1]!, b = trace.points[i]!;
      const measured = contextViewportMetrics([a, b], size);
      visible ||= traceSegmentVisible(a, b, size);
      if (!labelPoint || measured.centerDistance < centerDistance) {
        centerDistance = measured.centerDistance;
        const dx = (b.x - a.x) / size.width, dy = (b.y - a.y) / size.height;
        const length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((0.5 - a.x / size.width) * dx + (0.5 - a.y / size.height) * dy) / length)) : 0;
        labelPoint = {x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)};
      }
    }
  }
  return {centerDistance, viewportSpan, visible, labelPoint};
}
