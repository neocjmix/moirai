import { expect, it } from "vitest";
import { retainPointPaint } from "./point-paint-presence";

it("fades exactly-zero semantic children before pruning instead of cutting off CSS opacity", () => {
  const point = {id: "event", opacity: 1, showLabel: true};
  expect(retainPointPaint<typeof point>([], [{...point, opacity: 0}], 0)).toEqual([]);
  const exit = retainPointPaint<typeof point>([point], [{...point, opacity: 0, showLabel: false}], 10);
  expect(exit).toEqual([{...point, opacity: 0, exitStartedAt: 10}]);
  expect(retainPointPaint(exit, [{...point, opacity: 0}], 100)[0]?.exitStartedAt).toBe(10);
  expect(retainPointPaint(exit, [{...point, opacity: 0}], 229)).toHaveLength(1);
  expect(retainPointPaint(exit, [{...point, opacity: 0}], 230)).toEqual([]);
});
it("reverses the same identity using current coordinates and a new exit deadline only after reentry", () => {
  const point = {id: "event", opacity: 1, x: 10};
  const exiting = retainPointPaint<typeof point>([point], [], 10);
  const returned = retainPointPaint(exiting, [{...point, x: 20}], 100);
  expect(returned).toEqual([{...point, x: 20}]);
  expect(retainPointPaint(returned, [], 150)[0]).toMatchObject({id: "event", x: 20, exitStartedAt: 150});
});
it("bounds removed candidates while preserving all incoming identities", () => {
  const old = Array.from({length: 300}, (_, i) => ({id: `old-${i}`, opacity: 1}));
  const current = Array.from({length: 128}, (_, i) => ({id: `current-${i}`, opacity: 1}));
  const result = retainPointPaint(old, current, 10);
  expect(result.filter(point => point.opacity === 0)).toHaveLength(160);
  expect(result.filter(point => point.opacity > 0)).toEqual(current);
  expect(new Set(result.map(point => point.id)).size).toBe(result.length);
});
