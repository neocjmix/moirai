import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { candidateExperimentPrimitives } from "./tstl-experiment-client";
import {
  TSTL_EXPERIMENT_ASSET_URL,
  TSTL_EXPERIMENT_SHA256
} from "./tstl-experiment-pin";
import type { TstlExperimentArtifact } from "./tstl-experiment-types";
import {
  organicExperimentGeometry,
  organicReproduction,
  restoreOrganicReproduction,
  parseOrganicReproduction
} from "./organic-experiment";
import {
  DEFAULT_ORGANIC_PARAMETERS,
  ORGANIC_SURFACE_VERSION,
  type OrganicSurfaceResult
} from "./organic-surface";

const artifact = JSON.parse(
  readFileSync(`apps/atropos-web/public${TSTL_EXPERIMENT_ASSET_URL}`, "utf8")
) as TstlExperimentArtifact;
it.each([
  "B0",
  "bubble",
  "ribbon",
  "anchored",
  "lanes",
  "aligned",
  "A",
  "B",
  "C"
] as const)(
  "changes only Composite ink over exact frozen %s data",
  (baseline) => {
    const frozen =
      baseline === "B0"
        ? artifact.b0Primitives
        : candidateExperimentPrimitives(artifact, baseline);
    const before = JSON.stringify(frozen);
    const contours = Object.fromEntries(
      frozen
        .filter((p) => p.composite?.anchor)
        .map((p) => {
          const { x, y } = p.composite!.anchor!;
          return [
            p.entity.id,
            [
              [
                { x: x - 8, y: y - 30 },
                { x: x + 8, y: y - 30 },
                { x: x + 8, y: y + 30 },
                { x: x - 8, y: y + 30 }
              ]
            ]
          ];
        })
    );
    const result = {
      algorithmVersion: ORGANIC_SURFACE_VERSION,
      parameters: DEFAULT_ORGANIC_PARAMETERS,
      baseContoursByCompositeId: contours,
      paddedContoursByCompositeId: contours,
      memberships: [],
      diagnostics: {},
      composites: []
    } as unknown as OrganicSurfaceResult;
    for (const display of ["base", "padded", "overlay"] as const) {
      const generated = organicExperimentGeometry(frozen, result, display);
      expect(generated.primitives.map((p) => p.id)).toEqual(
        frozen.map((p) => p.id)
      );
      frozen.forEach((p, i) => {
        const next = generated.primitives[i]!;
        if (p.entity.kind !== "composite") expect(next).toBe(p);
        else {
          expect(next.composite?.anchor).toEqual(p.composite?.anchor);
          expect(next.composite?.worldBounds).toEqual(p.composite?.worldBounds);
          expect(next.ancestorCompositeIds).toEqual(p.ancestorCompositeIds);
          expect(next.collectionIds).toEqual(p.collectionIds);
        }
      });
      expect(generated.candidate.fillRule).toBe("evenodd");
    }
    expect(JSON.stringify(frozen)).toBe(before);
  }
);
it("replays complete stable shape/source and existing camera/Collection URL state", () => {
  const repro = organicReproduction(
    "anchored",
    DEFAULT_ORGANIC_PARAMETERS,
    "overlay",
    "?gsViewport=260,223420,650,1800&gsCanons=a,b&gsEvent=shared&unrelated=discard"
  );
  expect(parseOrganicReproduction(JSON.stringify(repro))).toEqual(repro);
  expect(repro.sourceSha256).toBe(TSTL_EXPERIMENT_SHA256);
  expect(repro.view).toEqual({
    gsViewport: "260,223420,650,1800",
    gsCanons: "a,b",
    gsEvent: "shared"
  });
  for (const change of [
    { sourceSha256: "wrong" },
    { algorithmVersion: "future" },
    { baseline: "current" },
    { baseline: "organic" },
    { baseline: "unknown" },
    { display: "fake" }
  ])
    expect(() =>
      parseOrganicReproduction(JSON.stringify({ ...repro, ...change }))
    ).toThrow();
});

it("explicit replay URL wins over stored shapes and a missing frozen baseline is never guessed", () => {
  const stored = JSON.stringify(
    organicReproduction(
      "B0",
      { ...DEFAULT_ORGANIC_PARAMETERS, paddingScale: 2 },
      "base",
      ""
    )
  );
  const explicit = restoreOrganicReproduction(
    "?organicBaseline=anchored",
    stored
  );
  expect(explicit.baseline).toBe("anchored");
  expect(explicit.parameters).toEqual(DEFAULT_ORGANIC_PARAMETERS);
  expect(explicit.display).toBe("padded");
  expect(restoreOrganicReproduction("", stored).baseline).toBe("B0");
  const params = new URLSearchParams({
    organic: stored,
    organicBaseline: "anchored"
  });
  expect(restoreOrganicReproduction(params.toString(), null).baseline).toBe(
    "B0"
  );
  expect(() => restoreOrganicReproduction("", null)).toThrow(
    "organic_select_pinned_baseline_first"
  );
  expect(() =>
    restoreOrganicReproduction("?organicBaseline=current", stored)
  ).toThrow("organic_select_pinned_baseline_first");
});
