import type { PointRenderDensity } from "./point-density-display";

export const COMPOSITE_COMPACT_THRESHOLD_PX = 12;
export const COMPOSITE_COMPACT_HYSTERESIS_PX = 8;
export const COMPOSITE_HULL_FADE_PX = 8;
export const COMPOSITE_BORDERLESS_SPAN_PX = 32;
export const COMPOSITE_BORDER_FADE_PX = 12;
export const COMPOSITE_BORDERLESS_FILL_SCALE = 0.62;
export const COMPOSITE_SMALL_POINT_SPAN_PX = 6;
export const COMPOSITE_ORDINARY_POINT_SPAN_PX = 10;
export const COMPOSITE_HIDDEN_SPAN_PX = 1;
export const COMPOSITE_VISIBLE_POINT_SPAN_PX = 3;
export const COMPOSITE_CHILD_FADE_START_PX = 16;
export const COMPOSITE_CHILD_REVEAL_SPAN_PX = 40;

export const compositeSmooth = (value: number) => {
  const progress = Math.max(0, Math.min(1, value));
  return progress * progress * (3 - 2 * progress);
};

export function compositeScreenBounds(points: readonly { x: number; y: number }[]) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { point: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, span: Math.max(maxX - minX, maxY - minY) };
}

/** Screen-only representation; the center is not a canonical Time Event.
 * Hysteresis chooses label/interaction ownership; paint is reversible by scale. */
export function compositePointDisplay(
  points: readonly { x: number; y: number }[],
  wasCompact = false
): { x: number; y: number } | null {
  const bounds = compositeScreenBounds(points);
  if (!bounds) return null;
  return bounds.span <= COMPOSITE_COMPACT_THRESHOLD_PX + (wasCompact ? COMPOSITE_COMPACT_HYSTERESIS_PX : 0)
    ? bounds.point : null;
}

/** One authored identity supplies all paints, including on a cold restore.
 * Geometry may arrive asynchronously, but the pending point never disappears
 * before the replacement hull is ready. The borderless band keeps a readable
 * colored area while making nested regions less heavy. */
export function compositeRepresentationDisplay(
  points: readonly { x: number; y: number }[],
  hullPending = false
) {
  const bounds = compositeScreenBounds(points);
  if (!bounds) return null;
  const {span, point} = bounds;
  const degenerate = span <= Number.EPSILON;
  const hullOpacity = hullPending ? 0 : compositeSmooth((span - COMPOSITE_COMPACT_THRESHOLD_PX) / COMPOSITE_HULL_FADE_PX);
  const hullStrokeOpacity = hullPending ? 0 : compositeSmooth((span - COMPOSITE_BORDERLESS_SPAN_PX) / COMPOSITE_BORDER_FADE_PX);
  const ordinaryWeight = degenerate ? 1 : compositeSmooth((span - COMPOSITE_SMALL_POINT_SPAN_PX) / (COMPOSITE_ORDINARY_POINT_SPAN_PX - COMPOSITE_SMALL_POINT_SPAN_PX));
  const visibility = degenerate ? 1 : compositeSmooth((span - COMPOSITE_HIDDEN_SPAN_PX) / (COMPOSITE_VISIBLE_POINT_SPAN_PX - COMPOSITE_HIDDEN_SPAN_PX));
  return {
    point,
    span,
    degenerate,
    hullOpacity,
    hullStrokeOpacity,
    hullFillOpacity: COMPOSITE_BORDERLESS_FILL_SCALE + (1 - COMPOSITE_BORDERLESS_FILL_SCALE) * hullStrokeOpacity,
    pointOpacity: 1 - hullOpacity,
    pointScale: 0.35 + 0.65 * ordinaryWeight,
    pointVisibility: visibility,
    pointLabelOpacity: ordinaryWeight,
    childrenOpacity: hullPending ? 0 : compositeSmooth((span - COMPOSITE_CHILD_FADE_START_PX) / (COMPOSITE_CHILD_REVEAL_SPAN_PX - COMPOSITE_CHILD_FADE_START_PX)),
  };
}

/** Density budgets labels, while the Composite's own screen span owns its
 * hull → large point → small point → hidden sequence. Rank cannot suppress a
 * point just as it replaces its hull. Small points have no pale rim obscuring
 * their authored Composite color. */
export function compositePointDensityDisplay(
  representation: ReturnType<typeof compositeRepresentationDisplay>,
  density?: PointRenderDensity,
) {
  // Co-located authored children have no measurable support span at any zoom.
  // Keep that Composite as a density-budgeted point instead of hiding forever.
  const scale = representation?.degenerate ? density?.pointScale ?? 1 : representation?.pointScale ?? 1;
  const opacity = representation?.degenerate ? density?.opacity ?? 1 : representation?.pointVisibility ?? 1;
  const labelOpacity = (representation?.pointLabelOpacity ?? 1) * opacity * (density?.labelOpacity ?? 1);
  return {
    radius: 6 * scale,
    strokeWidth: scale < 0.999 ? 0 : 1.8 * (representation?.pointLabelOpacity ?? 1),
    opacity,
    labelOpacity,
    showLabel: labelOpacity > 0,
    interactive: opacity > 0 && labelOpacity >= 0.99,
    state: opacity === 0 ? "hidden" : scale < 0.999 ? "small-point" : "point",
  } as const;
}
