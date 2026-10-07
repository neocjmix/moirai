import type { RenderPrimitive } from "./v5-render-publication.js";

/** Admit complete available authored ancestry within the existing paint budget.
 * Unknown parents may be outside a selected Collection; callers never fetch a
 * graph to complete this closure. Ancestors precede children, including when a
 * selected child is the first requested candidate. */
export function selectRenderPrimitiveClosure<T extends RenderPrimitive>(
  ordered: readonly T[],
  capacity: number,
  options: { available?: readonly T[]; already?: readonly T[] } = {}
): T[] {
  if (capacity <= 0) return [];
  const already = options.already ?? [];
  const available = new Map(
    [...already, ...(options.available ?? ordered)].map((item) => [
      item.entity.id,
      item
    ])
  );
  const admitted = new Set(already.map((item) => item.entity.id));
  const result: T[] = [];
  const closures = new Map<string, readonly T[] | null>();
  const limit = Math.max(0, capacity) + admitted.size;
  const parents = (item: T) =>
    [
      ...new Set([
        ...(item.parentCompositeIds ?? []),
        ...(item.ancestorCompositeIds ?? [])
      ])
    ]
      .sort()
      .flatMap((id) => {
        const parent = available.get(id);
        return parent ? [parent] : [];
      });
  for (const candidate of ordered) {
    if (result.length >= capacity) break;
    if (admitted.has(candidate.entity.id)) continue;
    const visiting = new Set<string>();
    const stack = [{ item: candidate, exit: false }];
    while (stack.length) {
      const { item, exit } = stack.pop()!;
      const id = item.entity.id;
      if (closures.has(id)) continue;
      const dependencies = parents(item);
      if (exit) {
        const bundle = new Map<string, T>();
        let fits = true;
        for (const parent of dependencies) {
          const closure = closures.get(parent.entity.id);
          if (!closure) {
            fits = false;
            break;
          }
          for (const ancestor of closure)
            bundle.set(ancestor.entity.id, ancestor);
          if (bundle.size >= limit) {
            fits = false;
            break;
          }
        }
        bundle.set(id, item);
        closures.set(
          id,
          fits && bundle.size <= limit ? [...bundle.values()] : null
        );
        visiting.delete(id);
      } else {
        if (visiting.has(id)) throw Error("render_admission_contains_cycle");
        visiting.add(id);
        stack.push({ item, exit: true });
        for (const parent of dependencies.toReversed())
          if (!closures.has(parent.entity.id))
            stack.push({ item: parent, exit: false });
      }
    }
    const bundle = closures.get(candidate.entity.id);
    if (!bundle) continue;
    const missing = bundle.filter((item) => !admitted.has(item.entity.id));
    if (result.length + missing.length > capacity) continue;
    for (const item of missing) {
      result.push(item);
      admitted.add(item.entity.id);
    }
  }
  return result;
}
