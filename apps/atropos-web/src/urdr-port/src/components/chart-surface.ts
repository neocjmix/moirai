// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import type { ImageViewportView } from "./image-viewport";

export type WorldPoint = {
  x: number;
  y: number;
};

export type ViewportPoint = {
  x: number;
  y: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type ChartPointShape = {
  id: string;
  kind: "point";
  name: string;
  position: WorldPoint;
  fill: string;
};

export type ChartSegmentShape = {
  id: string;
  kind: "segment";
  name: string;
  start: WorldPoint;
  end: WorldPoint;
  stroke: string;
};

export type ChartShape = ChartPointShape | ChartSegmentShape;

export type ProjectedChartPointShape = ChartPointShape & {
  viewportPosition: ViewportPoint;
  labelAnchor: ViewportPoint;
};

export type ProjectedChartSegmentShape = ChartSegmentShape & {
  viewportStart: ViewportPoint;
  viewportEnd: ViewportPoint;
  labelAnchor: ViewportPoint;
};

export type ProjectedChartShape = ProjectedChartPointShape | ProjectedChartSegmentShape;

export type WorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type GridLine = {
  id: string;
  orientation: "vertical" | "horizontal";
  worldValue: number;
  viewportStart: ViewportPoint;
  viewportEnd: ViewportPoint;
};

export type ChartPlaneSnapshot = {
  viewportSize: ViewportSize;
  visibleWorldBounds: WorldBounds;
  gridLines: GridLine[];
  shapes: ProjectedChartShape[];
};

const GRID_TARGET_SPACING = 96;
const GRID_PAD_LINES = 1;

export function projectWorldPoint(view: ImageViewportView, viewportSize: ViewportSize, point: WorldPoint): ViewportPoint {
  return {
    x: viewportSize.width / 2 + view.x + point.x * view.scaleX,
    y: viewportSize.height / 2 + view.y + point.y * view.scaleY
  };
}

export function projectViewportPointToWorld(view: ImageViewportView, viewportSize: ViewportSize, point: ViewportPoint): WorldPoint {
  return {
    x: (point.x - viewportSize.width / 2 - view.x) / view.scaleX,
    y: (point.y - viewportSize.height / 2 - view.y) / view.scaleY
  };
}

export function projectWorldPoints(view: ImageViewportView, viewportSize: ViewportSize, points: WorldPoint[]) {
  return points.map((point) => projectWorldPoint(view, viewportSize, point));
}

export function getShapeLabelAnchor(shape: ChartShape): WorldPoint {
  if (shape.kind === "point") {
    return shape.position;
  }

  return {
    x: (shape.start.x + shape.end.x) / 2,
    y: (shape.start.y + shape.end.y) / 2
  };
}

export function getVisibleWorldBounds(view: ImageViewportView, viewportSize: ViewportSize): WorldBounds {
  const minX = (0 - viewportSize.width / 2 - view.x) / view.scaleX;
  const maxX = (viewportSize.width - viewportSize.width / 2 - view.x) / view.scaleX;
  const minY = (0 - viewportSize.height / 2 - view.y) / view.scaleY;
  const maxY = (viewportSize.height - viewportSize.height / 2 - view.y) / view.scaleY;

  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY)
  };
}

export function expandWorldBoundsForViewportRequest(bounds: WorldBounds): WorldBounds {
  const xPad = (bounds.maxX - bounds.minX) * 1.5;
  const yPad = (bounds.maxY - bounds.minY) * 1.5;

  return {
    minX: bounds.minX - xPad,
    maxX: bounds.maxX + xPad,
    minY: bounds.minY - yPad,
    maxY: bounds.maxY + yPad,
  };
}

function getNiceStep(targetWorldUnits: number) {
  const safeTarget = Math.max(targetWorldUnits, 0.000001);
  const magnitude = 10 ** Math.floor(Math.log10(safeTarget));
  const normalized = safeTarget / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function range(start: number, end: number, step: number) {
  const values: number[] = [];
  for (let current = start; current <= end + step * 0.5; current += step) {
    values.push(Number(current.toFixed(6)));
  }
  return values;
}

export function getDynamicGrid(view: ImageViewportView, viewportSize: ViewportSize): GridLine[] {
  const bounds = getVisibleWorldBounds(view, viewportSize);
  const xStep = getNiceStep(GRID_TARGET_SPACING / Math.abs(view.scaleX));
  const yStep = getNiceStep(GRID_TARGET_SPACING / Math.abs(view.scaleY));
  const startX = Math.floor(bounds.minX / xStep - GRID_PAD_LINES) * xStep;
  const endX = Math.ceil(bounds.maxX / xStep + GRID_PAD_LINES) * xStep;
  const startY = Math.floor(bounds.minY / yStep - GRID_PAD_LINES) * yStep;
  const endY = Math.ceil(bounds.maxY / yStep + GRID_PAD_LINES) * yStep;
  const lines: GridLine[] = [];

  for (const worldX of range(startX, endX, xStep)) {
    lines.push({
      id: `grid:v:${worldX}`,
      orientation: "vertical",
      worldValue: worldX,
      viewportStart: projectWorldPoint(view, viewportSize, { x: worldX, y: bounds.minY - yStep * GRID_PAD_LINES }),
      viewportEnd: projectWorldPoint(view, viewportSize, { x: worldX, y: bounds.maxY + yStep * GRID_PAD_LINES })
    });
  }

  for (const worldY of range(startY, endY, yStep)) {
    lines.push({
      id: `grid:h:${worldY}`,
      orientation: "horizontal",
      worldValue: worldY,
      viewportStart: projectWorldPoint(view, viewportSize, { x: bounds.minX - xStep * GRID_PAD_LINES, y: worldY }),
      viewportEnd: projectWorldPoint(view, viewportSize, { x: bounds.maxX + xStep * GRID_PAD_LINES, y: worldY })
    });
  }

  return lines;
}

export function createChartPlaneSnapshot(view: ImageViewportView, viewportSize: ViewportSize, shapes: ChartShape[]): ChartPlaneSnapshot {
  const visibleWorldBounds = getVisibleWorldBounds(view, viewportSize);

  return {
    viewportSize,
    visibleWorldBounds,
    gridLines: getDynamicGrid(view, viewportSize),
    shapes: shapes.map<ProjectedChartShape>((shape) => {
      const labelAnchor = projectWorldPoint(view, viewportSize, getShapeLabelAnchor(shape));

      if (shape.kind === "point") {
        return {
          ...shape,
          viewportPosition: projectWorldPoint(view, viewportSize, shape.position),
          labelAnchor
        };
      }

      if (shape.kind === "segment") {
        return {
          ...shape,
          viewportStart: projectWorldPoint(view, viewportSize, shape.start),
          viewportEnd: projectWorldPoint(view, viewportSize, shape.end),
          labelAnchor
        };
      }

      const segmentShape = shape as ChartSegmentShape;
      return {
        ...segmentShape,
        viewportStart: projectWorldPoint(view, viewportSize, segmentShape.start),
        viewportEnd: projectWorldPoint(view, viewportSize, segmentShape.end),
        labelAnchor
      };
    })
  };
}
