/** Drawing diagnostics, not perceptual or semantic certification. */
import type { TstlProjection } from "../../packages/graph-presentation/src/tstl-validator.js";
export function separationMetrics(
  projection: TstlProjection,
  events: readonly { id: string; y: number }[],
  positions: Readonly<Record<string, number>>,
  binSize = 100
) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const roots = projection.compositeIds.filter(
    (id) => projection.parents[id]!.length === 0
  );
  const peers = new Map<string, readonly [string, string]>();
  for (const siblings of [
    roots,
    ...projection.compositeIds.map((id) =>
      projection.children[id]!.filter((id) =>
        projection.compositeIds.includes(id)
      )
    )
  ])
    for (let i = 0; i < siblings.length; i++)
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i]!,
          b = siblings[j]!;
        if (
          projection.ancestors[a]!.includes(b) ||
          projection.ancestors[b]!.includes(a)
        )
          continue;
        peers.set(JSON.stringify([a, b].sort()), [a, b]);
      }
  const bins = new Map<number, string[]>();
  for (const id of projection.leafIds) {
    const bin = Math.floor(byId.get(id)!.y / binSize);
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin)!.push(id);
  }
  let overlappingPeerWindows = 0,
    activePeerWindows = 0,
    totalOverlapWidth = 0;
  for (const [a, b] of peers.values())
    for (const ids of bins.values()) {
      const exclusive = (owner: string, other: string) =>
        ids
          .filter(
            (id) =>
              projection.ancestors[id]!.includes(owner) &&
              !projection.ancestors[id]!.includes(other)
          )
          .map((id) => positions[id]!);
      const aa = exclusive(a, b),
        bb = exclusive(b, a);
      if (!aa.length || !bb.length) continue;
      activePeerWindows++;
      const overlap =
        Math.min(Math.max(...aa) + 2.5, Math.max(...bb) + 2.5) -
        Math.max(Math.min(...aa) - 2.5, Math.min(...bb) - 2.5);
      if (overlap > 0) {
        overlappingPeerWindows++;
        totalOverlapWidth += overlap;
      }
    }
  let centerTravel = 0,
    transitions = 0;
  for (const owner of projection.compositeIds) {
    let previous: { bin: number; x: number } | null = null;
    for (const [bin, ids] of [...bins].sort(([a], [b]) => a - b)) {
      const xs = ids
        .filter((id) => projection.ancestors[id]!.includes(owner))
        .map((id) => positions[id]!);
      if (!xs.length) continue;
      const x = xs.reduce((n, v) => n + v, 0) / xs.length;
      if (previous && bin - previous.bin <= 3) {
        centerTravel += Math.abs(x - previous.x);
        transitions++;
      }
      previous = { bin, x };
    }
  }
  const xs = projection.leafIds.map((id) => positions[id]!);
  let nominalCollisions = 0;
  for (let i = 0; i < projection.leafIds.length; i++)
    for (let j = i + 1; j < projection.leafIds.length; j++) {
      const a = projection.leafIds[i]!,
        b = projection.leafIds[j]!;
      if (
        Math.abs(byId.get(a)!.y - byId.get(b)!.y) * 0.2 < 5 &&
        Math.abs(positions[a]! - positions[b]!) < 5
      )
        nominalCollisions++;
    }
  return {
    binSize,
    peerPairs: peers.size,
    activePeerWindows,
    overlappingPeerWindows,
    totalOverlapWidth,
    meanCenterTravel: transitions ? centerTravel / transitions : 0,
    transitions,
    leafWidth: Math.max(...xs) - Math.min(...xs),
    nominalCollisions,
    definition:
      "Peers share a direct contains parent or are roots, excluding ancestry. Per 100-source-unit window, compare their exclusive leaf envelopes with nominal half-width 2.5. Travel is mean center change across at most three bins. These proxies do not measure human comprehension, true region overlap, labels, or all independent-axis zooms."
  };
}
