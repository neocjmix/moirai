import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildOrganicSurfaces } from "./organic-surface";
import { candidateExperimentPrimitives } from "./tstl-experiment-client";
import { TSTL_EXPERIMENT_ASSET_URL } from "./tstl-experiment-pin";
import type { TstlExperimentArtifact } from "./tstl-experiment-types";

it("builds representative frozen r56 nested/shared/long-relation surfaces without changing source data", () => {
  const artifact = JSON.parse(
    readFileSync(`apps/atropos-web/public${TSTL_EXPERIMENT_ASSET_URL}`, "utf8")
  ) as TstlExperimentArtifact;
  const inspected = new Set([
    "01a107ff-8b3c-75eb-bc17-7166e9061e76", // shared Hansan
    "01a10a3f-05d2-73a0-84d4-bba33bbf662c", // long Relation, Jeongyu
    "01a10a3f-05d2-7981-94f4-08f3ea6433ec" // local nesting depth 1–5, Imjin
  ]);
  const primitives = candidateExperimentPrimitives(artifact, "anchored").filter(
    (primitive) =>
      primitive.entity.kind !== "composite" ||
      inspected.has(primitive.entity.id)
  );
  const input = JSON.stringify(primitives);
  const result = buildOrganicSurfaces({ primitives });
  expect(JSON.stringify(primitives)).toBe(input);
  expect(result.composites).toHaveLength(3);
  expect(result.diagnostics.nonmemberIntersections).toBe(0);
  expect(result.diagnostics.baseNonmemberIntersections).toBe(0);
  expect(result.diagnostics.baseVertices).toBeGreaterThan(1000);
  expect(result.diagnostics.baseComponents).toBe(3);
  expect(result.diagnostics.baseHoles).toBeGreaterThan(0);
  expect(result.diagnostics.paddedHoles).toBeGreaterThan(0);
  expect(result.composites.some((c) => c.paddingDepths.includes(5))).toBe(true);
  expect(
    result.composites.some((c) =>
      c.relationIds.includes("01a10817-869d-759e-88e5-fa3975c5eebd")
    )
  ).toBe(true);
  expect(result.composites.some((c) => c.paddingClearanceDeficitArea > 0)).toBe(
    true
  );
  for (const owner of result.composites) {
    expect(
      result.baseContoursByCompositeId[owner.compositeId]!.length
    ).toBeGreaterThan(0);
    for (const ring of result.paddedContoursByCompositeId[owner.compositeId]!)
      expect(
        ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      ).toBe(true);
  }
}, 30_000);
