export interface ContextCandidate {
  id: string;
  label: string;
  coverage: number;
  visible: boolean;
  centerInside: boolean;
  supportComplete: boolean;
  contains: readonly string[];
}

export const CONTEXT_DWELL_MS = 250;

/** HUD orientation is independent of painted area and opacity. A lone visible
 * linear Composite is a topic too; related ancestors yield to descendants. */
export function selectGraphContext(
  candidates: readonly ContextCandidate[],
  previousId: string | null = null
): ContextCandidate | null {
  const byId = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const eligible = candidates.filter(
    (candidate) => candidate.supportComplete && candidate.visible
  );
  const hasDescendant = (parent: ContextCandidate, target: string) => {
    const pending = [...parent.contains];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (id === target) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      pending.push(...(byId.get(id)?.contains ?? []));
    }
    return false;
  };
  const specific = eligible.filter(
    (candidate) =>
      !eligible.some(
        (other) =>
          other.id !== candidate.id && hasDescendant(candidate, other.id)
      )
  );
  if (specific.length === 1) return specific[0]!;
  const central = specific.filter((candidate) => candidate.centerInside);
  if (central.length === 1) return central[0]!;
  // Retain a still-visible topic during ambiguous navigation, never choose by
  // input order or by filled area. New ambiguous views remain World-only.
  return specific.find((candidate) => candidate.id === previousId) ?? null;
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
