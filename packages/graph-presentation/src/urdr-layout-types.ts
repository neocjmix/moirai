/** Minimal local type seam for the pinned URDR producer, never canonical data. */
export interface ChartPlaneDiagnostic {
  code: string;
  severity: "warning" | "error";
  message: string;
}
export interface GraphEntityEditorial {
  role: string;
  importance: string;
  contentDensity: string;
  certaintyPosture: string;
}
export interface ChartPlaneWorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface Point {
  x: number;
  y: number;
}
interface EntityBase {
  id: string;
  eventId: string;
  canonId: string;
  label: string;
  validationState: "ok" | "warning" | "error";
  contains: string[];
  containedBy?: string | undefined;
  diagnostics: ChartPlaneDiagnostic[];
  viewportClass: "visible" | "context-retained" | "clipped" | "hidden";
  editorial?: GraphEntityEditorial | undefined;
}
export interface GraphShellChartPlanePointEntity extends EntityBase {
  geometryKind: "point";
  position: Point;
}
export interface GraphShellChartPlaneSegmentEntity extends EntityBase {
  geometryKind: "segment";
  start: Point;
  end: Point;
}
export interface GraphShellChartPlaneRegionEntity extends EntityBase {
  geometryKind: "region";
  worldBounds: ChartPlaneWorldBounds;
}
export type GraphShellChartPlaneEntity =
  | GraphShellChartPlanePointEntity
  | GraphShellChartPlaneSegmentEntity
  | GraphShellChartPlaneRegionEntity;
export interface GraphShellChartPlane {
  compatibilityKey: string;
  timeSystemId: string;
  entities: GraphShellChartPlaneEntity[];
  diagnostics: ChartPlaneDiagnostic[];
}
export interface GraphShellChronologyBoard {
  axis: {
    startYear: number;
    endYear: number;
    compatibilityKey: string;
    timeSystemId: string;
  };
}
export interface GregorianPoint {
  year: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  era?: "BCE" | "CE" | undefined;
}
export interface EventRecord {
  id: string;
  canonId: string;
  title: string;
  type: string;
  editorial?: { classification?: GraphEntityEditorial };
  anchors?: {
    scheme: string;
    precision?: "year" | "month" | "day" | "hour" | "minute" | "second";
    instant?: GregorianPoint;
    range?: { start: GregorianPoint; end?: GregorianPoint };
  }[];
}
export interface Dataset {
  events: EventRecord[];
  canons: { id: string; timeSystemId: string }[];
  timeSystems: { id: string; compatibilityKey: string }[];
  structuralLinks: {
    id: string;
    type: string;
    fromEventId: string;
    toEventId: string;
    canonId?: string;
  }[];
  semanticLinks: { id: string; type: string; fromId: string; toId: string }[];
}

// Exact functions from shared/contracts/src/index.ts at URDR
// 0267c8fd081ca9a3cd556f8f7319c600248c3760. Moirai must supply its own normalized
// constraints; these legacy rules are only for source parity fixtures.
export type TemporalRelationDirection = "forward" | "reverse" | "none";
const forwardTemporalRelationTypes = new Set([
  "before",
  "precedes",
  "causes",
  "enables",
  "influences"
]);
const reverseTemporalRelationTypes = new Set([
  "after",
  "not-before",
  "retro-causes"
]);
const forwardStructuralRelationKinds = new Set(["PRECEDES", "CAUSES"]);
export function getTemporalDirectionForRelationType(
  type: string
): TemporalRelationDirection {
  const normalized = type.trim().toLowerCase();
  if (forwardTemporalRelationTypes.has(normalized)) return "forward";
  if (reverseTemporalRelationTypes.has(normalized)) return "reverse";
  if (normalized === "not-after") return "forward";
  return "none";
}
export function getTemporalDirectionForStructuralLinkKind(
  type: string
): TemporalRelationDirection {
  return forwardStructuralRelationKinds.has(type.trim().toUpperCase())
    ? "forward"
    : "none";
}

// Source-parity fixture seam only. Moirai uses explicit pre-resolved extents.
export const getEventAnchorsWithComputedCompatibility = (event: EventRecord) =>
  event.anchors ?? [];
