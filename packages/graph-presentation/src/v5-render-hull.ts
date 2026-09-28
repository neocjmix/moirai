type Point = Readonly<{ x: number; y: number }>;
const snap = (value: number) => Number(value.toFixed(3));
function dedupe(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const next = { x: snap(point.x), y: snap(point.y) };
    if (result.at(-1)?.x !== next.x || result.at(-1)?.y !== next.y)
      result.push(next);
  }
  if (
    result.length > 1 &&
    result[0]!.x === result.at(-1)!.x &&
    result[0]!.y === result.at(-1)!.y
  )
    result.pop();
  return result;
}
function convex(points: readonly Point[]): Point[] {
  const sorted = [
    ...new Map(
      points.map((point) => [
        `${snap(point.x)},${snap(point.y)}`,
        { x: snap(point.x), y: snap(point.y) }
      ])
    ).values()
  ].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const point of sorted) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0)
      lower.pop();
    lower.push(point);
  }
  for (const point of sorted.toReversed()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0)
      upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function intersections(polygon: readonly Point[], y: number): number[] {
  const values: number[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!,
      b = polygon[(index + 1) % polygon.length]!;
    if (Math.abs(a.y - b.y) < 0.000001) {
      if (Math.abs(a.y - y) < 0.000001) values.push(a.x, b.x);
      continue;
    }
    if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
    values.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  return [...new Set(values.map(snap))].sort((a, b) => a - b);
}

/** Same world-coordinate Y-sweep rule as Atropos's default concave hull.
 * Child polygons are prepared bottom-up at publication time. */
export function buildRenderConcaveHull(
  direct: readonly Point[],
  childPolygons: readonly (readonly Point[])[]
): Point[] {
  const flattened = dedupe([...direct, ...childPolygons.flat()]);
  if (flattened.length < 3) return flattened;
  const ys = [...new Set(direct.map((point) => snap(point.y)))].sort(
    (a, b) => a - b
  );
  if (ys.length < 3) return convex(flattened);
  const byY = new Map<number, number[]>();
  for (const point of direct) {
    const y = snap(point.y),
      xs = byY.get(y) ?? [];
    xs.push(point.x);
    byY.set(y, xs);
  }
  const bands = ys.map((y) => {
    const xs = [...(byY.get(y) ?? [])];
    for (const polygon of childPolygons) xs.push(...intersections(polygon, y));
    xs.sort((a, b) => a - b);
    return { y, leftX: xs[0]!, rightX: xs.at(-1)! };
  });
  const polygon = dedupe([
    ...bands.map((band) => ({ x: band.leftX, y: band.y })),
    ...bands.toReversed().map((band) => ({ x: band.rightX, y: band.y }))
  ]);
  return polygon.length >= 3 &&
    polygon.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
    )
    ? polygon
    : convex(flattened);
}
