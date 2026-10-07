/** Bottom-up authored nesting at each Y interval, independent of camera and
 * loaded descendants. Overlapping siblings contribute a maximum, never a sum. */
export type CompositePaddingBand = Readonly<{
  minY: number;
  maxY: number;
  depth: number;
}>;
export type CompositePaddingProfile = readonly CompositePaddingBand[];

export function buildCompositePaddingProfile(
  bounds: Readonly<{ minY: number; maxY: number }>,
  children: readonly CompositePaddingProfile[]
): CompositePaddingBand[] {
  if (
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxY) ||
    bounds.minY > bounds.maxY
  )
    return [];
  const childBands = children
    .flat()
    .filter(
      (band) =>
        Number.isFinite(band.minY) &&
        Number.isFinite(band.maxY) &&
        Number.isSafeInteger(band.depth) &&
        band.depth > 0 &&
        band.minY <= band.maxY &&
        band.maxY >= bounds.minY &&
        band.minY <= bounds.maxY
    );
  const changes = new Map<number, { starts: number[]; ends: number[] }>();
  const at = (y: number) => {
    const value = changes.get(y) ?? { starts: [], ends: [] };
    changes.set(y, value);
    return value;
  };
  at(bounds.minY);
  at(bounds.maxY);
  for (const band of childBands) {
    at(Math.max(bounds.minY, band.minY)).starts.push(band.depth);
    at(Math.min(bounds.maxY, band.maxY)).ends.push(band.depth);
  }
  const ys = [...changes.keys()].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  let maximum = 0;
  const result: CompositePaddingBand[] = [];
  const append = (band: CompositePaddingBand) => {
    const previous = result.at(-1);
    if (previous?.depth === band.depth && previous.maxY === band.minY) {
      result[result.length - 1] = { ...previous, maxY: band.maxY };
    } else result.push(band);
  };
  for (let index = 0; index < ys.length; index++) {
    const y = ys[index]!;
    const next = ys[index + 1];
    const change = changes.get(y)!;
    for (const depth of change.starts) {
      counts.set(depth, (counts.get(depth) ?? 0) + 1);
      maximum = Math.max(maximum, depth);
    }
    const pointDepth = maximum + 1;
    for (const depth of change.ends) {
      const count = counts.get(depth)! - 1;
      if (count > 0) counts.set(depth, count);
      else counts.delete(depth);
    }
    if (!counts.has(maximum)) {
      maximum = 0;
      for (const depth of counts.keys()) maximum = Math.max(maximum, depth);
    }
    const intervalDepth = next === undefined ? 0 : maximum + 1;
    // Keep a zero-height nested Composite, and closed interval endpoints.
    if (pointDepth > Math.max(result.at(-1)?.depth ?? 0, intervalDepth))
      append({ minY: y, maxY: y, depth: pointDepth });
    if (next !== undefined)
      append({ minY: y, maxY: next, depth: intervalDepth });
  }
  return result.length
    ? result
    : [{ minY: bounds.minY, maxY: bounds.maxY, depth: 1 }];
}
