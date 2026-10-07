/** Moirai's background paint boundary. Domain decisions and the SVG overlay
 * remain in GraphShell; no rendering-engine object crosses this contract. */
export type Rgba = readonly [number, number, number, number];
export type GeographicTransform = readonly [number, number, number, number];
export type GeographicView = Readonly<{
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}>;
export type GeographicSize = Readonly<{ width: number; height: number }>;
export type GeographicDensity = Readonly<{
  radius: number;
  strokeWidth: number;
  opacity: number;
}>;
export type GeographicScenePoint = Readonly<{
  id: string;
  x: number;
  y: number;
  opacity: number;
  pointDisplay: GeographicDensity;
  paintView: GeographicView;
  paintViewport: GeographicSize;
}>;
export type GeographicSceneRegion = Readonly<{
  id: string;
  path: string;
  pathTransform?: string;
  paintView?: GeographicView;
  paintViewport?: GeographicSize;
  renderedOpacity: number;
  surfaceOpacity: number;
  pointDisplay: GeographicDensity;
  compactPoint?: Readonly<{ x: number; y: number }> | null;
  representation?: Readonly<{
    point?: Readonly<{ x: number; y: number }>;
    hullOpacity: number;
    hullStrokeOpacity: number;
    hullFillOpacity?: number;
    pointOpacity: number;
  }>;
}>;
export type GeographicRenderScene = Readonly<{
  regions: readonly GeographicSceneRegion[];
  points: readonly GeographicScenePoint[];
  colors: ReadonlyMap<string, Readonly<{ fill: string; label: string }>>;
  view: GeographicView;
  size: GeographicSize;
  fillOpacity: number;
  strokeOpacity: number;
}>;
export type GeographicRenderFrame = Readonly<{
  now: number;
  dpr: number;
  reducedMotion: boolean;
  pointFill: Rgba;
  pointStroke: Rgba;
  edgeStrategy: "native" | "hard";
}>;
export type GeographicGeometry = Readonly<{
  /** Changes only when a new mesh is built; includes authored identity. */
  key: string;
  /** Nonindexed triangle vertices, x/y pairs in the retained path frame. */
  fill: Float32Array;
  /** Triangle vertices: position.xy, neighbour.xy, side; five floats each. */
  stroke: Float32Array;
}>;
export type GeographicPreparedHull = Readonly<{
  id: string;
  geometry: GeographicGeometry;
  /** Retained path coordinates to current CSS screen coordinates. */
  transform: GeographicTransform;
  fill: Rgba;
  stroke: Rgba;
  /** Coverage includes the authored fill alpha. Do not multiply fill[3] again. */
  fillOpacity: number;
  /** Coverage includes the authored stroke alpha. */
  strokeOpacity: number;
  /** 0 = sharp stroked hull; 1 = fully soft unstroked representation. */
  softness: number;
}>;
export type GeographicPreparedPoint = Readonly<{
  id: string;
  /** Stable World position: transform with the scene camera on the GPU. */
  x: number;
  y: number;
  radius: number;
  strokeWidth: number;
  /** Display coverage; multiply by the point fill/stroke alpha when painting. */
  opacity: number;
  fill: Rgba;
}>;
export type GeographicPreparedScene = Readonly<{
  hulls: readonly GeographicPreparedHull[];
  points: readonly GeographicPreparedPoint[];
  /** World coordinates to current CSS screen coordinates. */
  camera: GeographicTransform;
  animating: boolean;
  /** Cumulative CPU mesh build count since this preparer was mounted. */
  meshBuilds: number;
}>;
export type GeographicRendererStats = Readonly<{
  drawCalls?: number;
  meshBuilds?: number;
  bufferUploads?: number;
  resourceCount?: number;
  resourceBytes?: number;
  hullCount?: number;
  pointCount?: number;
}>;
export interface GeographicRendererBackend {
  render(scene: GeographicRenderScene, frame: GeographicRenderFrame): boolean;
  stats(): GeographicRendererStats;
  dispose(): void;
}
export type GeographicRendererFactory = (
  canvas: HTMLCanvasElement
) => Promise<GeographicRendererBackend>;
