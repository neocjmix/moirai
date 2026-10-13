import type { TstlPoint } from "../../packages/graph-presentation/src/tstl-validator.js";

/** Offline geometry in A's fixed reference frame; never new Event identities. */
export interface TstlIdentityTrace {
  kind: "spine" | "membership" | "route";
  eventId?: string;
  points: TstlPoint[];
}

export interface TstlAlternativeGeometry {
  algorithmVersion: string;
  contoursByCompositeId: Record<string, TstlPoint[][]>;
  tracesByCompositeId: Record<string, TstlIdentityTrace[]>;
  memberships: {
    compositeId: string;
    eventId: string;
    status: "route" | "list";
    reason?: string;
  }[];
  diagnostics: Record<string, number>;
  limitations: string[];
}
