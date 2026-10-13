/** Offline alignment after lane ordering, before regenerated region geometry.
 * Translate complete drawing episodes; never split or duplicate an Event.
 * Keep the relative order and gutters of every temporally overlapping episode.
 * Release empty-time band reservations, then minimize adjacent window-center
 * displacement with equal weights for every Composite (no importance scores).
 */
import type { TstlProjection } from "../../packages/graph-presentation/src/tstl-validator.js";
import type { TstlComparisonEvent } from "./candidate.js";
import { placeSemanticLanes } from "./semantic-lanes.js";

export function alignSemanticLanes(
  projection: TstlProjection,
  events: readonly TstlComparisonEvent[],
  preserveExclusiveAnchors = false
) {
  const initial = placeSemanticLanes(projection, events);
  const lanes = initial.lanes.map((lane) => ({ ...lane }));
  const shifts = lanes.map(() => 0);
  const laneById = new Map(
    lanes.flatMap((l, i) => l.eventIds.map((id) => [id, i] as const))
  );
  const byId = new Map(events.map((e) => [e.eventId, e]));
  const constraints = lanes.map(
    () => [] as { other: number; bound: number; lower: boolean }[]
  );
  for (let i = 0; i < lanes.length; i++)
    for (let j = i + 1; j < lanes.length; j++) {
      const a = lanes[i]!,
        b = lanes[j]!;
      if (a.minY >= b.maxY || b.minY >= a.maxY) continue;
      const [left, right] = a.minX < b.minX ? [i, j] : [j, i];
      const l = lanes[left]!,
        r = lanes[right]!;
      const gap = l.rootSignature.some((id) => r.rootSignature.includes(id))
        ? initial.parameters.peerGutter
        : initial.parameters.rootGutter;
      const bound = l.maxX + gap - r.minX;
      constraints[right]!.push({ other: left, bound, lower: true });
      constraints[left]!.push({ other: right, bound: -bound, lower: false });
    }
  const rows: { coefficients: Map<number, number>; residual: number }[] = [];
  for (const owner of [...projection.compositeIds].sort()) {
    const bins = new Map<number, string[]>();
    for (const id of projection.leafMembers[owner]!) {
      const bin = Math.floor(byId.get(id)!.sourceY / 100);
      if (!bins.has(bin)) bins.set(bin, []);
      bins.get(bin)!.push(id);
    }
    const entries = [...bins].sort(([a], [b]) => a - b);
    for (let i = 1; i < entries.length; i++) {
      const [previousBin, previous] = entries[i - 1]!,
        [bin, current] = entries[i]!;
      if (bin - previousBin > 3) continue;
      const coefficients = new Map<number, number>();
      let residual = 0;
      for (const [ids, sign] of [
        [previous, -1],
        [current, 1]
      ] as const)
        for (const id of ids) {
          const lane = laneById.get(id)!;
          coefficients.set(
            lane,
            (coefficients.get(lane) ?? 0) + sign / ids.length
          );
          residual += (sign * initial.positions[id]!) / ids.length;
        }
      rows.push({ coefficients, residual });
    }
  }
  const incident = lanes.map((_, i) =>
    rows.flatMap((row) => {
      const coefficient = row.coefficients.get(i) ?? 0;
      return Math.abs(coefficient) > 1e-12 ? [{ row, coefficient }] : [];
    })
  );
  const regularization = 0.005;
  const energy = () =>
    rows.reduce((sum, r) => sum + r.residual ** 2, 0) +
    lanes.reduce(
      (sum, l, i) =>
        sum + regularization * ((l.minX + l.maxX) / 2 + shifts[i]!) ** 2,
      0
    );
  const initialEnergy = energy();
  let sweeps = 0,
    maxMovement = Infinity;
  for (; sweeps < 500 && maxMovement > 1e-5; sweeps++) {
    maxMovement = 0;
    for (const i of lanes
      .map((_, i) => i)
      .sort((a, b) => (sweeps % 2 ? b - a : a - b))) {
      const anchored =
        preserveExclusiveAnchors && lanes[i]!.rootSignature.length === 1;
      let lower = anchored ? -20 : -Infinity,
        upper = anchored ? 20 : Infinity;
      for (const c of constraints[i]!) {
        const bound = shifts[c.other]! + c.bound;
        if (c.lower) lower = Math.max(lower, bound);
        else upper = Math.min(upper, bound);
      }
      const center = (lanes[i]!.minX + lanes[i]!.maxX) / 2 + shifts[i]!;
      let gradient = regularization * center,
        curvature = regularization;
      for (const { row, coefficient } of incident[i]!) {
        gradient += coefficient * row.residual;
        curvature += coefficient ** 2;
      }
      const next = Math.max(
        lower,
        Math.min(upper, shifts[i]! - gradient / curvature)
      );
      const delta = next - shifts[i]!;
      shifts[i] = next;
      for (const { row, coefficient } of incident[i]!)
        row.residual += coefficient * delta;
      maxMovement = Math.max(maxMovement, Math.abs(delta));
    }
  }
  const finalEnergy = energy();
  const positions = { ...initial.positions };
  lanes.forEach((l, i) => {
    l.minX += shifts[i]!;
    l.maxX += shifts[i]!;
    for (const id of l.eventIds) positions[id] = positions[id]! + shifts[i]!;
  });
  for (const id of projection.compositeIds) {
    const xs = projection.leafMembers[id]!.map((leaf) => positions[leaf]!).sort(
      (a, b) => a - b
    );
    positions[id] =
      (xs[Math.floor((xs.length - 1) / 2)]! + xs[Math.floor(xs.length / 2)]!) /
      2;
  }
  return {
    algorithmVersion: preserveExclusiveAnchors
      ? "exclusive-root-anchored-alignment/1"
      : "ordered-episode-coordinate-alignment/1",
    positions,
    lanes,
    width:
      Math.max(...lanes.map((l) => l.maxX)) -
      Math.min(...lanes.map((l) => l.minX)),
    diagnostics: {
      initialEnergy,
      finalEnergy,
      sweeps,
      maxMovement,
      converged: maxMovement <= 1e-5,
      regularization,
      preserveExclusiveAnchors,
      constraintPairs: constraints.flat().length / 2
    }
  };
}
