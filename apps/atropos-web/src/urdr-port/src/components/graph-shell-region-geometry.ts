// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import { EndType, JoinType, inflatePathsD } from "clipper2-ts";
import type { ViewportCoordinate } from "./graph-shell-composite";

export type CompositeHullMode = "convex" | "concave";
export type CompositeHullSupport = {
  instantPoints: ViewportCoordinate[];
  childPolygons: ViewportCoordinate[][];
};

const AREA_EPSILON = 0.000001;
const POINT_SNAP_PRECISION = 3;
const SVG_PATH_PRECISION = 2;
const CLOSED_SPLINE_SMOOTHING = 0.55;
const CLOSED_SPLINE_CORNER_FLOOR = 0.2;
const CLOSED_SPLINE_BALANCE_FLOOR = 0.35;

export type CompositeSplineTuning = {
  smoothing: number;
  cornerFloor: number;
  balanceFloor: number;
};

export type CompositeLabelAnchor = "start" | "middle" | "end";

export type CompositeEdgeLabelPlacement = {
  edgeIndex?: number;
  pointCount?: number;
  attachX: number;
  attachY: number;
  guideX: number;
  guideY: number;
  labelX: number;
  labelY: number;
  labelAnchor: CompositeLabelAnchor;
  labelAngle: number;
  pathPoints: ViewportCoordinate[];
  textPathStartOffset: string;
  side: "top" | "right" | "bottom" | "left";
};

type ViewportExtent = {
  width: number;
  height: number;
};

export const DEFAULT_COMPOSITE_SPLINE_TUNING: CompositeSplineTuning = {
  smoothing: 0.95,
  cornerFloor: 0.46,
  balanceFloor: 0.72,
};

export const DEFAULT_COMPOSITE_LABEL_PATH_SPLINE_TUNING: CompositeSplineTuning = {
  smoothing: 2.2,
  cornerFloor: 0.88,
  balanceFloor: 1.08,
};

function formatSvgCoordinate(value: number) {
  return Number(value.toFixed(SVG_PATH_PRECISION)).toString();
}

function addPoints(a: ViewportCoordinate, b: ViewportCoordinate) {
  return { x: a.x + b.x, y: a.y + b.y } satisfies ViewportCoordinate;
}

function scalePoint(point: ViewportCoordinate, scalar: number) {
  return { x: point.x * scalar, y: point.y * scalar } satisfies ViewportCoordinate;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampControlPointToSegmentBounds(controlPoint: ViewportCoordinate, start: ViewportCoordinate, end: ViewportCoordinate) {
  return {
    x: clamp(controlPoint.x, Math.min(start.x, end.x), Math.max(start.x, end.x)),
    y: clamp(controlPoint.y, Math.min(start.y, end.y), Math.max(start.y, end.y)),
  } satisfies ViewportCoordinate;
}

function getDirectionalUnitVector(from: ViewportCoordinate, to: ViewportCoordinate) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length <= AREA_EPSILON) {
    return { x: 0, y: 0 } satisfies ViewportCoordinate;
  }

  return {
    x: dx / length,
    y: dy / length,
  } satisfies ViewportCoordinate;
}

function getLineIntersection(
  pointA: ViewportCoordinate,
  directionA: ViewportCoordinate,
  pointB: ViewportCoordinate,
  directionB: ViewportCoordinate,
) {
  const denominator = directionA.x * directionB.y - directionA.y * directionB.x;
  if (Math.abs(denominator) <= AREA_EPSILON) {
    return null;
  }

  const delta = { x: pointB.x - pointA.x, y: pointB.y - pointA.y } satisfies ViewportCoordinate;
  const t = (delta.x * directionB.y - delta.y * directionB.x) / denominator;
  return {
    x: pointA.x + directionA.x * t,
    y: pointA.y + directionA.y * t,
  } satisfies ViewportCoordinate;
}

function getEdgeOutwardNormal(start: ViewportCoordinate, end: ViewportCoordinate, isClockwise: boolean) {
  const direction = getDirectionalUnitVector(start, end);
  return isClockwise
    ? ({ x: -direction.y, y: direction.x } satisfies ViewportCoordinate)
    : ({ x: direction.y, y: -direction.x } satisfies ViewportCoordinate);
}

function getCornerSmoothness(previous: ViewportCoordinate, current: ViewportCoordinate, next: ViewportCoordinate, cornerFloor: number) {
  const incoming = getDirectionalUnitVector(previous, current);
  const outgoing = getDirectionalUnitVector(current, next);
  return Math.max(cornerFloor, incoming.x * outgoing.x + incoming.y * outgoing.y);
}

function getAdaptiveHandleScale(
  previous: ViewportCoordinate,
  current: ViewportCoordinate,
  next: ViewportCoordinate,
  tuning: CompositeSplineTuning,
) {
  const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y);
  const segmentLength = Math.hypot(next.x - current.x, next.y - current.y);

  if (segmentLength <= AREA_EPSILON) {
    return 0;
  }

  const turnSmoothness = getCornerSmoothness(previous, current, next, tuning.cornerFloor);
  const neighborBalance = Math.max(tuning.balanceFloor, Math.min(previousLength, segmentLength) / segmentLength);

  return (Math.max(0, tuning.smoothing) / 6) * turnSmoothness * neighborBalance;
}
function crossProduct(origin: ViewportCoordinate, a: ViewportCoordinate, b: ViewportCoordinate) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function getPolygonSignedArea(points: ViewportCoordinate[]) {
  if (points.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    areaTwice += current.x * next.y - next.x * current.y;
  }

  return areaTwice / 2;
}

function normalizeUniquePoints(points: ViewportCoordinate[]) {
  return points
    .map((point) => ({ x: Number(point.x.toFixed(POINT_SNAP_PRECISION)), y: Number(point.y.toFixed(POINT_SNAP_PRECISION)) }))
    .filter((point, index, list) => list.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index)
    .sort((left, right) => left.x - right.x || left.y - right.y);
}

function dedupeOrderedPoints(points: ViewportCoordinate[]) {
  const result: ViewportCoordinate[] = [];

  for (const point of points) {
    const normalized = { x: Number(point.x.toFixed(POINT_SNAP_PRECISION)), y: Number(point.y.toFixed(POINT_SNAP_PRECISION)) };
    const previous = result[result.length - 1];
    if (previous && previous.x === normalized.x && previous.y === normalized.y) {
      continue;
    }
    result.push(normalized);
  }

  if (result.length >= 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first && last && first.x === last.x && first.y === last.y) {
      result.pop();
    }
  }

  return result;
}

function orientLabelPathPoints(points: ViewportCoordinate[], side: CompositeEdgeLabelPlacement["side"]) {
  if (points.length < 2) {
    return points;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (side === "top" || side === "bottom") {
    return dx >= 0 ? points : [...points].reverse();
  }

  return dy >= 0 ? points : [...points].reverse();
}

function getCompositeLabelPathPoints(points: ViewportCoordinate[], edgeIndex: number, outwardOffset: number) {
  const normalizedPoints = dedupeOrderedPoints(points);

  if (normalizedPoints.length < 2) {
    return normalizedPoints;
  }

  if (normalizedPoints.length < 3) {
    return orientLabelPathPoints(normalizedPoints, "top");
  }

  const pointCount = normalizedPoints.length;
  const current = normalizedPoints[edgeIndex % pointCount];
  const next = normalizedPoints[(edgeIndex + 1) % pointCount];
  const edgeLength = Math.hypot(next.x - current.x, next.y - current.y);
  const tangent = edgeLength <= AREA_EPSILON
    ? ({ x: 1, y: 0 } satisfies ViewportCoordinate)
    : ({ x: (next.x - current.x) / edgeLength, y: (next.y - current.y) / edgeLength } satisfies ViewportCoordinate);
  const isClockwise = getPolygonSignedArea(normalizedPoints) < 0;
  const outward = edgeLength <= AREA_EPSILON
    ? ({ x: 0, y: -1 } satisfies ViewportCoordinate)
    : (isClockwise
        ? ({ x: -(next.y - current.y) / edgeLength, y: (next.x - current.x) / edgeLength } satisfies ViewportCoordinate)
        : ({ x: (next.y - current.y) / edgeLength, y: -(next.x - current.x) / edgeLength } satisfies ViewportCoordinate));
  const side: CompositeEdgeLabelPlacement["side"] = Math.abs(outward.x) >= Math.abs(outward.y)
    ? (outward.x >= 0 ? "right" : "left")
    : (outward.y >= 0 ? "bottom" : "top");

  const shifted = (pathPoints: ViewportCoordinate[]) =>
    pathPoints.map((point) => ({
      x: point.x + outward.x * outwardOffset,
      y: point.y + outward.y * outwardOffset,
    } satisfies ViewportCoordinate));

  const extension = Math.min(Math.max(edgeLength * 0.18, 10), 18);
  const localPath = dedupeOrderedPoints([
    { x: current.x - tangent.x * extension, y: current.y - tangent.y * extension },
    current,
    next,
    { x: next.x + tangent.x * extension, y: next.y + tangent.y * extension },
  ]);

  return orientLabelPathPoints(shifted(localPath), side);
}

type YBand = {
  y: number;
  leftX: number;
  rightX: number;
};

function getHorizontalIntersectionsAtY(polygon: ViewportCoordinate[], y: number) {
  const intersections: number[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (Math.abs(current.y - next.y) < AREA_EPSILON) {
      if (Math.abs(current.y - y) < AREA_EPSILON) {
        intersections.push(current.x, next.x);
      }
      continue;
    }

    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) {
      continue;
    }

    const ratio = (y - current.y) / (next.y - current.y);
    intersections.push(current.x + (next.x - current.x) * ratio);
  }

  return [...new Set(intersections.map((x) => Number(x.toFixed(POINT_SNAP_PRECISION))))].sort((left, right) => left - right);
}

function buildYEnvelopeBands(support: CompositeHullSupport) {
  const instantPoints = dedupeOrderedPoints([...support.instantPoints].sort((left, right) => left.y - right.y || left.x - right.x));
  const breakpointYs = [...new Set(instantPoints.map((point) => Number(point.y.toFixed(POINT_SNAP_PRECISION))))].sort((left, right) => left - right);

  return breakpointYs
    .map((y) => {
      const xs = instantPoints.filter((point) => Number(point.y.toFixed(POINT_SNAP_PRECISION)) === y).map((point) => point.x);

      for (const polygon of support.childPolygons) {
        xs.push(...getHorizontalIntersectionsAtY(polygon, y));
      }

      if (xs.length === 0) {
        return null;
      }

      xs.sort((left, right) => left - right);
      return {
        y,
        leftX: xs[0] ?? 0,
        rightX: xs[xs.length - 1] ?? 0,
      } satisfies YBand;
    })
    .filter((band): band is YBand => Boolean(band));
}

function buildYSweepHull(support: CompositeHullSupport) {
  const flattenedSupportPoints = dedupeOrderedPoints([
    ...support.instantPoints,
    ...support.childPolygons.flat(),
  ]);

  if (flattenedSupportPoints.length < 3) {
    return flattenedSupportPoints;
  }

  const bands = buildYEnvelopeBands(support);
  if (bands.length < 3) {
    return buildConvexHull(flattenedSupportPoints);
  }

  const leftChain = bands.map((band) => ({ x: band.leftX, y: band.y }));
  const rightChain = [...bands]
    .reverse()
    .map((band) => ({ x: band.rightX, y: band.y }));
  const polygon = dedupeOrderedPoints([...leftChain, ...rightChain]);

  if (polygon.length < 3) {
    return buildConvexHull(flattenedSupportPoints);
  }

  if (polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return buildConvexHull(flattenedSupportPoints);
  }

  return polygon;
}

export function samplePolygonBoundary(points: ViewportCoordinate[], segmentsPerEdge = 4) {
  if (points.length < 2) {
    return points;
  }

  const result: ViewportCoordinate[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    result.push(current);
    for (let step = 1; step < segmentsPerEdge; step += 1) {
      const ratio = step / segmentsPerEdge;
      result.push({
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
      });
    }
  }

  return dedupeOrderedPoints(result);
}

export function buildClosedSplinePath(points: ViewportCoordinate[], tuning: CompositeSplineTuning = DEFAULT_COMPOSITE_SPLINE_TUNING) {
  const normalizedPoints = dedupeOrderedPoints(points);

  if (normalizedPoints.length === 0) {
    return "";
  }

  if (normalizedPoints.length === 1) {
    const point = normalizedPoints[0];
    return `M ${formatSvgCoordinate(point.x)} ${formatSvgCoordinate(point.y)} Z`;
  }

  if (normalizedPoints.length === 2) {
    const [start, end] = normalizedPoints;
    return [
      `M ${formatSvgCoordinate(start.x)} ${formatSvgCoordinate(start.y)}`,
      `L ${formatSvgCoordinate(end.x)} ${formatSvgCoordinate(end.y)}`,
      "Z",
    ].join(" ");
  }

  const pathSegments = normalizedPoints.map((point, index, list) => {
    const previous = list[(index - 1 + list.length) % list.length];
    const next = list[(index + 1) % list.length];
    const nextNext = list[(index + 2) % list.length];
    const entryScale = getAdaptiveHandleScale(previous, point, next, tuning);
    const exitScale = getAdaptiveHandleScale(point, next, nextNext, tuning);

    const controlPoint1 = clampControlPointToSegmentBounds({
      x: point.x + (next.x - previous.x) * entryScale,
      y: point.y + (next.y - previous.y) * entryScale,
    }, point, next);
    const controlPoint2 = clampControlPointToSegmentBounds({
      x: next.x - (nextNext.x - point.x) * exitScale,
      y: next.y - (nextNext.y - point.y) * exitScale,
    }, point, next);

    return `C ${formatSvgCoordinate(controlPoint1.x)} ${formatSvgCoordinate(controlPoint1.y)}, ${formatSvgCoordinate(controlPoint2.x)} ${formatSvgCoordinate(controlPoint2.y)}, ${formatSvgCoordinate(next.x)} ${formatSvgCoordinate(next.y)}`;
  });

  const start = normalizedPoints[0];
  return [`M ${formatSvgCoordinate(start.x)} ${formatSvgCoordinate(start.y)}`, ...pathSegments, "Z"].join(" ");
}

export function buildOpenSplinePath(points: ViewportCoordinate[], tuning: CompositeSplineTuning = DEFAULT_COMPOSITE_SPLINE_TUNING) {
  const normalizedPoints = dedupeOrderedPoints(points);

  if (normalizedPoints.length === 0) {
    return "";
  }

  if (normalizedPoints.length === 1) {
    const point = normalizedPoints[0];
    return `M ${formatSvgCoordinate(point.x)} ${formatSvgCoordinate(point.y)}`;
  }

  if (normalizedPoints.length === 2) {
    const [start, end] = normalizedPoints;
    return `M ${formatSvgCoordinate(start.x)} ${formatSvgCoordinate(start.y)} L ${formatSvgCoordinate(end.x)} ${formatSvgCoordinate(end.y)}`;
  }

  const pathSegments = normalizedPoints.slice(0, -1).map((point, index, list) => {
    const fullList = normalizedPoints;
    const current = point;
    const next = fullList[index + 1];
    const previous = index === 0 ? current : fullList[index - 1];
    const nextNext = index + 2 >= fullList.length ? next : fullList[index + 2];
    const entryScale = getAdaptiveHandleScale(previous, current, next, tuning);
    const exitScale = getAdaptiveHandleScale(current, next, nextNext, tuning);

    const controlPoint1 = clampControlPointToSegmentBounds({
      x: current.x + (next.x - previous.x) * entryScale,
      y: current.y + (next.y - previous.y) * entryScale,
    }, current, next);
    const controlPoint2 = clampControlPointToSegmentBounds({
      x: next.x - (nextNext.x - current.x) * exitScale,
      y: next.y - (nextNext.y - current.y) * exitScale,
    }, current, next);

    return `C ${formatSvgCoordinate(controlPoint1.x)} ${formatSvgCoordinate(controlPoint1.y)}, ${formatSvgCoordinate(controlPoint2.x)} ${formatSvgCoordinate(controlPoint2.y)}, ${formatSvgCoordinate(next.x)} ${formatSvgCoordinate(next.y)}`;
  });

  const start = normalizedPoints[0];
  return [`M ${formatSvgCoordinate(start.x)} ${formatSvgCoordinate(start.y)}`, ...pathSegments].join(" ");
}

export function expandPolygon(points: ViewportCoordinate[], padding: number) {
  return offsetPolygon(points, padding) ?? expandPolygonFallback(points, padding);
}

function offsetPolygon(points: ViewportCoordinate[], padding: number) {
  const normalizedPoints = dedupeOrderedPoints(points);

  if (normalizedPoints.length === 0 || padding <= 0) {
    return normalizedPoints;
  }

  if (normalizedPoints.length === 1) {
    const point = normalizedPoints[0];
    return [
      { x: point.x - padding, y: point.y - padding },
      { x: point.x + padding, y: point.y - padding },
      { x: point.x + padding, y: point.y + padding },
      { x: point.x - padding, y: point.y + padding },
    ];
  }

  if (normalizedPoints.length === 2) {
    return null;
  }

  try {
    const offsetPaths = inflatePathsD([normalizedPoints], padding, JoinType.Round, EndType.Polygon, 2, 3);
    const validPaths = offsetPaths
      .map((path) => dedupeOrderedPoints(path.map((point) => ({ x: point.x, y: point.y }) satisfies ViewportCoordinate)))
      .filter((path) => path.length >= 3)
      .filter((path) => path.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
      .filter((path) => Math.abs(getPolygonSignedArea(path)) > AREA_EPSILON);

    if (validPaths.length === 0) {
      return null;
    }

    const selectedPath = [...validPaths].sort(
      (left, right) => Math.abs(getPolygonSignedArea(right)) - Math.abs(getPolygonSignedArea(left)),
    )[0]!;

    return selectedPath;
  } catch {
    return null;
  }
}

function expandPolygonFallback(points: ViewportCoordinate[], padding: number) {
  const normalizedPoints = dedupeOrderedPoints(points);

  if (normalizedPoints.length === 0 || padding <= 0) {
    return normalizedPoints;
  }

  if (normalizedPoints.length === 1) {
    const point = normalizedPoints[0];
    return [
      { x: point.x - padding, y: point.y - padding },
      { x: point.x + padding, y: point.y - padding },
      { x: point.x + padding, y: point.y + padding },
      { x: point.x - padding, y: point.y + padding },
    ];
  }

  if (normalizedPoints.length === 2) {
    const [start, end] = normalizedPoints;
    const tangent = getDirectionalUnitVector(start, end);
    const normal = { x: tangent.y, y: -tangent.x } satisfies ViewportCoordinate;
    return dedupeOrderedPoints([
      addPoints(addPoints(start, scalePoint(tangent, -padding)), scalePoint(normal, padding)),
      addPoints(addPoints(end, scalePoint(tangent, padding)), scalePoint(normal, padding)),
      addPoints(addPoints(end, scalePoint(tangent, padding)), scalePoint(normal, -padding)),
      addPoints(addPoints(start, scalePoint(tangent, -padding)), scalePoint(normal, -padding)),
    ]);
  }

  const isClockwise = getPolygonSignedArea(normalizedPoints) < 0;
  const orientationSign = isClockwise ? -1 : 1;
  const expandedPoints: ViewportCoordinate[] = [];

  for (let index = 0; index < normalizedPoints.length; index += 1) {
    const previous = normalizedPoints[(index - 1 + normalizedPoints.length) % normalizedPoints.length];
    const current = normalizedPoints[index];
    const next = normalizedPoints[(index + 1) % normalizedPoints.length];
    const previousDirection = getDirectionalUnitVector(previous, current);
    const nextDirection = getDirectionalUnitVector(current, next);

    if (
      (Math.abs(previousDirection.x) <= AREA_EPSILON && Math.abs(previousDirection.y) <= AREA_EPSILON) ||
      (Math.abs(nextDirection.x) <= AREA_EPSILON && Math.abs(nextDirection.y) <= AREA_EPSILON)
    ) {
      continue;
    }

    const previousNormal = getEdgeOutwardNormal(previous, current, isClockwise);
    const nextNormal = getEdgeOutwardNormal(current, next, isClockwise);
    const previousOffsetPoint = addPoints(current, scalePoint(previousNormal, padding));
    const nextOffsetPoint = addPoints(current, scalePoint(nextNormal, padding));
    const turn = crossProduct(previous, current, next);
    const isConvexCorner = turn * orientationSign > AREA_EPSILON;

    if (isConvexCorner) {
      const intersection = getLineIntersection(previousOffsetPoint, previousDirection, nextOffsetPoint, nextDirection);
      if (intersection) {
        const miterLength = Math.hypot(intersection.x - current.x, intersection.y - current.y);
        if (Number.isFinite(miterLength) && miterLength <= padding * 4) {
          expandedPoints.push(intersection);
          continue;
        }
      }
    }

    expandedPoints.push(previousOffsetPoint, nextOffsetPoint);
  }

  return dedupeOrderedPoints(expandedPoints);
}

export function buildConvexHull(points: ViewportCoordinate[]) {
  const uniquePoints = normalizeUniquePoints(points);

  if (uniquePoints.length <= 1) {
    return uniquePoints;
  }

  const lower: ViewportCoordinate[] = [];
  for (const point of uniquePoints) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: ViewportCoordinate[] = [];
  for (const point of [...uniquePoints].reverse()) {
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function getPolygonCentroid(points: ViewportCoordinate[]) {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length < 3) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  let areaTwice = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    areaTwice += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  if (Math.abs(areaTwice) < AREA_EPSILON) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  return {
    x: cx / (3 * areaTwice),
    y: cy / (3 * areaTwice),
  };
}

type CompositeEdgeCandidate = CompositeEdgeLabelPlacement & {
  edgeIndex: number;
  edgeLength: number;
  overflow: number;
  breathingRoom: number;
  densityScore: number;
  fitClass: 0 | 1 | 2;
  visibleSpan: number;
};

type PathSample = {
  point: ViewportCoordinate;
  distance: number;
  tangent: ViewportCoordinate;
};

function getCompositeLabelBounds(candidate: CompositeEdgeLabelPlacement, labelWidth: number, labelHeight: number) {
  const radians = (candidate.labelAngle * Math.PI) / 180;
  const rotatedWidth = Math.abs(Math.cos(radians)) * labelWidth + Math.abs(Math.sin(radians)) * labelHeight;
  const rotatedHeight = Math.abs(Math.sin(radians)) * labelWidth + Math.abs(Math.cos(radians)) * labelHeight;
  return {
    minX: candidate.labelX - rotatedWidth / 2,
    maxX: candidate.labelX + rotatedWidth / 2,
    minY: candidate.labelY - rotatedHeight / 2,
    maxY: candidate.labelY + rotatedHeight / 2,
  };
}

function getPolylineLength(points: ViewportCoordinate[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return length;
}

function getPointAtDistanceOnPolyline(points: ViewportCoordinate[], distance: number): PathSample {
  if (points.length === 0) {
    return {
      point: { x: 0, y: 0 },
      distance: 0,
      tangent: { x: 1, y: 0 },
    } satisfies PathSample;
  }

  if (points.length === 1) {
    return {
      point: points[0]!,
      distance: 0,
      tangent: { x: 1, y: 0 },
    } satisfies PathSample;
  }

  const totalLength = getPolylineLength(points);
  const target = clamp(distance, 0, totalLength);
  let traversed = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (segmentLength <= AREA_EPSILON) {
      continue;
    }
    if (traversed + segmentLength >= target) {
      const t = (target - traversed) / segmentLength;
      return {
        point: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        },
        distance: target,
        tangent: {
          x: (end.x - start.x) / segmentLength,
          y: (end.y - start.y) / segmentLength,
        },
      } satisfies PathSample;
    }
    traversed += segmentLength;
  }

  const tailStart = points[points.length - 2]!;
  const tailEnd = points[points.length - 1]!;
  const tailLength = Math.hypot(tailEnd.x - tailStart.x, tailEnd.y - tailStart.y) || 1;
  return {
    point: tailEnd,
    distance: totalLength,
    tangent: {
      x: (tailEnd.x - tailStart.x) / tailLength,
      y: (tailEnd.y - tailStart.y) / tailLength,
    },
  } satisfies PathSample;
}

function isPointWithinViewport(point: ViewportCoordinate, viewport: ViewportExtent, margin: number) {
  return (
    point.x >= margin &&
    point.x <= viewport.width - margin &&
    point.y >= margin &&
    point.y <= viewport.height - margin
  );
}

function getLongestVisiblePathInterval(points: ViewportCoordinate[], viewport: ViewportExtent, margin: number) {
  const totalLength = getPolylineLength(points);
  if (totalLength <= AREA_EPSILON) {
    return { start: 0, end: 0, span: 0 };
  }

  const sampleCount = Math.max(12, Math.ceil(totalLength / 6));
  let currentStart: number | null = null;
  let bestStart = 0;
  let bestEnd = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const distance = (totalLength * index) / sampleCount;
    const sample = getPointAtDistanceOnPolyline(points, distance);
    const visible = isPointWithinViewport(sample.point, viewport, margin);
    if (visible && currentStart === null) {
      currentStart = distance;
    }
    if ((!visible || index === sampleCount) && currentStart !== null) {
      const intervalEnd = visible && index === sampleCount ? distance : (totalLength * Math.max(index - 1, 0)) / sampleCount;
      if (intervalEnd - currentStart > bestEnd - bestStart) {
        bestStart = currentStart;
        bestEnd = intervalEnd;
      }
      currentStart = null;
    }
  }

  return { start: bestStart, end: bestEnd, span: Math.max(0, bestEnd - bestStart) };
}

function getDistanceToPolyline(point: ViewportCoordinate, polyline: ViewportCoordinate[]) {
  if (polyline.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1]!;
    const end = polyline[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= AREA_EPSILON) {
      bestDistance = Math.min(bestDistance, Math.hypot(point.x - start.x, point.y - start.y));
      continue;
    }
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
    const projection = { x: start.x + dx * t, y: start.y + dy * t };
    bestDistance = Math.min(bestDistance, Math.hypot(point.x - projection.x, point.y - projection.y));
  }

  return bestDistance;
}

function getCandidateDensityScore(bounds: { minX: number; maxX: number; minY: number; maxY: number }, pathPoints: ViewportCoordinate[], nearbyPoints: ViewportCoordinate[], labelHeight: number, inset = 0) {
  let score = 0;
  const expanded = {
    minX: bounds.minX - labelHeight * 0.8 + inset,
    maxX: bounds.maxX + labelHeight * 0.8 - inset,
    minY: bounds.minY - labelHeight * 0.8 + inset,
    maxY: bounds.maxY + labelHeight * 0.8 - inset,
  };

  for (const point of nearbyPoints) {
    const insideBox = point.x >= expanded.minX && point.x <= expanded.maxX && point.y >= expanded.minY && point.y <= expanded.maxY;
    if (insideBox) {
      score += 1;
      continue;
    }
    if (getDistanceToPolyline(point, pathPoints) <= Math.max(0, labelHeight - inset)) {
      score += 0.35;
    }
  }

  return score;
}

function getReadableEdgeAngle(dx: number, dy: number) {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) {
    angle -= 180;
  } else if (angle < -90) {
    angle += 180;
  }
  return angle;
}

function getBreathingRoom(bounds: { minX: number; maxX: number; minY: number; maxY: number }, viewport: ViewportExtent) {
  return Math.min(
    bounds.minX,
    viewport.width - bounds.maxX,
    bounds.minY,
    viewport.height - bounds.maxY,
  );
}

function getBoundsOverflow(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  viewport: ViewportExtent,
) {
  return (
    Math.max(0, -bounds.minX) +
    Math.max(0, bounds.maxX - viewport.width) +
    Math.max(0, -bounds.minY) +
    Math.max(0, bounds.maxY - viewport.height)
  );
}

function getCompositeSidePriority(centroid: ViewportCoordinate, viewport: ViewportExtent) {
  const dx = centroid.x - viewport.width / 2;
  const dy = centroid.y - viewport.height / 2;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const horizontal = dx >= 0 ? "right" : "left";
    const vertical = dy >= 0 ? "bottom" : "top";
    return [horizontal, vertical, vertical === "top" ? "bottom" : "top", horizontal === "left" ? "right" : "left"] as const;
  }

  const vertical = dy >= 0 ? "bottom" : "top";
  const horizontal = dx >= 0 ? "right" : "left";
  return [vertical, horizontal, horizontal === "left" ? "right" : "left", vertical === "top" ? "bottom" : "top"] as const;
}

export function resolveCompositeEdgeLabelPlacement(
  points: ViewportCoordinate[],
  labelWidth: number,
  labelHeight: number,
  viewport: ViewportExtent,
  guideLength = 10,
  labelGap = 6,
  nearbyPoints: ViewportCoordinate[] = [],
  previous?: CompositeEdgeLabelPlacement,
): CompositeEdgeLabelPlacement {
  const normalizedPoints = dedupeOrderedPoints(points);
  const centroid = getPolygonCentroid(normalizedPoints);

  if (normalizedPoints.length === 0) {
    return {
      attachX: centroid.x,
      attachY: centroid.y,
      guideX: centroid.x,
      guideY: centroid.y - guideLength,
      labelX: centroid.x,
      labelY: centroid.y - guideLength - labelGap - labelHeight / 2,
      labelAnchor: "middle",
      labelAngle: 0,
      pathPoints: [
        { x: centroid.x - 36, y: centroid.y - guideLength - labelGap - labelHeight / 2 },
        { x: centroid.x + 36, y: centroid.y - guideLength - labelGap - labelHeight / 2 },
      ],
      textPathStartOffset: "50%",
      side: "top",
    } satisfies CompositeEdgeLabelPlacement;
  }

  if (normalizedPoints.length === 1) {
    const point = normalizedPoints[0];
    return {
      attachX: point.x,
      attachY: point.y,
      guideX: point.x,
      guideY: point.y - guideLength,
      labelX: point.x,
      labelY: point.y - guideLength - labelGap - labelHeight / 2,
      labelAnchor: "middle",
      labelAngle: 0,
      pathPoints: [
        { x: point.x - 36, y: point.y - guideLength - labelGap - labelHeight / 2 },
        { x: point.x + 36, y: point.y - guideLength - labelGap - labelHeight / 2 },
      ],
      textPathStartOffset: "50%",
      side: "top",
    } satisfies CompositeEdgeLabelPlacement;
  }

  const isClockwise = getPolygonSignedArea(normalizedPoints) < 0;
  const candidates: CompositeEdgeCandidate[] = [];

  for (let index = 0; index < normalizedPoints.length; index += 1) {
    const current = normalizedPoints[index];
    const next = normalizedPoints[(index + 1) % normalizedPoints.length];
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const edgeLength = Math.hypot(dx, dy);
    if (edgeLength <= AREA_EPSILON) {
      continue;
    }

    const outward = isClockwise
      ? { x: -dy / edgeLength, y: dx / edgeLength }
      : { x: dy / edgeLength, y: -dx / edgeLength };
    const side: CompositeEdgeLabelPlacement["side"] = Math.abs(outward.x) >= Math.abs(outward.y)
      ? (outward.x >= 0 ? "right" : "left")
      : (outward.y >= 0 ? "bottom" : "top");
    const attachX = (current.x + next.x) / 2;
    const attachY = (current.y + next.y) / 2;
    const guideX = attachX + outward.x * guideLength;
    const guideY = attachY + outward.y * guideLength;

    const labelX = guideX + outward.x * (labelGap + labelHeight * 0.35);
    const labelY = guideY + outward.y * (labelGap + labelHeight * 0.35);
    const labelAnchor: CompositeLabelAnchor = "middle";
    const labelAngle = getReadableEdgeAngle(dx, dy);

    const placement = {
      attachX,
      attachY,
      guideX,
      guideY,
      labelX,
      labelY,
      labelAnchor,
      labelAngle,
      edgeIndex: index,
      pathPoints: getCompositeLabelPathPoints(normalizedPoints, index, labelGap + labelHeight * 0.5),
      side,
    };
    const totalPathLength = getPolylineLength(placement.pathPoints);
    const visibleInterval = getLongestVisiblePathInterval(placement.pathPoints, viewport, labelHeight * 0.5);
    const minVisibleSpan = labelWidth * 0.72;
    const fitClass: 0 | 1 | 2 = visibleInterval.span >= labelWidth + 8 ? 0 : visibleInterval.span >= minVisibleSpan ? 1 : 2;
    const halfLabel = labelWidth / 2;
    const minCenter = clamp(visibleInterval.start + halfLabel, 0, totalPathLength);
    const maxCenter = clamp(visibleInterval.end - halfLabel, 0, totalPathLength);
    const preferredCenter = (visibleInterval.start + visibleInterval.end) / 2;
    const centerDistance = minCenter <= maxCenter ? clamp(preferredCenter, minCenter, maxCenter) : clamp(preferredCenter, 0, totalPathLength);
    const centerSample = getPointAtDistanceOnPolyline(placement.pathPoints, centerDistance);
    const fittedPlacement = {
      ...placement,
      labelX: centerSample.point.x,
      labelY: centerSample.point.y,
      labelAngle: getReadableEdgeAngle(centerSample.tangent.x, centerSample.tangent.y),
      textPathStartOffset: `${formatSvgCoordinate(centerDistance)}`,
    } satisfies CompositeEdgeLabelPlacement;
    const bounds = getCompositeLabelBounds(fittedPlacement, labelWidth, labelHeight);
    const overflow = getBoundsOverflow(bounds, viewport);
    const breathingRoom = getBreathingRoom(bounds, viewport);
    const densityScore = getCandidateDensityScore(bounds, fittedPlacement.pathPoints, nearbyPoints, labelHeight);
    candidates.push({ ...fittedPlacement, edgeLength, overflow, breathingRoom, densityScore, fitClass, visibleSpan: visibleInterval.span });
  }

  if (candidates.length === 0) {
    return {
      attachX: centroid.x,
      attachY: centroid.y,
      guideX: centroid.x,
      guideY: centroid.y - guideLength,
      labelX: centroid.x,
      labelY: centroid.y - guideLength - labelGap - labelHeight / 2,
      labelAnchor: "middle",
      labelAngle: 0,
      pathPoints: [
        { x: centroid.x - 36, y: centroid.y - guideLength - labelGap - labelHeight / 2 },
        { x: centroid.x + 36, y: centroid.y - guideLength - labelGap - labelHeight / 2 },
      ],
      textPathStartOffset: "50%",
      side: "top",
    } satisfies CompositeEdgeLabelPlacement;
  }

  const bestFitClass = Math.min(...candidates.map((candidate) => candidate.fitClass));
  const fitCandidates = candidates.filter((candidate) => candidate.fitClass === bestFitClass);
  const zeroOverflowCandidates = fitCandidates.filter((candidate) => candidate.overflow <= AREA_EPSILON);
  const candidatePool = zeroOverflowCandidates.length > 0 ? zeroOverflowCandidates : fitCandidates;
  const prioritizedSides = getCompositeSidePriority(centroid, viewport);

  let selected = [...candidatePool].sort((left, right) => {
    const leftSidePriority = prioritizedSides.indexOf(left.side);
    const rightSidePriority = prioritizedSides.indexOf(right.side);
    return (
      left.densityScore - right.densityScore ||
      left.overflow - right.overflow ||
      right.breathingRoom - left.breathingRoom ||
      right.visibleSpan - left.visibleSpan ||
      right.edgeLength - left.edgeLength ||
      leftSidePriority - rightSidePriority ||
      left.attachY - right.attachY ||
      left.attachX - right.attachX
    );
  })[0]!;

  // Keep the committed edge through a small screen-space dead band. Its path
  // and coordinates are still recomputed, so the label follows pan and pinch.
  const incumbent = previous?.pointCount === normalizedPoints.length
    ? candidates.find(candidate => candidate.edgeIndex === previous.edgeIndex)
    : undefined;
  if (incumbent && incumbent !== selected) {
    const density = getCandidateDensityScore(getCompositeLabelBounds(incumbent, labelWidth, labelHeight), incumbent.pathPoints, nearbyPoints, labelHeight, 8);
    if (incumbent.visibleSpan >= labelWidth * 0.72 - 16 &&
        incumbent.overflow <= 16 &&
        density <= selected.densityScore &&
        selected.visibleSpan - incumbent.visibleSpan <= 24 &&
        selected.breathingRoom - incumbent.breathingRoom <= 24) {
      selected = incumbent;
    }
  }

  return {
    edgeIndex: selected.edgeIndex,
    pointCount: normalizedPoints.length,
    attachX: selected.attachX,
    attachY: selected.attachY,
    guideX: selected.guideX,
    guideY: selected.guideY,
    labelX: selected.labelX,
    labelY: selected.labelY,
    labelAnchor: selected.labelAnchor,
    labelAngle: selected.labelAngle,
    pathPoints: selected.pathPoints,
    textPathStartOffset: selected.textPathStartOffset,
    side: selected.side,
  } satisfies CompositeEdgeLabelPlacement;
}

export function isPointInsidePolygon(point: ViewportCoordinate, polygon: ViewportCoordinate[]) {
  if (polygon.length < 3) {
    return true;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function resolveCompositeInteriorLabelAnchor(
  hullPoints: ViewportCoordinate[],
  supportPoints: ViewportCoordinate[],
  pointClearance: number,
) {
  const centroid = getPolygonCentroid(hullPoints);
  const isTooClose = (candidate: ViewportCoordinate) =>
    supportPoints.some((point) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < pointClearance);

  if (!isTooClose(centroid)) {
    return centroid;
  }

  const offsets: ViewportCoordinate[] = [
    { x: 0, y: -20 },
    { x: 18, y: -14 },
    { x: -18, y: -14 },
    { x: 20, y: 0 },
    { x: -20, y: 0 },
    { x: 0, y: 20 },
    { x: 18, y: 14 },
    { x: -18, y: 14 },
  ];

  for (const offset of offsets) {
    const candidate = { x: centroid.x + offset.x, y: centroid.y + offset.y };
    if (isPointInsidePolygon(candidate, hullPoints) && !isTooClose(candidate)) {
      return candidate;
    }
  }

  return centroid;
}

export function buildCompositeHull(support: CompositeHullSupport, mode: CompositeHullMode) {
  const flattenedSupportPoints = dedupeOrderedPoints([
    ...support.instantPoints,
    ...support.childPolygons.flat(),
  ]);
  const convexPoints = buildConvexHull(flattenedSupportPoints);
  if (mode === "convex") {
    return convexPoints;
  }

  return buildYSweepHull(support);
}
