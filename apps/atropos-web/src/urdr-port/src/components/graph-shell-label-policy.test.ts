import { expect, it } from "vitest";
import { applyCompositeLabelVisibilityPolicy, formatCompositeDisplayLabel } from "./graph-shell-label-policy";

const label = "임진왜란 초기 조선 수군의 연이은 해상 작전과 승리 국면";
it("preserves every Composite title character and suffix at every zoom level", () => {
  for (const bucket of ["near", "mid", "far"] as const) {
    expect(formatCompositeDisplayLabel({label}, bucket)).toBe(label);
    expect(applyCompositeLabelVisibilityPolicy([{
      id: "composite", label, depth: 2, footprint: 64, opacity: 1,
      labelX: 200, labelY: 200, labelAnchor: "middle", labelAngle: 0,
    }], bucket)).toEqual([{id: "composite", renderedLabel: label, showLabel: true, priorityScore: expect.any(Number)}]);
  }
});

it("resolves collisions by presence without substituting a shortened Composite title", () => {
  const result = applyCompositeLabelVisibilityPolicy(["first", "second"].map(id => ({
    id, label, depth: 1, footprint: 64, opacity: 1,
    labelX: 200, labelY: 200, labelAnchor: "middle" as const, labelAngle: 0,
  })), "far");
  expect(result.filter(entry => entry.showLabel)).toHaveLength(1);
  expect(result.find(entry => entry.showLabel)?.renderedLabel).toBe(label);
  // A compact point can remain eligible independently of hull collisions.
  expect(result.find(entry => !entry.showLabel)?.renderedLabel).toBe(label);
});
