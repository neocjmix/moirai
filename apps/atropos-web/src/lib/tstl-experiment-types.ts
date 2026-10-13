import type { ResolvedRenderPrimitive } from "./v5-render-density";

export const TSTL_EXPERIMENT_WORLD_ID = "01a107fb-4018-7fcb-8390-836a40fa91cc";
export const TSTL_EXPERIMENT_REVISION = 56;
export const TSTL_EXPERIMENT_TIME_SYSTEM_ID =
  "01a107fc-3994-7889-969f-7a210c19fa24";
export type TstlExperimentMode = "B0" | "A";
export type TstlExperimentPoint = { x: number; y: number };
export type TstlExperimentBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** A public, frozen comparison input. This is not a served Publication. */
export interface TstlExperimentArtifact {
  formatVersion: "tstl-product-experiment/1";
  source: {
    worldId: string;
    revision: number;
    timeSystemId: string;
    sourceRootDigest: string;
    inputDigest: string;
    fixtureSha256: string;
    temporalProvenance: "legacy-scalar-only";
  };
  bounds: TstlExperimentBox;
  collections: { id: string; title: string; eventIds: string[] }[];
  b0Primitives: ResolvedRenderPrimitive[];
  a: {
    algorithmVersion: string;
    xByEventId: Record<string, number>;
    contoursByCompositeId: Record<string, TstlExperimentPoint[][]>;
    worldBoundsByCompositeId: Record<string, TstlExperimentBox>;
    noAreaCompositeIds: string[];
  };
  stats: {
    events: number;
    composites: number;
    candidateAreaComposites: number;
    candidateFragments: number;
    multiRunBands: number;
  };
  limitations: string[];
}
