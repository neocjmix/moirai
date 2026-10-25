import type { CompositePaddingProfile } from "@moirai/graph-presentation/composite-padding-profile";
import { expandCompositePolygon } from "./composite-local-padding";
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
  paddingProfile?: CompositePaddingProfile;
  tuning: CompositeSplineTuning;
  labelHeight?: number;
  labelGap?: number;
};
export type CompositeGeometryEntry = {
  support: readonly ViewportCoordinate[];
  scaleX: number;
  scaleY: number;
  padding: number;
  paddingProfile?: CompositePaddingProfile;
  tuning: CompositeSplineTuning;
  origin: ViewportCoordinate;
  expanded: ViewportCoordinate[];
  path: string;
  vertices: number;
  labelPaths?: ReturnType<typeof prepareCompositeLabelPaths>;
};

function sameProfile(left: CompositePaddingProfile | undefined, right: CompositePaddingProfile | undefined) {
  return left === right || (left !== undefined && right !== undefined && left.length === right.length && left.every((band, index) =>
    band.minY === right[index]!.minY && band.maxY === right[index]!.maxY && band.depth === right[index]!.depth));
}

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
  const entries = new Map<string, CompositeGeometryEntry>();
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
    project({id, points, view, viewport, padding, paddingProfile, tuning, labelHeight, labelGap}: Request) {
      const origin = {x: viewport.width / 2 + view.x, y: viewport.height / 2 + view.y};
      // Keep point/composite LOD coordinates exact. Only expensive padded hull
      // geometry and its SVG path are reused through a pure translation.
      const projectedHullPoints = points.map(point => ({
        x: origin.x + point.x * view.scaleX,
        y: origin.y + point.y * view.scaleY
      }));
      let entry = entries.get(id);
      if (entry && entry.scaleX === view.scaleX && entry.scaleY === view.scaleY &&
          entry.padding === padding && sameProfile(entry.paddingProfile, paddingProfile) && entry.tuning.smoothing === tuning.smoothing &&
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
        const expanded = paddingProfile?.length ? expandCompositePolygon(projectedHullPoints, paddingProfile.map((band) => ({
          minY: origin.y + band.minY * view.scaleY,
          maxY: origin.y + band.maxY * view.scaleY,
          depth: band.depth
        }))) : expandPolygon(projectedHullPoints, padding);
        entry = {
          support: points,
          scaleX: view.scaleX,
          scaleY: view.scaleY,
          padding,
          ...(paddingProfile ? { paddingProfile } : {}),
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
      const shapeEntry = entry;
      const inheritedLabelPaths = entry.labelPaths;
      let resolvedLabelFrame = false;
      let labelPathFrame: {prepared: ReturnType<typeof prepareCompositeLabelPaths>; offset: ViewportCoordinate} | undefined;
      return {
        projectedHullPoints,
        projectedPoints: dx === 0 && dy === 0 ? entry.expanded : entry.expanded.map(point => ({x: point.x + dx, y: point.y + dy})),
        path: entry.path,
        // Compact owners use a point label and never read this frame. Keep
        // their exact hull/stage geometry, but build edge contours only when
        // an actual hull label needs them. One projection counts at most one
        // label-cache access, even if its caller reads the frame repeatedly.
        get labelPathFrame() {
          if (!resolvedLabelFrame) {
            let prepared = inheritedLabelPaths;
            if (labelHeight !== undefined && labelGap !== undefined) {
              if (!shapeEntry.labelPaths || shapeEntry.labelPaths.labelHeight !== labelHeight || shapeEntry.labelPaths.labelGap !== labelGap) {
                shapeEntry.labelPaths = prepareCompositeLabelPaths(shapeEntry.expanded, labelHeight, labelGap);
                labelPathBuilds++;
              } else labelPathHits++;
              prepared = shapeEntry.labelPaths;
            }
            labelPathFrame = prepared ? {prepared, offset: {x: dx, y: dy}} : undefined;
            resolvedLabelFrame = true;
          }
          return labelPathFrame;
        },
        pathTransform: dx === 0 && dy === 0 ? undefined : `translate(${dx} ${dy})`
      };
    },
    snapshot(): [string, CompositeGeometryEntry][] { return [...entries]; },
    hydrate(snapshot: [string, CompositeGeometryEntry][]) {
      for (const id of entries.keys()) if (!snapshot.some(([key]) => key === id)) remove(id);
      for (const [id, entry] of snapshot) {
        remove(id);
        entries.set(id, entry);
        vertices += entry.vertices;
        pathCharacters += entry.path.length;
      }
    },
    retain(ids: ReadonlySet<string>) {
      for (const id of entries.keys()) if (!ids.has(id)) { remove(id); evictions++; }
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
