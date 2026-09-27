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
  const threshold = wasCompact ? 48 : 32;
  if (maxX - minX > threshold || maxY - minY > threshold) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
