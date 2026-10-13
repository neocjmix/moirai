export type ContourPoint = { x: number; y: number };

export function signedContourArea(points: readonly ContourPoint[]) {
  const origin = points[0] ?? { x: 0, y: 0 };
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return (
        sum +
        (point.x - origin.x) * (next.y - origin.y) -
        (next.x - origin.x) * (point.y - origin.y)
      );
    }, 0) / 2
  );
}

/** Boundary is distinct from inside so touching contours do not become holes. */
export function contourPointLocation(
  points: readonly ContourPoint[],
  point: ContourPoint
): -1 | 0 | 1 {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]!,
      b = points[i]!;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (
      cross === 0 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    )
      return 0;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < a.x + ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside ? 1 : -1;
}

/** Final simple boundaries are nested or disjoint. Orientation and input order
 * do not change even-odd fill; each even-depth ring owns its direct holes. */
export function compoundContourNesting(
  rings: readonly (readonly ContourPoint[])[]
) {
  const areas = rings.map((ring) => Math.abs(signedContourArea(ring)));
  const bounds = rings.map((ring) =>
    ring.reduce(
      (box, point) => ({
        minX: Math.min(box.minX, point.x),
        maxX: Math.max(box.maxX, point.x),
        minY: Math.min(box.minY, point.y),
        maxY: Math.max(box.maxY, point.y)
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    )
  );
  const parents = rings.map((ring, index) => {
    let parent = -1;
    for (let candidate = 0; candidate < rings.length; candidate++) {
      if (
        areas[candidate]! <= areas[index]! ||
        (parent !== -1 && areas[candidate]! >= areas[parent]!)
      )
        continue;
      const outer = bounds[candidate]!,
        inner = bounds[index]!;
      if (
        outer.minX > inner.minX ||
        outer.maxX < inner.maxX ||
        outer.minY > inner.minY ||
        outer.maxY < inner.maxY
      )
        continue;
      let location: number = 0;
      for (const point of ring) {
        location = contourPointLocation(rings[candidate]!, point);
        if (location !== 0) break;
      }
      if (location === 1) parent = candidate;
    }
    return parent;
  });
  const depths = parents.map((parent) => {
    let depth = 0;
    for (let ancestor = parent; ancestor !== -1; ancestor = parents[ancestor]!)
      depth++;
    return depth;
  });
  return { parents, depths, areas };
}

export function compoundContourContainsPoint(
  rings: readonly (readonly ContourPoint[])[],
  point: ContourPoint
) {
  return (
    rings.reduce(
      (count, ring) => count + (contourPointLocation(ring, point) >= 0 ? 1 : 0),
      0
    ) %
      2 ===
    1
  );
}
