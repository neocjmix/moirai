import type { RenderPrimitive } from "@moirai/graph-presentation/server";

type Box = { minX: number; maxX: number; minY: number; maxY: number };
const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/** Each axis has its own camera scale. The geometric mean gives a continuous
 * semantic Level without silently treating a Y-only zoom as X-only zoom. */
export function levelForCamera(input: {
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  world: Box;
  maxLevel: number;
}): number {
  const { scaleX, scaleY, width, height, world, maxLevel } = input;
  if (
    ![
      scaleX,
      scaleY,
      width,
      height,
      maxLevel,
      world.minX,
      world.maxX,
      world.minY,
      world.maxY
    ].every(Number.isFinite) ||
    scaleX <= 0 ||
    scaleY <= 0 ||
    width <= 0 ||
    height <= 0 ||
    maxLevel < 0 ||
    world.maxX < world.minX ||
    world.maxY < world.minY
  )
    throw Error("render_camera_invalid");
  const x = (scaleX * Math.max(1, world.maxX - world.minX)) / width;
  const y = (scaleY * Math.max(1, world.maxY - world.minY)) / height;
  return clamp(Math.log2(Math.sqrt(x * y)), 0, maxLevel);
}

const ramp = (value: number, range: readonly [number, number]) =>
  range[1] === range[0]
    ? Number(value >= range[1])
    : clamp((value - range[0]) / (range[1] - range[0]), 0, 1);
export function interpolateRenderLevels(
  lower: readonly RenderPrimitive[],
  upper: readonly RenderPrimitive[],
  level: number
): { primitive: RenderPrimitive; opacity: number }[] {
  if (!Number.isFinite(level) || level < 0) throw Error("render_level_invalid");
  const fraction = level - Math.floor(level);
  const weighted = new Map<
    string,
    { primitive: RenderPrimitive; weight: number }
  >();
  for (const [items, weight] of [
    [lower, 1 - fraction],
    [upper, fraction]
  ] as const) {
    if (weight <= 0) continue;
    for (const primitive of items) {
      const previous = weighted.get(primitive.id);
      if (
        previous &&
        JSON.stringify(previous.primitive) !== JSON.stringify(primitive)
      )
        throw Error("render_replica_mismatch");
      weighted.set(primitive.id, {
        primitive,
        weight: (previous?.weight ?? 0) + weight
      });
    }
  }
  return [...weighted.values()]
    .map(({ primitive, weight }) => {
      const fadeIn = primitive.lod.fadeIn
        ? ramp(level, primitive.lod.fadeIn)
        : 1;
      const fadeOut = primitive.lod.fadeOut
        ? 1 - ramp(level, primitive.lod.fadeOut)
        : 1;
      return { primitive, opacity: weight * fadeIn * fadeOut };
    })
    .filter((item) => item.opacity > 0)
    .sort((a, b) => a.primitive.id.localeCompare(b.primitive.id));
}
