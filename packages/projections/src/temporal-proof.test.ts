import { expect, it } from "vitest";
import { endpointKey, type TemporalConstraint } from "@moirai/domain";
import { temporalProofIndex } from "./temporal-proof.js";

// Frozen pre-IP004 proof: exact witnesses matter, not just reachability.
function original(
  constraints: readonly TemporalConstraint[],
  source: string,
  target: string,
  strict: boolean
) {
  const queue = [{ key: source, strict: false, ids: [] as string[] }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    if (current.key === target && (!strict || current.strict))
      return current.ids;
    const visit = `${current.key}:${current.strict}`;
    if (seen.has(visit)) continue;
    seen.add(visit);
    for (const edge of constraints) {
      const next =
        endpointKey(edge.source) === current.key
          ? edge.target
          : edge.type === "coincides" &&
              endpointKey(edge.target) === current.key
            ? edge.source
            : null;
      if (next)
        queue.push({
          key: endpointKey(next),
          strict: current.strict || edge.type === "precedes",
          ids: [...current.ids, edge.id]
        });
    }
  }
  return null;
}

it("preserves ordered shortest witnesses, strict cycles, coincidence and unreachable pairs", () => {
  let seed = 7183;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  const keys = Array.from({ length: 7 }, (_, i) => `event:e${i}`);
  for (let sample = 0; sample < 80; sample++) {
    const edges: TemporalConstraint[] = Array.from({ length: 18 }, (_, i) => ({
      id: `edge-${i}`,
      type: (["precedes", "not_after", "coincides"] as const)[random() % 3]!,
      source: { kind: "event", event_id: `e${random() % 7}` },
      target: { kind: "event", event_id: `e${random() % 7}` }
    }));
    const index = temporalProofIndex(edges);
    for (const source of keys) {
      const from = index.from(source);
      for (const target of keys) {
        expect(from(target)).toEqual(original(edges, source, target, false));
        expect(index.toStrict(target)(source)).toEqual(
          original(edges, source, target, true)
        );
      }
    }
  }
});
