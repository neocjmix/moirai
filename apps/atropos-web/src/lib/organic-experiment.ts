/** Browser-local, revision-pinned Organic Surface experiment. No layout solve. */
import type { ResolvedRenderPrimitive } from "./v5-render-density";
import { TSTL_EXPERIMENT_SHA256 } from "./tstl-experiment-pin";
import { parseTstlLayoutChoice } from "./tstl-layout-preference";
import type {
  TstlExperimentCandidate,
  TstlExperimentMode,
  TstlExperimentPoint
} from "./tstl-experiment-types";
import {
  ORGANIC_SURFACE_VERSION,
  normalizeOrganicParameters,
  type OrganicSurfaceParameters,
  type OrganicSurfaceResult
} from "./organic-surface";

export type FrozenTstlBaseline = Exclude<TstlExperimentMode, "organic">;
export type OrganicDisplay = "base" | "padded" | "overlay";
export interface OrganicReproduction {
  format: "organic-surface-repro/1";
  sourceSha256: string;
  algorithmVersion: string;
  baseline: FrozenTstlBaseline;
  parameters: OrganicSurfaceParameters;
  display: OrganicDisplay;
  /** Existing shell URL state; includes exact viewport and selected Collections. */
  view: Record<string, string>;
}
export const ORGANIC_VIEW_KEYS = [
  "gsViewport",
  "gsCanons",
  "gsTimeline",
  "gsEvent",
  "gsStage",
  "event",
  "collections",
  "locale",
  "organicComposite"
] as const;
export function parseOrganicReproduction(json: string): OrganicReproduction {
  const value = JSON.parse(json) as OrganicReproduction;
  const baseline = parseTstlLayoutChoice(value.baseline);
  if (
    value.format !== "organic-surface-repro/1" ||
    value.sourceSha256 !== TSTL_EXPERIMENT_SHA256 ||
    value.algorithmVersion !== ORGANIC_SURFACE_VERSION ||
    !baseline ||
    baseline === "current" ||
    baseline === "organic" ||
    !["base", "padded", "overlay"].includes(value.display)
  )
    throw Error("organic_reproduction_source_or_version_mismatch");
  const view: Record<string, string> = {};
  for (const key of ORGANIC_VIEW_KEYS) {
    const entry = value.view?.[key];
    if (typeof entry === "string" && entry.length <= 10000) view[key] = entry;
  }
  return {
    format: "organic-surface-repro/1",
    sourceSha256: TSTL_EXPERIMENT_SHA256,
    algorithmVersion: ORGANIC_SURFACE_VERSION,
    baseline,
    parameters: normalizeOrganicParameters(value.parameters),
    display: value.display,
    view
  };
}
export function organicReproduction(
  baseline: FrozenTstlBaseline,
  parameters: OrganicSurfaceParameters,
  display: OrganicDisplay,
  search: string
): OrganicReproduction {
  const params = new URLSearchParams(search);
  return {
    format: "organic-surface-repro/1",
    sourceSha256: TSTL_EXPERIMENT_SHA256,
    algorithmVersion: ORGANIC_SURFACE_VERSION,
    baseline,
    parameters: normalizeOrganicParameters(parameters),
    display,
    view: Object.fromEntries(
      ORGANIC_VIEW_KEYS.flatMap((key) =>
        params.has(key) ? [[key, params.get(key)!]] : []
      )
    )
  };
}
/** A shared URL always outranks a browser's previous experiment. */
export function restoreOrganicReproduction(
  search: string,
  stored: string | null
): OrganicReproduction {
  const params = new URLSearchParams(search);
  const complete = params.get("organic");
  if (complete !== null) return parseOrganicReproduction(complete);
  const named = params.get("organicBaseline");
  if (named !== null) {
    const baseline = parseTstlLayoutChoice(named);
    if (!baseline || baseline === "current" || baseline === "organic")
      throw Error("organic_select_pinned_baseline_first");
    return organicReproduction(
      baseline,
      normalizeOrganicParameters(),
      "padded",
      search
    );
  }
  if (stored !== null) return parseOrganicReproduction(stored);
  throw Error("organic_select_pinned_baseline_first");
}
const bounds = (points: readonly TstlExperimentPoint[]) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
};
/** Only Composite ink changes. All anchors, semantic bounds, event and relation
 * primitives come from the chosen existing candidate byte-for-byte. */
export function organicExperimentGeometry(
  frozen: readonly ResolvedRenderPrimitive[],
  result: OrganicSurfaceResult,
  display: OrganicDisplay
) {
  const contours =
    display === "base"
      ? result.baseContoursByCompositeId
      : result.paddedContoursByCompositeId;
  const candidate: TstlExperimentCandidate = {
    algorithmVersion: result.algorithmVersion,
    fillRule: "evenodd",
    contoursByCompositeId: contours,
    xByEventId: {},
    worldBoundsByCompositeId: {},
    noAreaCompositeIds: [],
    memberships: result.composites.flatMap((composite) =>
      composite.memberEventIds.map((eventId) => {
        const missing = (
          display === "base"
            ? composite.baseMissingMemberIds
            : composite.paddedMissingMemberIds
        ).includes(eventId);
        return {
          compositeId: composite.compositeId,
          eventId,
          status: missing ? ("list" as const) : ("area" as const),
          ...(missing ? { reason: "FIXED_GLYPH_SUPPORT_CONFLICT" } : {})
        };
      })
    ),
    tracesByCompositeId:
      display === "overlay"
        ? Object.fromEntries(
            Object.entries(result.baseContoursByCompositeId).map(
              ([id, rings]) => [
                id,
                rings.map((ring) => ({
                  kind: "route" as const,
                  points: [...ring, ring[0]!]
                }))
              ]
            )
          )
        : {},
    diagnostics: result.diagnostics
  };
  const primitives = frozen.map((p): ResolvedRenderPrimitive => {
    if (p.entity.kind === "relation") return p;
    candidate.xByEventId[p.entity.id] =
      p.composite?.anchor?.x ??
      (p.geometry.kind === "point"
        ? p.geometry.xy.x
        : (p.bounds.minX + p.bounds.maxX) / 2);
    if (!p.composite?.anchor) return p;
    const id = p.entity.id,
      rings = contours[id] ?? [],
      anchor = p.composite.anchor;
    candidate.worldBoundsByCompositeId[id] = p.composite.worldBounds;
    if (!rings.length) candidate.noAreaCompositeIds.push(id);
    const support = [
      ...rings.flat(),
      ...(candidate.tracesByCompositeId?.[id] ?? []).flatMap((t) => t.points)
    ];
    return {
      ...p,
      geometry: rings.length
        ? { kind: "polygon", rings }
        : { kind: "point", xy: anchor },
      bounds: bounds([...support, anchor]),
      composite: {
        ...p.composite,
        hullBounds: bounds(support.length ? support : [anchor])
      }
    };
  });
  return { candidate, primitives };
}
