/** Fixed World-coordinate addressing. Spatial levels do not select semantic LOD. */
export type RenderBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}>;
export type RenderTileAddress = Readonly<{
  level: number;
  x: number;
  y: number;
  bucketKind?: "overflow";
}>;
export type RenderSpatialFrame = Readonly<{
  format: "render-spatial-frame/1";
  originX: number;
  originY: number;
  baseSpanX: number;
  baseSpanY: number;
  minLevel: number;
  maxLevel: number;
}>;

/** About 37 layout lanes by 117 chronology years at L0 (110 / 140 units).
 * This versioned choice never changes with occupied bounds or Event count. */
export const V5_RENDER_SPATIAL_FRAME: RenderSpatialFrame = Object.freeze({
  format: "render-spatial-frame/1",
  originX: 0,
  originY: 0,
  baseSpanX: 4096,
  baseSpanY: 16384,
  minLevel: -8,
  maxLevel: 12
});

export function validateRenderSpatialFrame(frame: RenderSpatialFrame): void {
  if (
    frame.format !== "render-spatial-frame/1" ||
    ![frame.originX, frame.originY, frame.baseSpanX, frame.baseSpanY].every(
      Number.isFinite
    ) ||
    frame.baseSpanX <= 0 ||
    frame.baseSpanY <= 0 ||
    !Number.isInteger(frame.minLevel) ||
    !Number.isInteger(frame.maxLevel) ||
    frame.minLevel < -30 ||
    frame.maxLevel > 30 ||
    frame.minLevel > frame.maxLevel
  )
    throw Error("render_spatial_frame_invalid");
}

function spans(frame: RenderSpatialFrame, level: number) {
  validateRenderSpatialFrame(frame);
  if (
    !Number.isInteger(level) ||
    level < frame.minLevel ||
    level > frame.maxLevel
  )
    throw Error("render_level_invalid");
  const x = frame.baseSpanX * 2 ** -level;
  const y = frame.baseSpanY * 2 ** -level;
  if (![x, y].every(Number.isFinite) || x <= 0 || y <= 0)
    throw Error("render_spatial_frame_invalid");
  return { x, y };
}

export function renderTileBounds(
  frame: RenderSpatialFrame,
  address: RenderTileAddress
): RenderBounds {
  const span = spans(frame, address.level);
  if (!Number.isSafeInteger(address.x) || !Number.isSafeInteger(address.y))
    throw Error("render_tile_address_invalid");
  const minX = frame.originX + address.x * span.x;
  const minY = frame.originY + address.y * span.y;
  const maxX = frame.originX + (address.x + 1) * span.x;
  const maxY = frame.originY + (address.y + 1) * span.y;
  if (
    ![minX, minY, maxX, maxY].every(Number.isFinite) ||
    minX >= maxX ||
    minY >= maxY
  )
    throw Error("render_tile_address_invalid");
  return { minX, maxX, minY, maxY };
}

/** Cells and nonempty coverage own [min,max). A zero-width coordinate belongs
 * to its positive-side cell, including zero and negative exact boundaries.
 * Check cardinality before enumeration so hostile viewports cannot allocate
 * unbounded arrays. Empty sparse cells remain addresses, never graph lookups. */
export function renderTileAddresses(
  frame: RenderSpatialFrame,
  bounds: RenderBounds,
  level: number,
  maxTiles = 256
): RenderTileAddress[] {
  const span = spans(frame, level);
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.minX > bounds.maxX ||
    bounds.minY > bounds.maxY
  )
    throw Error("render_viewport_invalid");
  if (!Number.isSafeInteger(maxTiles) || maxTiles < 1)
    throw Error("render_tile_budget_invalid");
  const minX = Math.floor((bounds.minX - frame.originX) / span.x) || 0;
  const minY = Math.floor((bounds.minY - frame.originY) / span.y) || 0;
  const maxX =
    bounds.minX === bounds.maxX
      ? minX
      : Math.ceil((bounds.maxX - frame.originX) / span.x) - 1;
  const maxY =
    bounds.minY === bounds.maxY
      ? minY
      : Math.ceil((bounds.maxY - frame.originY) / span.y) - 1;
  if (![minX, minY, maxX, maxY].every(Number.isSafeInteger))
    throw Error("render_tile_address_invalid");
  const count = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > maxTiles)
    throw Error("render_tile_budget_exceeded");
  const result: RenderTileAddress[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const address = { level, x, y };
      renderTileBounds(frame, address);
      result.push(address);
    }
  return result;
}

export function renderTileKey(
  scope: Readonly<{ worldId: string; revision: number; timeSystemId: string }>,
  address: RenderTileAddress
): string {
  if (![address.level, address.x, address.y].every(Number.isSafeInteger))
    throw Error("render_tile_address_invalid");
  return `worlds/${scope.worldId}/revisions/${scope.revision}/v5/render/${scope.timeSystemId}/${address.bucketKind === "overflow" ? "overflow/" : ""}${address.level}/${address.x}/${address.y}.json`;
}

/** Coarse home for large closed geometry, read alongside finer point buckets. */
export function renderOverflowTileKey(
  scope: Readonly<{ worldId: string; revision: number; timeSystemId: string }>,
  address: RenderTileAddress
): string {
  return renderTileKey(scope, { ...address, bucketKind: "overflow" });
}
