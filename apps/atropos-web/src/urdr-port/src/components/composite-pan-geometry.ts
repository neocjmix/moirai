import {
  buildClosedSplinePath,
  expandPolygon,
  prepareCompositeLabelPaths,
  type CompositeSplineTuning
} from "./graph-shell-region-geometry";
import type { ViewportCoordinate } from "./graph-shell-composite";

type View = { x: number; y: number; scaleX: number; scaleY: number };
type Size = { width: number; height: number };
type Request = {
  id: string;
  points: readonly ViewportCoordinate[];
  view: View;
  viewport: Size;
  padding: number;
  tuning: CompositeSplineTuning;
  labelHeight?: number;
  labelGap?: number;
};
type Entry = {
  support: readonly ViewportCoordinate[];
  scaleX: number;
  scaleY: number;
  padding: number;
  tuning: CompositeSplineTuning;
  origin: ViewportCoordinate;
  expanded: ViewportCoordinate[];
  path: string;
  vertices: number;
  labelPaths?: ReturnType<typeof prepareCompositeLabelPaths>;
};

function sameSupport(left: readonly ViewportCoordinate[], right: readonly ViewportCoordinate[]) {
  return left === right || (left.length === right.length && left.every((point, index) =>
    point.x === right[index]!.x && point.y === right[index]!.y));
}

/** Screen padding and spline handles depend on scale, but a pan translates
 * them unchanged. Keep one shape per region at its last scale. The caller owns
 * this cache for one graph/loader lifetime; no semantic or canonical state is
 * stored. Support arrays are immutable Publication inputs.
 */
export function createCompositePanGeometryCache({
  maxEntries = 128,
  maxVertices = 20_000,
  maxPathCharacters = 1_000_000
} = {}) {
  const entries = new Map<string, Entry>();
  let vertices = 0;
  let pathCharacters = 0;
  let builds = 0;
  let hits = 0;
  let evictions = 0;
  let labelPathBuilds = 0;
  let labelPathHits = 0;
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    vertices -= entry.vertices;
    pathCharacters -= entry.path.length;
  };

  return {
    project({id, points, view, viewport, padding, tuning, labelHeight, labelGap}: Request) {
      const origin = {x: viewport.width / 2 + view.x, y: viewport.height / 2 + view.y};
      // Keep point/composite LOD coordinates exact. Only expensive padded hull
      // geometry and its SVG path are reused through a pure translation.
      const projectedHullPoints = points.map(point => ({
        x: origin.x + point.x * view.scaleX,
        y: origin.y + point.y * view.scaleY
      }));
      let entry = entries.get(id);
      if (entry && entry.scaleX === view.scaleX && entry.scaleY === view.scaleY &&
          entry.padding === padding && entry.tuning.smoothing === tuning.smoothing &&
          entry.tuning.cornerFloor === tuning.cornerFloor && entry.tuning.balanceFloor === tuning.balanceFloor &&
          sameSupport(entry.support, points)) {
        hits++;
        // Fresh response arrays with identical geometry retain the same path.
        entry.support = points;
        entries.delete(id);
        entries.set(id, entry);
      } else {
        builds++;
        remove(id);
        const expanded = expandPolygon(projectedHullPoints, padding);
        entry = {
          support: points,
          scaleX: view.scaleX,
          scaleY: view.scaleY,
          padding,
          tuning: {...tuning},
          origin,
          expanded,
          path: buildClosedSplinePath(expanded, tuning),
          vertices: points.length + expanded.length
        };
        if (maxEntries > 0 && entry.vertices <= maxVertices && entry.path.length <= maxPathCharacters) {
          entries.set(id, entry);
          vertices += entry.vertices;
          pathCharacters += entry.path.length;
          while (entries.size > maxEntries || vertices > maxVertices || pathCharacters > maxPathCharacters) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            remove(oldest);
            evictions++;
          }
        }
      }
      const dx = origin.x - entry.origin.x;
      const dy = origin.y - entry.origin.y;
      if (labelHeight !== undefined && labelGap !== undefined) {
        if (!entry.labelPaths || entry.labelPaths.labelHeight !== labelHeight || entry.labelPaths.labelGap !== labelGap) {
          entry.labelPaths = prepareCompositeLabelPaths(entry.expanded, labelHeight, labelGap);
          labelPathBuilds++;
        } else labelPathHits++;
      }
      return {
        projectedHullPoints,
        projectedPoints: dx === 0 && dy === 0 ? entry.expanded : entry.expanded.map(point => ({x: point.x + dx, y: point.y + dy})),
        path: entry.path,
        labelPathFrame: entry.labelPaths ? {prepared: entry.labelPaths, offset: {x: dx, y: dy}} : undefined,
        pathTransform: dx === 0 && dy === 0 ? undefined : `translate(${dx} ${dy})`
      };
    },
    clear() {
      entries.clear();
      vertices = 0;
      pathCharacters = 0;
    },
    inspect() {
      return {entries: entries.size, vertices, pathCharacters, builds, hits, evictions, labelPathBuilds, labelPathHits,
        labelPathPoints: [...entries.values()].reduce((sum, entry) => sum + (entry.labelPaths?.paths.reduce((total, path) => total + path.points.length, 0) ?? 0), 0)};
    }
  };
}
