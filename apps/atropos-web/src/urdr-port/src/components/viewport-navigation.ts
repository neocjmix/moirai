import type { ImageViewportView } from "./image-viewport";
export type NavigationBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
type Size = { width: number; height: number };
export type NavigationScope = {
  canonId: string;
  widthHint: number;
  bounds: NavigationBounds | null;
  ready: boolean;
};
export function composeNavigationBounds(
  scopes: readonly NavigationScope[],
  ids: readonly string[]
): NavigationBounds | null {
  let offset = 0;
  let union: NavigationBounds | null = null;
  for (const id of ids) {
    const scope = scopes.find((s) => s.canonId === id);
    if (!scope?.ready) return null;
    const b = scope.bounds;
    if (b) {
      const shifted = { ...b, minX: b.minX + offset, maxX: b.maxX + offset };
      union = union
        ? {
            minX: Math.min(union.minX, shifted.minX),
            maxX: Math.max(union.maxX, shifted.maxX),
            minY: Math.min(union.minY, b.minY),
            maxY: Math.max(union.maxY, b.maxY)
          }
        : shifted;
    }
    offset += scope.widthHint + 240;
  }
  return union;
}
const rubber = (value: number, min: number, max: number, limit: number) => {
  const clamped = Math.max(min, Math.min(max, value));
  const delta = value - clamped;
  return (
    clamped +
    Math.sign(delta) * limit * (1 - Math.exp(-Math.abs(delta) / limit))
  );
};
export function constrainNavigation(
  view: ImageViewportView,
  size: Size,
  bounds: NavigationBounds | null,
  elastic = false,
  pivot = { x: 0, y: 0 }
): ImageViewportView {
  if (!bounds || size.width <= 0 || size.height <= 0) return view;
  const spanX = Math.max(120, bounds.maxX - bounds.minX),
    spanY = Math.max(120, bounds.maxY - bounds.minY);
  const centerX = (bounds.minX + bounds.maxX) / 2,
    centerY = (bounds.minY + bounds.maxY) / 2;
  const sx = Math.max(view.scaleX, Math.min(1, size.width / (spanX * 2))),
    sy = Math.max(view.scaleY, Math.min(1, size.height / (spanY * 2)));
  // Keep the pinch centroid's world point when the independent scales hit their minimum.
  const x = pivot.x - ((pivot.x - view.x) / view.scaleX) * sx,
    y = pivot.y - ((pivot.y - view.y) / view.scaleY) * sy;
  const clamp = (v: number, min: number, max: number, limit: number) =>
    elastic ? rubber(v, min, max, limit) : Math.max(min, Math.min(max, v));
  return {
    scaleX: sx,
    scaleY: sy,
    x: clamp(
      x,
      -(centerX + spanX / 2) * sx,
      -(centerX - spanX / 2) * sx,
      size.width * 0.18
    ),
    y: clamp(
      y,
      -(centerY + spanY / 2) * sy,
      -(centerY - spanY / 2) * sy,
      size.height * 0.18
    )
  };
}
export function restoreNavigation(
  view: ImageViewportView,
  size: Size,
  bounds: NavigationBounds | null,
  focus: { x: number; y: number } | null
): ImageViewportView {
  if (!bounds) return view;
  const x = -view.x / view.scaleX,
    y = -view.y / view.scaleY;
  const outside =
    x < bounds.minX - size.width / view.scaleX / 2 ||
    x > bounds.maxX + size.width / view.scaleX / 2 ||
    y < bounds.minY - size.height / view.scaleY / 2 ||
    y > bounds.maxY + size.height / view.scaleY / 2;
  if (!outside) return constrainNavigation(view, size, bounds);
  if (focus)
    return constrainNavigation(
      { ...view, x: -focus.x * view.scaleX, y: -focus.y * view.scaleY },
      size,
      bounds
    );
  const sx = Math.min(
    1,
    size.width / (Math.max(120, bounds.maxX - bounds.minX) * 2)
  );
  const sy = Math.min(
    1,
    size.height / (Math.max(120, bounds.maxY - bounds.minY) * 2)
  );
  return {
    x: (-(bounds.minX + bounds.maxX) / 2) * sx,
    y: (-(bounds.minY + bounds.maxY) / 2) * sy,
    scaleX: sx,
    scaleY: sy
  };
}
