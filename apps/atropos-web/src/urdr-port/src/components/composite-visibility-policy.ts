/** Screen-only stage policy. Time/Y extent dominates; a wide but temporally
 * flat hull must not keep every descendant visible merely because of X layout. */
export const COMPOSITE_HORIZONTAL_STAGE_WEIGHT = 0.2;
export const COMPOSITE_PARENT_STAGE_SCALE = 1.35;
export const COMPOSITE_DEGENERATE_STAGE_SPAN_PX = 12;

export function compositeStageSpan(width: number, height: number): number {
  return Math.max(Math.abs(height), Math.abs(width) * COMPOSITE_HORIZONTAL_STAGE_WEIGHT);
}

export type CompositeHierarchyStage = {
  id: string;
  span: number;
  childIds: readonly string[];
};

/** Parents remain one scale interval behind their children when zooming out.
 * Authored ancestry wins over inconsistent or incomplete published bounds.
 * Missing children do not create synthetic geometry or unbounded reads. */
export function resolveCompositeHierarchySpans(nodes: readonly CompositeHierarchyStage[]): Map<string, number> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const spans = new Map<string, number>();
  const active = new Set<string>();
  const resolve = (id: string): number => {
    const done = spans.get(id);
    if (done !== undefined) return done;
    const node = byId.get(id);
    if (!node) return 0;
    const own = Math.max(0, Number.isFinite(node.span) ? node.span : 0);
    // Canonical contains is acyclic. A malformed legacy display closure must
    // still terminate rather than expand its scale forever.
    if (active.has(id)) return own;
    active.add(id);
    let span = own;
    for (const childId of node.childIds) {
      if (childId === id || !byId.has(childId) || active.has(childId)) continue;
      span = Math.max(span, resolve(childId) * COMPOSITE_PARENT_STAGE_SCALE);
    }
    active.delete(id);
    spans.set(id, span);
    return span;
  };
  for (const node of nodes) resolve(node.id);
  const parents = new Map<string, string[]>();
  for (const node of nodes) for (const childId of node.childIds) {
    if (node.id === childId || !byId.has(childId)) continue;
    const ids = parents.get(childId) ?? [];
    ids.push(node.id);
    parents.set(childId, ids);
  }
  const resolvingVirtual = new Set<string>();
  const resolveVirtual = (id: string): number => {
    const own = spans.get(id) ?? 0;
    if (own > 0) return own;
    if (resolvingVirtual.has(id)) return COMPOSITE_DEGENERATE_STAGE_SPAN_PX;
    resolvingVirtual.add(id);
    const ancestors = (parents.get(id) ?? []).filter(parent => !resolvingVirtual.has(parent));
    const span = ancestors.length
      ? Math.min(...ancestors.map(parent => resolveVirtual(parent) / COMPOSITE_PARENT_STAGE_SCALE))
      : COMPOSITE_DEGENERATE_STAGE_SPAN_PX;
    resolvingVirtual.delete(id);
    spans.set(id, span);
    return span;
  };
  // Co-located authored children have no geometric scale at any zoom. Borrow
  // a bounded display span from every parent, instead of leaving the child
  // permanently opaque after its parent disappears. A root stays a plain dot.
  for (const node of nodes) resolveVirtual(node.id);
  return spans;
}

/** Point descendants finish their normal→small→hidden handoff while their
 * parent still has a visible point. Composite descendants use their own
 * complete size sequence, not this multiplier. */
export function compositeLeafChildrenOpacity(parentSpan: number): number {
  const t = Math.max(0, Math.min(1, (parentSpan - 4) / 12));
  return t * t * (3 - 2 * t);
}

const STAGE_SPANS = [0, 1, 3, 6, 10, 12, 20, 32, 44] as const;
const stagePosition = (span: number) => {
  for (let index = 1; index < STAGE_SPANS.length; index++) {
    if (span <= STAGE_SPANS[index]!) return index - 1 + (span - STAGE_SPANS[index - 1]!) / (STAGE_SPANS[index]! - STAGE_SPANS[index - 1]!);
  }
  return STAGE_SPANS.length - 1;
};
const stageSpan = (position: number) => {
  const index = Math.min(STAGE_SPANS.length - 2, Math.max(0, Math.floor(position)));
  return STAGE_SPANS[index]! + (STAGE_SPANS[index + 1]! - STAGE_SPANS[index]!) * (position - index);
};

/** Large camera jumps still traverse the authored paint bands. A bounded
 * visual clock animates only representation; geometry/labels track the real
 * camera every frame. Fresh/cold scenes use their final scale immediately. */
export function advanceCompositeStageSpan(previous: number | undefined, target: number, elapsedMs: number, reducedMotion = false) {
  if (previous === undefined || reducedMotion) return {span: target, active: false};
  const from = stagePosition(previous);
  const to = stagePosition(target);
  if (Math.abs(to - from) < 0.0001) return {span: target, active: false};
  const step = Math.max(0, Math.min(48, elapsedMs)) / 50;
  if (Math.abs(to - from) <= step) return {span: target, active: false};
  return {span: stageSpan(from + Math.sign(to - from) * step), active: true};
}
