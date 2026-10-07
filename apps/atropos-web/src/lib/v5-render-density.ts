import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { selectRenderPrimitiveClosure } from "@moirai/graph-presentation/render-primitive-admission";
import { semanticTextWidth } from "./graph-semantic-budget";
import { COMPOSITE_HIDDEN_SPAN_PX } from "../urdr-port/src/components/composite-point-display";
import {
  compositeStageSpan,
  resolveCompositeHierarchySpans
} from "../urdr-port/src/components/composite-visibility-policy";
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

/** Use the same ordered authored spans for admission and geometry prefetch.
 * Reverse ancestry also covers Composite child lists capped in Publication. */
export function resolveRenderCompositeSpans(
  primitives: readonly RenderPrimitive[],
  camera: { scaleX: number; scaleY: number }
): Map<string, number> {
  const children = new Map<string, Set<string>>();
  for (const primitive of primitives) {
    if (primitive.entity.kind !== "composite") continue;
    const own = children.get(primitive.entity.id) ?? new Set<string>();
    for (const child of primitive.composite?.childEventIds ?? [])
      own.add(child);
    children.set(primitive.entity.id, own);
    for (const ancestor of primitive.ancestorCompositeIds ??
      primitive.parentCompositeIds ??
      []) {
      const ids = children.get(ancestor) ?? new Set<string>();
      ids.add(primitive.entity.id);
      children.set(ancestor, ids);
    }
  }
  return resolveCompositeHierarchySpans(
    primitives
      .filter((primitive) => primitive.entity.kind === "composite")
      .map((primitive) => {
        const bounds = primitive.composite?.hullBounds ?? primitive.bounds;
        return {
          id: primitive.entity.id,
          span: compositeStageSpan(
            (bounds.maxX - bounds.minX) * camera.scaleX,
            (bounds.maxY - bounds.minY) * camera.scaleY
          ),
          childIds: [...(children.get(primitive.entity.id) ?? [])]
        };
      })
  );
}

/** Visibility is presentation, never a synthetic entity or canonical importance.
 * Publication already bounds candidates; this final local budget does not hide
 * an unbounded network read. Hysteresis leaves at most eight extra normal dots.
 */
export function selectRenderDensity(
  primitives: readonly RenderPrimitive[],
  viewport: Box,
  previous: ReadonlyMap<string, RenderDensity>,
  selectedId?: string,
  camera?: { scaleX: number; scaleY: number }
): ResolvedRenderPrimitive[] {
  if (!primitives.some((p) => p.visibility?.policy === "render-visibility/1"))
    return [...primitives];
  const candidates = primitives.filter(
    (p) => p.entity.kind !== "relation" && overlaps(p.bounds, viewport)
  );
  const compositeSpans = camera
    ? resolveRenderCompositeSpans(primitives, camera)
    : new Map<string, number>();
  // Keep the authored owner through its hull, large-point and small-point
  // handoff before density ranks individual children. Releasing priority at
  // compact entry would drop the replacement point in the very same frame.
  const visibleComposite = (p: RenderPrimitive) => {
    if (!camera || p.entity.kind !== "composite" || !p.composite) return false;
    const span = compositeSpans.get(p.entity.id) ?? 0;
    return span === 0 || span > COMPOSITE_HIDDEN_SPAN_PX;
  };
  candidates.sort(
    (a, b) =>
      Number(b.entity.id === selectedId) - Number(a.entity.id === selectedId) ||
      Number(visibleComposite(b)) - Number(visibleComposite(a)) ||
      (a.visibility?.priority ?? a.id).localeCompare(
        b.visibility?.priority ?? b.id
      ) ||
      a.id.localeCompare(b.id)
  );
  const available = primitives.filter((p) => p.entity.kind !== "relation");
  const admitted = selectRenderPrimitiveClosure(candidates, 128, { available });
  const result = admitted.map((p, rank): ResolvedRenderPrimitive => {
    // Ancestors enter before a selected descendant. Its explicit focus must
    // still retain normal paint even when a deep closure uses many ranks.
    if (p.entity.id === selectedId) return { ...p, renderDensity: normal };
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
  // Keep a bounded paint buffer outside the exact screen. The loader already
  // owns a larger spatial working set, but discarding it here caused points to
  // disappear at the screen edge until the next read completed. Offscreen
  // candidates must not consume the visible scene's 128 density ranks.
  const dx = (viewport.maxX - viewport.minX) * 0.05;
  const dy = (viewport.maxY - viewport.minY) * 0.05;
  const paintBounds = {
    minX: viewport.minX - dx,
    maxX: viewport.maxX + dx,
    minY: viewport.minY - dy,
    maxY: viewport.maxY + dy
  };
  const labelIntersects = (primitive: RenderPrimitive) => {
    if (
      !camera ||
      !Number.isFinite(camera.scaleX) ||
      camera.scaleX <= 0 ||
      !Number.isFinite(camera.scaleY) ||
      camera.scaleY <= 0
    )
      return false;
    if (primitive.entity.kind === "composite") {
      // A hull label can continue past any edge, including while external
      // support is still pending. Keep only candidates in the existing bounded
      // working set; final native label placement decides glyph intersection.
      const bounds = primitive.composite?.hullBounds ?? primitive.bounds;
      const reach = semanticTextWidth(primitive.label) + 24;
      return overlaps(
        {
          minX: bounds.minX - reach / camera.scaleX,
          maxX: bounds.maxX + reach / camera.scaleX,
          minY: bounds.minY - reach / camera.scaleY,
          maxY: bounds.maxY + reach / camera.scaleY
        },
        viewport
      );
    }
    if (primitive.geometry.kind !== "point") return false;
    const { x, y } = primitive.geometry.xy;
    // Match the native point label's screen offsets and full glyph width.
    // X/Y scales are independent; a percentage margin cannot represent text.
    return overlaps(
      {
        minX: x + 10 / camera.scaleX,
        maxX: x + (10 + semanticTextWidth(primitive.label)) / camera.scaleX,
        minY: y - 24 / camera.scaleY,
        maxY: y - 6 / camera.scaleY
      },
      viewport
    );
  };
  const bufferedCandidates = primitives
    .map((p) => ({ primitive: p, labelVisible: labelIntersects(p) }))
    .filter(
      ({ primitive: p, labelVisible }) =>
        p.entity.kind !== "relation" &&
        !overlaps(p.bounds, viewport) &&
        (labelVisible || overlaps(p.bounds, paintBounds))
    )
    .sort(
      (a, b) =>
        Number(b.labelVisible) - Number(a.labelVisible) ||
        (a.primitive.visibility?.priority ?? a.primitive.id).localeCompare(
          b.primitive.visibility?.priority ?? b.primitive.id
        ) ||
        a.primitive.id.localeCompare(b.primitive.id)
    )
    .map(({ primitive }) => primitive);
  const buffered = selectRenderPrimitiveClosure(bufferedCandidates, 32, {
    available,
    already: admitted
  }).map((p): ResolvedRenderPrimitive => ({
    ...p,
    renderDensity: previous.get(p.id) ?? normal
  }));
  result.push(...buffered);
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
