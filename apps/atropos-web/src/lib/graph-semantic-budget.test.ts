import { expect, it } from "vitest";
import {
  selectSemanticLabels,
  type SemanticCandidate
} from "./graph-semantic-budget";

const viewport = { width: 390, height: 844 };
const candidate = (
  id: string,
  x: number,
  y: number,
  selected = false
): SemanticCandidate => ({ id, x, y, width: 64, height: 20, selected });
it("shares one budget across point and Composite labels without modifying geometry", () => {
  const input = Array.from({ length: 40 }, (_, i) =>
    candidate(
      `${i % 2 ? "region" : "point"}:${i}`,
      10 + (i % 4) * 90,
      90 + Math.floor(i / 4) * 65
    )
  );
  const original = structuredClone(input);
  const result = selectSemanticLabels(input, viewport, new Set());
  expect(result.budget).toBe(11);
  expect(result.ids.size).toBe(11);
  expect(input).toEqual(original);
});
it("prioritizes selection over a colliding retained label and reserves navigation chrome", () => {
  const result = selectSemanticLabels(
    [
      candidate("region", 40, 120),
      candidate("point", 40, 120, true),
      candidate("hud", 0, 20),
      candidate("footer", 40, 790),
      candidate("clipped", 380, 200)
    ],
    viewport,
    new Set(["region"])
  );
  expect([...result.ids]).toEqual(["point"]);
});
it("keeps admitted labels under small navigation and ignores input order", () => {
  const input = Array.from({ length: 24 }, (_, i) =>
    candidate(String(i), 10 + (i % 3) * 110, 95 + Math.floor(i / 3) * 70)
  );
  const before = selectSemanticLabels(input, viewport, new Set());
  const after = selectSemanticLabels(
    [...input].reverse().map((c) => ({ ...c, y: c.y + 1 })),
    viewport,
    before.ids
  );
  expect([...after.ids].sort()).toEqual([...before.ids].sort());
});
