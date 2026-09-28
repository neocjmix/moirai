export interface ContextCandidate {
  id: string;
  label: string;
  coverage: number;
  visible: boolean;
  centerInside: boolean;
  supportComplete: boolean;
  contains: readonly string[];
  centerDistance: number;
  viewportSpan: number;
}

export const CONTEXT_DWELL_MS = 250;

/** Relative orientation ranking, never a confidence threshold. Missing support
 * lowers evidence quality but does not erase an otherwise visible topic. */
export function rankGraphContexts(
  candidates: readonly ContextCandidate[],
  previousId: string | null = null
): (ContextCandidate & { score: number })[] {
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const visible = candidates.filter((candidate) => candidate.visible);
  const ancestors = new Map<string, number>();
  for (const parent of visible) {
    const pending = [...parent.contains];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (id !== parent.id) ancestors.set(id, (ancestors.get(id) ?? 0) + 1);
      pending.push(...(byId.get(id)?.contains ?? []));
    }
  }
  const maxAncestors = Math.max(
    1,
    ...visible.map((candidate) => ancestors.get(candidate.id) ?? 0)
  );
  return visible
    .map((candidate) => {
      const distance = Number.isFinite(candidate.centerDistance)
        ? Math.max(0, candidate.centerDistance)
        : 2;
      const span = Number.isFinite(candidate.viewportSpan)
        ? Math.max(0.001, candidate.viewportSpan)
        : 1000;
      const proximity = 1 / (1 + distance * 2);
      const scaleFit = Math.min(span, 1 / span);
      const specificity = (ancestors.get(candidate.id) ?? 0) / maxAncestors;
      const score =
        0.55 * proximity +
        0.25 * scaleFit +
        0.15 * specificity +
        (candidate.supportComplete ? 0.05 : 0) +
        (candidate.id === previousId ? 0.04 : 0);
      return { ...candidate, score };
    })
    .sort(
      (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}

export function selectGraphContext(
  candidates: readonly ContextCandidate[],
  previousId: string | null = null
): ContextCandidate | null {
  return rankGraphContexts(candidates, previousId)[0] ?? null;
}

/** Distance to actual projected edges, not filled area. Long thin shapes are
 * therefore as viable as broad ones at the same navigation scale. */
export function contextViewportMetrics(
  points: readonly { x: number; y: number }[],
  size: { width: number; height: number }
) {
  if (!points.length || size.width <= 0 || size.height <= 0)
    return { centerDistance: 2, viewportSpan: 0 };
  const normalized = points.map((p) => ({
    x: p.x / size.width,
    y: p.y / size.height
  }));
  let distance = Infinity;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  normalized.forEach((a, i) => {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
    const b = normalized[(i + 1) % normalized.length]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(0, Math.min(1, ((0.5 - a.x) * dx + (0.5 - a.y) * dy) / length))
      : 0;
    distance = Math.min(
      distance,
      Math.hypot(a.x + t * dx - 0.5, a.y + t * dy - 0.5)
    );
  });
  return {
    centerDistance: polygonContainsCenter(points, size) ? 0 : distance,
    viewportSpan: Math.max(maxX - minX, maxY - minY)
  };
}

export function polygonContainsCenter(
  points: readonly { x: number; y: number }[],
  size: { width: number; height: number }
): boolean {
  const x = size.width / 2;
  const y = size.height / 2;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
