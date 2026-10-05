import { expect, it } from "vitest";
import {
  selectSemanticLabels,
  semanticTextWidth,
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
  expect(result.budget).toBe(14);
  expect(result.ids.size).toBe(14);
  expect(input).toEqual(original);
});
it("prioritizes selection over a colliding retained label without hiding screen-edge text", () => {
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
  expect(result.ids).toEqual(new Set(["point", "hud", "footer", "clipped"]));
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

it("admits a long mobile title through the viewport edge without modifying it", () => {
  const title = "[A5 실험 01] 항구의 교역 — 모임 1";
  const width = semanticTextWidth(title);
  for (const x of [205, 380, -width + 1]) {
    const input = { id: "point", x, y: 240, width, height: 32, selected: true };
    expect(
      selectSemanticLabels([input], viewport, new Set()).ids.has("point")
    ).toBe(true);
    expect(input).toEqual({
      id: "point",
      x,
      y: 240,
      width,
      height: 32,
      selected: true
    });
  }
});

it("keeps partially visible labels at all four edges and removes only wholly offscreen text", () => {
  const input = [
    candidate("left", -63, 200),
    candidate("right", 389, 250),
    candidate("top", 50, -19),
    candidate("bottom", 100, 843),
    candidate("off-left", -64, 300),
    candidate("off-right", 390, 350),
    candidate("off-top", 150, -20),
    candidate("off-bottom", 200, 844)
  ];
  expect(selectSemanticLabels(input, viewport, new Set()).ids).toEqual(
    new Set(["left", "right", "top", "bottom"])
  );
});

it("allows a modestly tighter label density while keeping actual overlaps suppressed", () => {
  expect(
    selectSemanticLabels(
      [
        candidate("one", 40, 200),
        candidate("next", 40, 225),
        candidate("overlap", 40, 202)
      ],
      viewport,
      new Set(["one"])
    ).ids
  ).toEqual(new Set(["one", "next"]));
});
