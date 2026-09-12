/** Presentation repair for #57. Difference constraints are solved jointly, not independently clamped. */
export interface BoundedPoint {
  id: string;
  preferred: number;
  lower: number;
  upper: number;
}
export interface PlacementOrder {
  beforeId: string;
  afterId: string;
  minGapYears: number;
}

export function solveBoundedPlacement(
  points: readonly BoundedPoint[],
  orders: readonly PlacementOrder[]
) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const edges = orders.filter(
    (e) => byId.has(e.beforeId) && byId.has(e.afterId)
  );
  const next = new Map(points.map((p) => [p.id, [] as string[]]));
  const prev = new Map(points.map((p) => [p.id, [] as string[]]));
  for (const e of edges) {
    next.get(e.beforeId)!.push(e.afterId);
    prev.get(e.afterId)!.push(e.beforeId);
  }
  // Iterative Kosaraju: non-strict cycles/equality form one coordinate group.
  const seen = new Set<string>();
  const finish: string[] = [];
  for (const id of [...byId.keys()].sort()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const stack: { id: string; index: number }[] = [{ id, index: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const child = next.get(top.id)![top.index++];
      if (child === undefined) {
        finish.push(top.id);
        stack.pop();
      } else if (!seen.has(child)) {
        seen.add(child);
        stack.push({ id: child, index: 0 });
      }
    }
  }
  const groupOf = new Map<string, number>();
  const groups: {
    ids: string[];
    lower: number;
    upper: number;
    preferred: number;
    bad: boolean;
  }[] = [];
  for (const id of finish.reverse()) {
    if (groupOf.has(id)) continue;
    const index = groups.length;
    const ids: string[] = [];
    const stack = [id];
    groupOf.set(id, index);
    while (stack.length) {
      const current = stack.pop()!;
      ids.push(current);
      for (const parent of prev.get(current)!)
        if (!groupOf.has(parent)) {
          groupOf.set(parent, index);
          stack.push(parent);
        }
    }
    ids.sort();
    let lower = -Infinity,
      upper = Infinity,
      preferred = 0;
    let bad = false;
    for (const member of ids) {
      const p = byId.get(member)!;
      lower = Math.max(lower, p.lower);
      upper = Math.min(upper, p.upper);
      preferred += p.preferred / ids.length;
      bad ||=
        !Number.isFinite(p.preferred) ||
        Number.isNaN(p.lower) ||
        Number.isNaN(p.upper);
    }
    groups.push({ ids, lower, upper, preferred, bad });
  }
  const outgoing = groups.map(() => new Map<number, number>());
  const neighbors = groups.map(() => new Set<number>());
  const indegree = groups.map(() => 0);
  for (const e of edges) {
    const a = groupOf.get(e.beforeId)!,
      b = groupOf.get(e.afterId)!;
    if (a === b) {
      if (e.minGapYears > 0) groups[a]!.bad = true;
      continue;
    }
    if (!outgoing[a]!.has(b)) indegree[b]!++;
    outgoing[a]!.set(b, Math.max(outgoing[a]!.get(b) ?? 0, e.minGapYears));
    neighbors[a]!.add(b);
    neighbors[b]!.add(a);
  }
  const queue = groups.flatMap((_, i) => (indegree[i] === 0 ? [i] : []));
  const topo: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    topo.push(a);
    for (const b of outgoing[a]!.keys())
      if (--indegree[b]! === 0) queue.push(b);
  }
  // Reserve room for every successor before choosing any preferred coordinate.
  for (let i = topo.length - 1; i >= 0; i--) {
    const a = topo[i]!;
    for (const [b, gap] of outgoing[a]!)
      groups[a]!.upper = Math.min(groups[a]!.upper, groups[b]!.upper - gap);
  }
  const values = new Map<number, number>();
  for (const a of topo) {
    const g = groups[a]!;
    const value = Math.max(g.lower, Math.min(g.preferred, g.upper));
    g.bad ||= g.lower > g.upper || !Number.isFinite(value);
    values.set(a, value);
    for (const [b, gap] of outgoing[a]!)
      groups[b]!.lower = Math.max(groups[b]!.lower, value + gap);
  }
  // Do not report an apparently valid assignment in a contradictory connected group.
  // Unrelated groups remain drawable.
  const bad = new Set(groups.flatMap((g, i) => (g.bad ? [i] : [])));
  const badQueue = [...bad];
  for (let i = 0; i < badQueue.length; i++)
    for (const b of neighbors[badQueue[i]!]!)
      if (!bad.has(b)) {
        bad.add(b);
        badQueue.push(b);
      }
  const placed = new Map<string, number>();
  const unplaced: string[] = [];
  groups.forEach((g, i) => {
    for (const id of g.ids) {
      if (bad.has(i)) unplaced.push(id);
      else placed.set(id, values.get(i)!);
    }
  });
  return { placed, unplaced: unplaced.sort() };
}
