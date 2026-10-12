import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { diagnoseBaseline, HISTORY_COMPOSITES } from "./validate-baseline.js";
import type { BaselineArtifact } from "./baseline.js";
const baseline = JSON.parse(
  readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
) as BaselineArtifact;
it("checks actual r56 country signatures, Imjin hierarchy and B0 negative diagnostics without certifying scalar hulls", () => {
  const result = diagnoseBaseline(baseline);
  const { korea, japan, china } = HISTORY_COMPOSITES;
  const count = (atoms: typeof result.oracle.kjcAtoms, ids: string[]) =>
    atoms.find((a) => a.compositeIds.join() === [...ids].sort().join())?.count;
  expect(result.oracle).toMatchObject({
    events: 539,
    composites: 109,
    leaves: 430,
    imjinLeaves: 93,
    imjinChinaSharedLeaves: 29
  });
  expect(result.oracle.imjinDirectParents).toEqual([korea, japan].sort());
  expect(count(result.oracle.kjcAtoms, [korea])).toBe(87);
  expect(count(result.oracle.kjcAtoms, [japan])).toBe(71);
  expect(count(result.oracle.kjcAtoms, [china])).toBe(45);
  expect(count(result.oracle.kjcAtoms, [korea, japan])).toBe(112);
  expect(count(result.oracle.kjcAtoms, [korea, china])).toBe(83);
  expect(count(result.oracle.kjcAtoms, [japan, china])).toBe(3);
  expect(count(result.oracle.kjcAtoms, [korea, japan, china])).toBe(29);
  expect(count(result.oracle.kjAtoms, [korea, japan])).toBe(141);
  expect(result.geometryLevel).toBe("UNRESOLVED");
  expect(result.semanticFillEligible).toBe(false);
  expect(result.temporal.sourceYPreserved).toBe(true);
  expect(result.geometry.exactCertifiedHulls).toBe(0);
  expect(result.centerNecessaryConditionDiagnostics.testedPairs).toBe(
    430 * 109
  );
  expect(
    result.centerNecessaryConditionDiagnostics.nonmemberInclusions
  ).toBeGreaterThan(0);
});
