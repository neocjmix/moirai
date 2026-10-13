import { contextViewportMetrics } from "../../../lib/graph-context-policy";

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
