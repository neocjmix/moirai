type PointPaint = { id: string; opacity: number; showLabel?: boolean };
export type RetainedPointPaint<T extends PointPaint> = T & { exitStartedAt?: number };
// CSS fades for180ms; allow the first browser paint before pruning its node.
export const POINT_PAINT_FADE_MS = 220;

/** Retain paint, never interaction or semantic label candidacy. Exact-zero
 * child suppression and omitted candidates need the same lifetime as the CSS
 * opacity transition. Deadlines survive fresh responses and rapid reversals.
 */
export function retainPointPaint<T extends PointPaint>(
  previous: readonly RetainedPointPaint<T>[],
  incoming: readonly T[],
  now: number,
  maxExiting = 160,
): RetainedPointPaint<T>[] {
  const oldById = new Map(previous.map(point => [point.id, point]));
  const nextById = new Map(incoming.map(point => [point.id, point]));
  const active: RetainedPointPaint<T>[] = [];
  const exiting: RetainedPointPaint<T>[] = [];
  for (const point of nextById.values()) {
    if (point.opacity > 0) {
      active.push(point);
      continue;
    }
    const old = oldById.get(point.id);
    if (!old) continue; // Never mount initially invisible semantic children.
    const exitStartedAt = old.exitStartedAt ?? now;
    if (now < exitStartedAt + POINT_PAINT_FADE_MS)
      exiting.push({...point, showLabel: old.showLabel, exitStartedAt});
  }
  for (const point of previous) {
    if (nextById.has(point.id)) continue;
    const exitStartedAt = point.exitStartedAt ?? now;
    if (now < exitStartedAt + POINT_PAINT_FADE_MS)
      exiting.push({...point, opacity: 0, exitStartedAt});
  }
  // Bound rapid coverage changes independently of World size. Prefer the exits
  // that started most recently; the current visible budget is never reduced.
  exiting.sort((a, b) => b.exitStartedAt! - a.exitStartedAt! || a.id.localeCompare(b.id));
  return [...active, ...exiting.slice(0, maxExiting)];
}
