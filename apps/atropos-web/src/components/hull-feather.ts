import { areaD, EndType, inflatePathsD, JoinType } from "clipper2-ts";
import { flattenGeographicPath } from "./geographic-mesh";

export const HULL_FEATHER_WIDTH_PX = 2.4;
const MAX_CACHE_ENTRIES = 128;
const MAX_CACHE_CHARACTERS = 1_000_000;
const MAX_CONTOUR_VERTICES = 4096;
const INWARD_WEIGHTS = {
  2: [0.4, 0.6],
  4: [0.12, 0.26, 0.34, 0.28]
} as const;

export type HullFeatherLayer = Readonly<{
  /** Disconnected pieces of one inset share a weight, not separate coats. */
  contours: readonly string[];
  /** Fraction of the original fill's optical density. All layers sum to one. */
  weight: number;
}>;

type Geometry = {
  contours: readonly (readonly string[])[];
  characters: number;
};

const geometryCache = new Map<string, Geometry>();
let cachedCharacters = 0;

/** Preserve total source-over coverage when one translucent coat is divided
 * into weighted layers. Multiply blending is a display fallback: its RGB is
 * an approximation to the primary painter's spectral optical-density sum. */
export function hullLayerOpacity(alpha: number, weight: number): number {
  if (!Number.isFinite(alpha) || !Number.isFinite(weight) || weight <= 0)
    return 0;
  const opacity = Math.min(1, Math.max(0, alpha));
  if (opacity === 1) return 1;
  return -Math.expm1(Math.log1p(-opacity) * weight);
}

function remember(key: string, geometry: Geometry) {
  if (geometry.characters > MAX_CACHE_CHARACTERS) return geometry;
  geometryCache.set(key, geometry);
  cachedCharacters += geometry.characters;
  while (
    geometryCache.size > MAX_CACHE_ENTRIES ||
    cachedCharacters > MAX_CACHE_CHARACTERS
  ) {
    const oldest = geometryCache.keys().next().value!;
    cachedCharacters -= geometryCache.get(oldest)!.characters;
    geometryCache.delete(oldest);
  }
  return geometry;
}

function geometryFor(path: string, width: number, coatCount: 2 | 4): Geometry {
  const key = `${coatCount}:${width}:${path}`;
  const cached = geometryCache.get(key);
  if (cached) {
    geometryCache.delete(key);
    geometryCache.set(key, cached);
    return cached;
  }
  const contours: (readonly string[])[] = [[path]];
  let characters = path.length * 2;
  try {
    let points = flattenGeographicPath(path);
    if (points.length < 3 || Math.abs(areaD(points)) < 0.000001)
      return remember(key, { contours, characters });
    if (areaD(points) < 0) points = points.toReversed();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    // Even a thin authored contour keeps a solid inner body. Local narrow
    // necks may split naturally under erosion; do not join them with a fan.
    const insetWidth = Math.min(width, (maxX - minX) / 5, (maxY - minY) / 5);
    for (let band = 1; band < coatCount; band++) {
      const inset = inflatePathsD(
        [points],
        (-insetWidth * band) / (coatCount - 1),
        JoinType.Round,
        EndType.Polygon,
        2,
        3
      );
      // The input is a single simple contour. Should an offset ever introduce
      // a hole, retain the last valid coat: the mesh painter must not fill it.
      if (
        !inset.length ||
        inset.some((part) => areaD(part) < -0.000001) ||
        inset.reduce((count, part) => count + part.length, 0) >
          MAX_CONTOUR_VERTICES
      )
        break;
      const paths = inset
        .filter((part) => part.length >= 3 && areaD(part) > 0.000001)
        .map((part) => {
          if (part.some((point) => !Number.isFinite(point.x + point.y)))
            throw Error("invalid_hull_feather_contour");
          return (
            part
              .map(
                (point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`
              )
              .join(" ") + " Z"
          );
        });
      if (!paths.length) break;
      characters += paths.reduce((sum, value) => sum + value.length, 0);
      if (characters > MAX_CACHE_CHARACTERS) break;
      contours.push(paths);
    }
  } catch {
    // A paint enhancement never removes the existing authored shape or asks
    // the renderer to accept a different path grammar.
  }
  return remember(key, { contours, characters });
}

/** A bounded inward coverage ramp, with no blur/filter/offscreen texture.
 * Width is in path coordinates: callers compensate for retained camera scale
 * to keep the maximum feather screen-sized. Strength follows border fade.
 * Mix weights as optical density (or alpha = 1 - (1 - alpha)^weight), rather
 * than multiplying alpha directly and making the fully covered body lighter.
 * The optional two-coat mode retains the full inset width and optical density,
 * with nearly the same edge coverage centroid but one offset instead of three.
 */
export function hullFeatherLayers(
  path: string,
  strength: number,
  widthPx = HULL_FEATHER_WIDTH_PX,
  coatCount: 2 | 4 = 4
): readonly HullFeatherLayer[] {
  const amount = Number.isFinite(strength)
    ? Math.min(1, Math.max(0, strength))
    : 0;
  const width = Number.isFinite(widthPx)
    ? Math.floor(Math.min(64, Math.max(0, widthPx)) * 20 + 0.000001) / 20
    : 0;
  if (!amount || !width || !path) return [{ contours: [path], weight: 1 }];
  const weights = INWARD_WEIGHTS[coatCount];
  const geometry = geometryFor(path, width, coatCount);
  const layers = geometry.contours.map((contours, index) => ({
    contours,
    weight: index === 0 ? 1 - amount : 0
  }));
  for (let band = 0; band < weights.length; band++) {
    // If erosion exhausts a tiny shape, keep its remaining pigment on the
    // last nonempty contour instead of dropping the whole Composite.
    layers[Math.min(band, layers.length - 1)]!.weight +=
      amount * weights[band]!;
  }
  return layers;
}
