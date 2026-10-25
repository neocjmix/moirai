/** Moirai's background paint boundary. Domain decisions and the SVG overlay
 * remain in GraphShell; no rendering-engine object crosses this contract. */
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
  sceneCamera?: GeographicView;
  size: GeographicSize;
  fillOpacity: number;
  strokeOpacity: number;
}>;
export type GeographicRenderFrame = Readonly<{ now: number }>;
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
