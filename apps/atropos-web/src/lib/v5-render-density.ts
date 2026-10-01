import type { RenderPrimitive } from "@moirai/graph-presentation/server";
export type RenderDensity = {
  pointScale: number;
  opacity: number;
  labelOpacity: number;
};
export type ResolvedRenderPrimitive = RenderPrimitive & {
  renderDensity?: RenderDensity;
};
type Box = { minX: number; maxX: number; minY: number; maxY: number };
const overlaps = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const normal: RenderDensity = { pointScale: 1, opacity: 1, labelOpacity: 1 };
const small: RenderDensity = { pointScale: 0.35, opacity: 1, labelOpacity: 0 };
const hidden: RenderDensity = { pointScale: 0.2, opacity: 0, labelOpacity: 0 };

/** Visibility is presentation, never a synthetic entity or canonical importance.
 * Publication already bounds candidates; this final local budget does not hide
 * an unbounded network read. Hysteresis leaves at most eight extra normal dots.
 */
export function selectRenderDensity(
  primitives: readonly RenderPrimitive[],
  viewport: Box,
  previous: ReadonlyMap<string, RenderDensity>,
  selectedId?: string
): ResolvedRenderPrimitive[] {
  if (!primitives.some((p) => p.visibility?.policy === "render-visibility/1"))
    return [...primitives];
  const candidates = primitives.filter(
    (p) => p.entity.kind !== "relation" && overlaps(p.bounds, viewport)
  );
  candidates.sort(
    (a, b) =>
      Number(b.entity.id === selectedId) - Number(a.entity.id === selectedId) ||
      (a.visibility?.priority ?? a.id).localeCompare(
        b.visibility?.priority ?? b.id
      ) ||
      a.id.localeCompare(b.id)
  );
  const admitted = candidates.slice(0, 128);
  const result = admitted.map((p, rank): ResolvedRenderPrimitive => {
    const old = previous.get(p.id);
    const threshold =
      candidates.length <= 64
        ? 64
        : old?.labelOpacity === 1
          ? 72
          : old?.labelOpacity === 0
            ? 56
            : 64;
    if (rank < threshold) return { ...p, renderDensity: normal };
    if (rank < 96) return { ...p, renderDensity: small };
    // Bounded outgoing band fades rather than popping at the admission edge.
    const opacity = Math.max(0, 1 - (rank - 96) / 31);
    return {
      ...p,
      renderDensity: { ...small, opacity, pointScale: 0.2 + 0.15 * opacity }
    };
  });
  const entities = new Set(
    result
      .filter((p) => (p.renderDensity?.opacity ?? 1) > 0)
      .map((p) => p.entity.id)
  );
  const relations = primitives
    .filter(
      (p) =>
        p.entity.kind === "relation" &&
        overlaps(p.bounds, viewport) &&
        p.endpointIds?.every((id) => entities.has(id))
    )
    .sort((a, b) =>
      (a.visibility?.priority ?? a.id).localeCompare(
        b.visibility?.priority ?? b.id
      )
    )
    .slice(0, 32);
  return [...result, ...relations];
}
export const hiddenRenderDensity = hidden;
