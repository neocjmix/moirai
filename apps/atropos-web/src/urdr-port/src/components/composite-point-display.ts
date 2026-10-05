export const COMPOSITE_COMPACT_THRESHOLD_PX = 20;
export const COMPOSITE_COMPACT_HYSTERESIS_PX = 8;
export const COMPOSITE_HULL_FADE_PX = 8;
export const COMPOSITE_BORDERLESS_SPAN_PX = 36;
export const COMPOSITE_BORDER_FADE_PX = 12;

const smooth = (value: number) => {
  const progress = Math.max(0, Math.min(1, value));
  return progress * progress * (3 - 2 * progress);
};

/** Screen-only representation; the center is not a canonical Time Event.
 * Separate enter/exit thresholds prevent flicker during a small pinch. */
export function compositePointDisplay(
  points: readonly { x: number; y: number }[],
  wasCompact = false
): { x: number; y: number } | null {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const threshold = COMPOSITE_COMPACT_THRESHOLD_PX + (wasCompact ? COMPOSITE_COMPACT_HYSTERESIS_PX : 0);
  if (maxX - minX > threshold || maxY - minY > threshold) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** One authored identity supplies both paints through the scale boundary. The
 * existing hysteresis still chooses label/interaction ownership; paint blends
 * continuously and independently so reversing a pinch does not switch shapes.
 */
export function compositeRepresentationDisplay(
  points: readonly { x: number; y: number }[],
  hullPending = false
) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const hullOpacity = hullPending ? 0 : smooth((span - COMPOSITE_COMPACT_THRESHOLD_PX) / COMPOSITE_HULL_FADE_PX);
  // Let a small Composite keep its colored area after its outline disappears.
  // This band is separate from the later area/point blend in both zoom directions.
  const hullStrokeOpacity = hullPending ? 0 : smooth((span - COMPOSITE_BORDERLESS_SPAN_PX) / COMPOSITE_BORDER_FADE_PX);
  return {
    point: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    hullOpacity,
    hullStrokeOpacity,
    pointOpacity: 1 - hullOpacity,
  };
}
