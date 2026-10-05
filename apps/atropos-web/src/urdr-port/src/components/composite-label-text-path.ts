import type { CompositeEdgeLabelPlacement } from "./graph-shell-region-geometry";

// Use the same font for native SVG paint and Canvas measurement. The average
// character width used for layout cannot bound wide Latin or shaped scripts.
export const COMPOSITE_LABEL_FONT = '700 13px Inter, "Segoe UI", Arial, sans-serif';

export function createCompositeLabelWidthMeasure(measure: (text: string) => number, capacity = 256) {
  const widths = new Map<string, number>();
  return {
    clear: () => widths.clear(),
    width(text: string) {
      const cached = widths.get(text);
      if (cached !== undefined) return cached;
      const measured = measure(text);
      // One em per code point is also a conservative fallback if Canvas is
      // unavailable. Measurement handles glyphs/ligatures wider than one em.
      const width = Math.max([...text].length * 13, Number.isFinite(measured) ? measured : 0);
      if (widths.size >= capacity) widths.delete(widths.keys().next().value!);
      if (capacity > 0) widths.set(text, width);
      return width;
    },
  };
}

/** SVG textPath drops glyphs beyond either endpoint. Continue the contour's
 * tangents so a short hull never becomes a character budget. Keep the extension
 * independent of pan and use the retained local frame when one is available.
 */
export function extendCompositeLabelTextPath(
  placement: CompositeEdgeLabelPlacement,
  labelWidth: number,
  labelHeight: number
): CompositeEdgeLabelPlacement {
  const points = placement.pathFrame?.points ?? placement.pathPoints;
  if (points.length < 2) return placement;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const next = points.find(point => Math.hypot(point.x - first.x, point.y - first.y) > 0.001);
  const prior = [...points].reverse().find(point => Math.hypot(point.x - last.x, point.y - last.y) > 0.001);
  if (!next || !prior) return placement;
  const length = points.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
  const padding = Math.max(0, labelWidth / 2) + labelHeight;
  const extend = (from: typeof first, toward: typeof first) => {
    const distance = Math.hypot(toward.x - from.x, toward.y - from.y);
    return {x: from.x + (from.x - toward.x) * padding / distance,
      y: from.y + (from.y - toward.y) * padding / distance};
  };
  const extended = [extend(first, next), ...points, extend(last, prior)];
  const offset = placement.pathFrame?.offset ?? {x: 0, y: 0};
  const start = placement.textPathStartOffset.endsWith("%")
    ? Number.parseFloat(placement.textPathStartOffset) / 100 * length
    : Number.parseFloat(placement.textPathStartOffset);
  return {
    ...placement,
    pathPoints: placement.pathFrame ? extended.map(point => ({x: point.x + offset.x, y: point.y + offset.y})) : extended,
    ...(placement.pathFrame ? {pathFrame: {points: extended, offset}} : {}),
    textPathStartOffset: String(start + padding),
  };
}
