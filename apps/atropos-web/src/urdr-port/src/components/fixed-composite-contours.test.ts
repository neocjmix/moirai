import { expect, it } from "vitest";
import { fixedCompositeContextMetrics, fixedCompositeLabelRing, fixedCompositePath } from "./fixed-composite-contours";

const left = [{x: 0, y: 10}, {x: 10, y: 10}, {x: 10, y: 90}, {x: 0, y: 90}];
const right = left.map(point => ({x: point.x + 90, y: point.y}));
const size = {width: 100, height: 100};

it("does not turn the empty middle of disconnected fragments into HUD coverage", () => {
  expect(fixedCompositeContextMetrics([left, right], size).centerDistance).toBeCloseTo(0.4);
  expect([left, right]).toContain(fixedCompositeLabelRing([left, right], size));
  expect(fixedCompositePath([left, right]).match(/M/g)).toHaveLength(2);
});

it("preserves every serialized vertex without decimal rounding", () => {
  const precise = left.map(point => ({x: point.x + 0.123456789, y: point.y}));
  expect(fixedCompositePath([precise])).toContain("M0.123456789 10");
  expect(fixedCompositePath([])).toBe("");
});
