import type { ResolvedRenderPrimitive } from "./v5-render-density";

export const TSTL_EXPERIMENT_WORLD_ID = "01a107fb-4018-7fcb-8390-836a40fa91cc";
export const TSTL_EXPERIMENT_REVISION = 56;
export const TSTL_EXPERIMENT_TIME_SYSTEM_ID =
  "01a107fc-3994-7889-969f-7a210c19fa24";
export type TstlExperimentMode = "B0" | "A" | "B" | "C";
export type TstlCandidateMode = Exclude<TstlExperimentMode, "B0">;
export type TstlExperimentPoint = { x: number; y: number };
export type TstlExperimentBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export interface TstlExperimentTrace {
  kind: "spine" | "membership" | "route";
  eventId?: string;
  points: TstlExperimentPoint[];
}

export interface TstlExperimentCandidate {
  algorithmVersion: string;
  xByEventId: Record<string, number>;
  contoursByCompositeId: Record<string, TstlExperimentPoint[][]>;
  worldBoundsByCompositeId: Record<string, TstlExperimentBox>;
  noAreaCompositeIds: string[];
  tracesByCompositeId?: Record<string, TstlExperimentTrace[]>;
  memberships?: {
    compositeId: string;
    eventId: string;
    status: "route" | "list";
    reason?: string;
  }[];
  diagnostics?: Record<string, number>;
  limitations?: string[];
}

/** A public, frozen comparison input. This is not a served Publication. */
export interface TstlExperimentArtifact {
  formatVersion: "tstl-product-experiment/2";
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
  a: TstlExperimentCandidate;
  b: TstlExperimentCandidate;
  c: TstlExperimentCandidate;
  stats: {
    events: number;
    composites: number;
    candidateAreaComposites: number;
    candidateFragments: number;
    multiRunBands: number;
  };
  limitations: string[];
}

export function tstlCandidate(
  artifact: TstlExperimentArtifact,
  mode: TstlCandidateMode
): TstlExperimentCandidate {
  return mode === "A" ? artifact.a : mode === "B" ? artifact.b : artifact.c;
}
