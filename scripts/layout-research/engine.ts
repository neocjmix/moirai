/** Research adapters use the same pure incidence implementation as publication. */
import {
  computeLayout,
  defaultLayoutSelection,
  type LayoutOutput
} from "../../packages/graph-presentation/src/layout-engine.js";
import {
  relaxIncidence,
  replaceX as sharedReplaceX,
  defaults,
  type Parameters
} from "../../packages/graph-presentation/src/collection-incidence.js";
import type { LabSnapshot } from "../../apps/atropos-web/src/labs/layout/types.js";
export {
  defaults,
  hashUnit,
  shapeCenter
} from "../../packages/graph-presentation/src/collection-incidence.js";
export function replaceX(
  snapshot: LabSnapshot,
  base: LayoutOutput,
  positions: ReadonlyMap<string, number>
): LayoutOutput {
  return sharedReplaceX(
    { ...snapshot, formatVersion: "collection-incidence/1" },
    base,
    positions,
    "research-incidence/2"
  );
}
export type { Parameters } from "../../packages/graph-presentation/src/collection-incidence.js";
export type Candidate =
  | "legacy-force"
  | "deterministic-slots"
  | "relation-only"
  | "global-incidence"
  | "local-incidence";
export interface ResearchResult {
  output: LayoutOutput;
  centers: { collection: string; year: number; x: number; count: number }[];
  computeMs: number;
}
export function solve(
  snapshot: LabSnapshot,
  candidate: Candidate,
  parameters: Parameters = defaults,
  previous?: LayoutOutput,
  prepared?: LayoutOutput
): ResearchResult {
  const start = performance.now();
  if (candidate === "legacy-force" || candidate === "deterministic-slots") {
    const output = computeLayout(
      snapshot.input,
      defaultLayoutSelection(candidate)
    );
    return { output, centers: [], computeMs: performance.now() - start };
  }
  const base =
    prepared ??
    computeLayout(snapshot.input, {
      ...defaultLayoutSelection(),
      parameters: { ...defaultLayoutSelection().parameters, iterations: 0 }
    });
  const { output, centers } = relaxIncidence(
    { ...snapshot, formatVersion: "collection-incidence/1" },
    candidate,
    parameters,
    base,
    previous
  );
  return {
    output: { ...output, algorithm_version: "research-incidence/2" },
    centers,
    computeMs: performance.now() - start
  };
}
