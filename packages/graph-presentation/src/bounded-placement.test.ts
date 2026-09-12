import { describe, expect, it } from "vitest";
import {
  solveBoundedPlacement,
  type BoundedPoint,
  type PlacementOrder
} from "./bounded-placement.js";
const point = (
  id: string,
  lower: number,
  upper: number,
  preferred = (lower + upper) / 2
): BoundedPoint => ({ id, lower, upper, preferred });
const edge = (
  beforeId: string,
  afterId: string,
  minGapYears = 0.001
): PlacementOrder => ({ beforeId, afterId, minGapYears });
function verify(points: BoundedPoint[], edges: PlacementOrder[]) {
  const result = solveBoundedPlacement(points, edges);
  expect(result.unplaced).toEqual([]);
  for (const p of points) {
    expect(result.placed.get(p.id)).toBeGreaterThanOrEqual(p.lower);
    expect(result.placed.get(p.id)).toBeLessThanOrEqual(p.upper);
  }
  for (const e of edges)
    expect(result.placed.get(e.afterId)!).toBeGreaterThanOrEqual(
      result.placed.get(e.beforeId)! + e.minGapYears
    );
  expect(
    solveBoundedPlacement([...points].reverse(), [...edges].reverse())
  ).toEqual(result);
  return result.placed;
}
describe("joint bounded temporal placement", () => {
  it("repairs nested/overlapping intervals without independent clamp breaking strict order", () => {
    verify(
      [point("a", 2004, 2006, 2000.8), point("b", 2000, 2010, 2009.2)],
      [edge("a", "b")]
    );
    verify(
      [point("a", 4, 6, 6), point("b", 4, 6, 4), point("c", 5, 8, 5)],
      [edge("a", "b"), edge("b", "c")]
    );
  });
  it("reserves room for a fixed successor across multiple clusters", () => {
    const placed = verify(
      [point("a", 0, 10, 9), point("b", 0, 10, 9), point("anchor", 2, 2)],
      [edge("a", "b"), edge("b", "anchor")]
    );
    expect(placed.get("anchor")).toBe(2);
  });
  it("solves equality and non-strict cycles as one coordinate", () => {
    const placed = verify(
      [point("a", 2, 6), point("b", 4, 8), point("c", 4, 4)],
      [edge("a", "b", 0), edge("b", "a", 0), edge("b", "c", 0)]
    );
    expect(placed.get("a")).toBe(placed.get("b"));
    expect(placed.get("b")).toBe(4);
  });
  it("supports disjoint ordered intervals and one-sided bounds", () => {
    verify(
      [point("a", -Infinity, 2, 1), point("b", 5, Infinity, 6)],
      [edge("a", "b")]
    );
  });
  it.each([
    [[point("a", 5, 6), point("b", 0, 4)], [edge("a", "b")]],
    [
      [point("a", 0, 1), point("b", 0, 1)],
      [edge("a", "b"), edge("b", "a", 0)]
    ],
    [
      [point("a", 0, 1), point("b", 2, 3)],
      [edge("a", "b", 0), edge("b", "a", 0)]
    ],
    [[point("a", 1, 1), point("b", 1, 1)], [edge("a", "b")]]
  ] as [BoundedPoint[], PlacementOrder[]][])(
    "isolates an infeasible component and retains unrelated data",
    (points, edges) => {
      const result = solveBoundedPlacement(
        [...points, point("other", 10, 10)],
        edges
      );
      expect(result.unplaced).toEqual(["a", "b"]);
      expect([...result.placed]).toEqual([["other", 10]]);
    }
  );
  it("handles a long ordering chain without recursive stack growth", () => {
    const points = Array.from({ length: 10000 }, (_, i) =>
      point(String(i).padStart(5, "0"), 0, 10000, i)
    );
    const edges = points.slice(1).map((p, i) => edge(points[i]!.id, p.id));
    expect(solveBoundedPlacement(points, edges).placed.size).toBe(10000);
  });
});
