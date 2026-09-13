import { endpointKey, type TemporalConstraint } from "@moirai/domain";

type Edge = { to: string; strict: boolean; id: string };
type Step = {
  key: string;
  strict: boolean;
  parent: Step | null;
  id: string | null;
};
const stateKey = (key: string, strict: boolean) => `${key}:${strict}`;
const path = (step: Step): string[] => {
  const ids: string[] = [];
  for (let current = step; current.parent; current = current.parent)
    ids.push(current.id!);
  return ids.reverse();
};

/** Per-projection adjacency, never a cross-World or cross-Revision cache.
 * Preserves the original BFS's shortest path and constraint-order tie breaking. */
export function temporalProofIndex(constraints: readonly TemporalConstraint[]) {
  const outgoing = new Map<string, Edge[]>();
  const reverse = new Map<string, string[]>();
  const add = (from: string, to: string, strict: boolean, id: string) => {
    const edges = outgoing.get(from) ?? [];
    edges.push({ to, strict, id });
    outgoing.set(from, edges);
    for (const previousStrict of [false, true]) {
      const target = stateKey(to, previousStrict || strict);
      const sources = reverse.get(target) ?? [];
      sources.push(stateKey(from, previousStrict));
      reverse.set(target, sources);
    }
  };
  for (const edge of constraints) {
    const source = endpointKey(edge.source),
      target = endpointKey(edge.target);
    add(source, target, edge.type === "precedes", edge.id);
    if (edge.type === "coincides" && source !== target)
      add(target, source, false, edge.id);
  }
  return {
    // One traversal for the fixed start of a composite, released after it.
    from(source: string) {
      const queue: Step[] = [
        { key: source, strict: false, parent: null, id: null }
      ];
      const seen = new Set<string>();
      const first = new Map<string, Step>();
      for (let i = 0; i < queue.length; i++) {
        const step = queue[i]!;
        if (!first.has(step.key)) first.set(step.key, step);
        const state = stateKey(step.key, step.strict);
        if (seen.has(state)) continue;
        seen.add(state);
        for (const edge of outgoing.get(step.key) ?? [])
          queue.push({
            key: edge.to,
            strict: step.strict || edge.strict,
            parent: step,
            id: edge.id
          });
      }
      return (target: string) => {
        const step = first.get(target);
        return step ? path(step) : null;
      };
    },
    // Reverse distances let every candidate reach the fixed strict end without
    // repeated BFS. Reconstruct forward using the original ordered adjacency.
    toStrict(target: string) {
      const end = stateKey(target, true);
      const distances = new Map<string, number>([[end, 0]]);
      const queue = [end];
      for (let i = 0; i < queue.length; i++) {
        const state = queue[i]!;
        for (const previous of reverse.get(state) ?? []) {
          if (distances.has(previous)) continue;
          distances.set(previous, distances.get(state)! + 1);
          queue.push(previous);
        }
      }
      return (source: string): string[] | null => {
        let key = source,
          strict = false;
        let distance = distances.get(stateKey(key, strict));
        if (distance === undefined) return null;
        const ids: string[] = [];
        while (distance > 0) {
          const next = (outgoing.get(key) ?? []).find(
            (edge) =>
              distances.get(stateKey(edge.to, strict || edge.strict)) ===
              distance! - 1
          );
          if (!next) throw Error("temporal_proof_distance_inconsistent");
          ids.push(next.id);
          key = next.to;
          strict ||= next.strict;
          distance--;
        }
        return ids;
      };
    }
  };
}
