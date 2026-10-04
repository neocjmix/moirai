import {
  buildRenderConcaveHull,
  type LayoutOutput
} from "@moirai/graph-presentation/layout-engine";
import type { LabSnapshot } from "./types";
import type { LabCamera } from "./preset";

export type Point = { x: number; y: number };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export type LabGeometry = {
  id: string;
  bounds: Bounds;
  center: Point;
  polygon: Point[];
  kind: "point" | "segment" | "region";
  ends: Point[];
};
export function layoutGeometry(
  snapshot: LabSnapshot,
  output: LayoutOutput
): LabGeometry[] {
  const shapes = new Map(output.shapes.map((shape) => [shape.event_id, shape]));
  const events = new Map(snapshot.events.map((event) => [event.id, event]));
  const cache = new Map<string, LabGeometry>();
  const visiting = new Set<string>();
  const visit = (id: string): LabGeometry | null => {
    const known = cache.get(id);
    if (known) return known;
    const shape = shapes.get(id);
    if (!shape || visiting.has(id)) return null;
    visiting.add(id);
    const bounds =
      shape.kind === "point"
        ? {
            minX: shape.position.x,
            maxX: shape.position.x,
            minY: shape.position.y,
            maxY: shape.position.y
          }
        : shape.kind === "region"
          ? shape.bounds
          : {
              minX: Math.min(shape.start.x, shape.end.x),
              maxX: Math.max(shape.start.x, shape.end.x),
              minY: Math.min(shape.start.y, shape.end.y),
              maxY: Math.max(shape.start.y, shape.end.y)
            };
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    };
    const children = (events.get(id)?.childIds ?? []).flatMap((child) => {
      const value = visit(child);
      return value ? [value] : [];
    });
    const polygon =
      shape.kind === "region"
        ? buildRenderConcaveHull(
            children
              .filter((child) => child.kind !== "region")
              .flatMap((child) => child.ends),
            children
              .filter((child) => child.kind === "region")
              .map((child) => child.polygon)
          )
        : [];
    const geometry: LabGeometry = {
      id,
      bounds,
      center,
      polygon,
      kind: shape.kind,
      ends:
        shape.kind === "point"
          ? [shape.position]
          : shape.kind === "segment"
            ? [shape.start, shape.end]
            : polygon
    };
    visiting.delete(id);
    cache.set(id, geometry);
    return geometry;
  };
  return output.shapes.flatMap((shape) => {
    const geometry = visit(shape.event_id);
    return geometry ? [geometry] : [];
  });
}
export function fitCamera(geometry: readonly LabGeometry[]): LabCamera {
  if (!geometry.length) return { x: 0, y: 0, spanX: 1000, spanY: 1000 };
  const bounds = geometry.reduce(
    (value, item) => ({
      minX: Math.min(value.minX, item.bounds.minX),
      maxX: Math.max(value.maxX, item.bounds.maxX),
      minY: Math.min(value.minY, item.bounds.minY),
      maxY: Math.max(value.maxY, item.bounds.maxY)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    spanX: Math.max(200, bounds.maxX - bounds.minX) * 1.2,
    // A short authored interval still deserves the full viewport when focused.
    // Only an exact instant needs fallback context; do not impose a year floor.
    spanY:
      (bounds.maxY > bounds.minY
        ? Math.max(0.001, bounds.maxY - bounds.minY)
        : 140) * 1.2
  };
}
export function project(
  point: Point,
  camera: LabCamera,
  width: number,
  height: number
): Point {
  return {
    x: ((point.x - camera.x) * width) / camera.spanX + width / 2,
    y: ((point.y - camera.y) * height) / camera.spanY + height / 2
  };
}
