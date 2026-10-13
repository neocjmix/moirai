import { expect, it } from "vitest";
import { fixedCompositeContextMetrics, fixedCompositeLabelRing, fixedCompositePath, fixedCompositeTracePath, fixedCompositeTraceMetrics, fixedCompoundVisible } from "./fixed-composite-contours";

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


it("keeps spine and membership paths open, with no edge across separate paths", () => {
  const first = [{x: 0.123456789, y: 0}, {x: 0.123456789, y: 100}];
  const next = [{x: 90, y: 100}, {x: 100, y: 100}];
  expect(fixedCompositeTracePath(first)).toBe("M0.123456789 0 L0.123456789 100");
  expect(fixedCompositeTracePath(next)).toBe("M90 100 L100 100");
  expect(fixedCompositeTracePath([])).toBe("");
  expect(fixedCompositeTracePath([first[0]!])).toBe("");
});

it("does not invent closing or inter-trace segments for visibility and HUD ranking", () => {
  // A closed polygon would contain the center; these authored edges do not.
  const trace = {kind: "spine" as const, points: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}]};
  const measured = fixedCompositeTraceMetrics([trace], size);
  expect(measured.centerDistance).toBe(0.5);
  expect(measured.viewportSpan).toBe(1);
  expect(measured.visible).toBe(true);
  expect(measured.labelPoint).toEqual({x: 50, y: 0});
  const separated = [
    {kind: "spine" as const, points: [{x: -10, y: -100}, {x: -10, y: 200}]},
    {kind: "membership" as const, eventId: "shared", points: [{x: 110, y: 200}, {x: 110, y: -100}]},
  ];
  expect(fixedCompositeTraceMetrics(separated, size)).toMatchObject({visible: false, centerDistance: 0.6});
  expect(fixedCompositeTraceMetrics([{kind: "route", points: [{x: -10, y: 91}, {x: 90, y: 191}]}], size).visible).toBe(false);
});


it("keeps holes empty for HUD visibility, center distance and outer-boundary labels", () => {
  const outer = [{x: -100, y: -100}, {x: 200, y: -100}, {x: 200, y: 200}, {x: -100, y: 200}];
  const hole = [{x: -10, y: -10}, {x: 110, y: -10}, {x: 110, y: 110}, {x: -10, y: 110}];
  expect(fixedCompositeContextMetrics([hole, outer], size, "evenodd").centerDistance).toBeCloseTo(0.6);
  expect(fixedCompoundVisible([hole, outer], size)).toBe(false);
  expect(fixedCompositeLabelRing([hole, outer], size, "evenodd")).toBe(outer);
  const narrowHole = hole.map(point => ({x: 20 + (point.x + 10) / 2, y: 20 + (point.y + 10) / 2}));
  expect(fixedCompoundVisible([outer, narrowHole], size)).toBe(true);
  expect(fixedCompositeContextMetrics([outer, narrowHole], size, "evenodd").centerDistance).toBeCloseTo(0.3);
  expect(fixedCompositeContextMetrics([hole, outer], size).centerDistance).toBe(0);
});
