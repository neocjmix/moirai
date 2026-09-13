import { expect, it } from "vitest";
import {
  resolveCompositeEdgeLabelPlacement as resolve,
  type CompositeEdgeLabelPlacement
} from "./graph-shell-region-geometry";
const polygon = (x: number) => [
  { x: x - 80, y: 170 },
  { x: x + 80, y: 170 },
  { x: x + 80, y: 330 },
  { x: x - 80, y: 330 }
];
const place = (x: number, previous?: CompositeEdgeLabelPlacement) =>
  resolve(polygon(x), 72, 14, { width: 500, height: 500 }, 10, 6, [], previous);
it("retains the committed edge across repeated threshold crossings while coordinates follow the graph", () => {
  expect(place(249).edgeIndex).not.toBe(place(251).edgeIndex);
  let previous = place(249);
  for (const x of [251, 249, 255, 248, 261, 251]) {
    const next = place(x, previous);
    expect(next.edgeIndex).toBe(1);
    expect(next.labelX).toBeCloseTo(x + 93);
    previous = next;
  }
});
it("switches after leaving the dead band and requires the reverse margin to switch back", () => {
  let previous = place(249);
  previous = place(263, previous);
  expect(previous.edgeIndex).toBe(3);
  for (const x of [251, 249, 245]) {
    previous = place(x, previous);
    expect(previous.edgeIndex).toBe(3);
  }
  expect(place(237, previous).edgeIndex).toBe(1);
});
it("releases an offscreen edge and ignores history from changed polygon topology", () => {
  const previous = place(249);
  expect(place(420, previous).edgeIndex).toBe(place(420).edgeIndex);
  expect(place(251, { ...previous, pointCount: 3 })).toEqual(place(251));
});
