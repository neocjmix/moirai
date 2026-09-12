import type {
  CanonicalEventReference,
  MoiraiGraphDiagnostic,
  PublicTimeSystem
} from "@moirai/contracts";
import {
  TemporalAdapterRegistry,
  solveTemporalConstraints,
  temporalAdapterForTimeSystem,
  type TemporalConstraint,
  type TemporalProjection
} from "@moirai/domain";
import { type PresentationInput, type PresentationScope } from "./index.js";
import {
  buildGraphShellChartPlane,
  CHRONOLOGY_YEAR_SPACING,
  type TemporalConstraint as LayoutConstraint
} from "./urdr-chart-plane.js";
import type { Dataset, GraphShellChartPlane } from "./urdr-layout-types.js";

export const PRESENTATION_LAYOUT_VERSION = "urdr-0267c8f-moirai/1";
export interface ScopeLayout {
  readonly scope: PresentationScope;
  readonly chartPlane: GraphShellChartPlane;
  readonly unplaced: readonly string[];
  readonly temporal: readonly TemporalProjection[];
  readonly diagnostics: readonly MoiraiGraphDiagnostic[];
}

/** Only registered Moirai codecs resolve canonical coordinates; never URDR's calendar helpers. */
function registryFor(
  input: PresentationInput,
  worldId: string
): TemporalAdapterRegistry {
  return new TemporalAdapterRegistry(
    input.sidecar.time_systems
      .filter((s) => s.world_id === worldId)
      .flatMap((s) => {
        // kind is used solely to select the existing explicit codec implementation,
        // not to infer compatibility or write a Time System record.
        const system: PublicTimeSystem = {
          id: s.identity.time_system_id,
          world_id: worldId,
          slug: "presentation",
          title: "presentation",
          kind:
            s.definition.calendar === "proleptic-gregorian"
              ? "calendar"
              : "custom",
          definition_version: s.identity.definition_version,
          definition: s.definition
        };
        const adapter = temporalAdapterForTimeSystem(system);
        return adapter ? [adapter] : [];
      })
  );
}

/** Presentation-only scalar, with a shared deterministic origin per registered codec. */
function numericReference(
  ref: CanonicalEventReference,
  registry: TemporalAdapterRegistry,
  input: PresentationInput,
  worldId: string
): number | null {
  if (ref.kind !== "time_event") return null;
  const adapter = registry.get(
    ref.time_system_ref.time_system_id,
    ref.definition_version
  );
  const system = input.sidecar.time_systems.find(
    (s) =>
      s.world_id === worldId &&
      s.identity.time_system_id === ref.time_system_ref.time_system_id &&
      s.identity.definition_version === ref.definition_version
  );
  if (!adapter?.difference || !system) return null;
  const gregorian =
    system.definition.coordinate_codec === "yyyy-iso-fields-fraction12-z-v1";
  const origin = gregorian ? "0000-01-01T00:00:00.000000000000Z" : "0";
  try {
    const difference = adapter.difference(origin, ref.coordinate);
    const value = Number(difference.value) / (gregorian ? 31_556_952 : 1);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function layoutPresentationScope(
  input: PresentationInput,
  scope: PresentationScope
): ScopeLayout {
  const diagnostics: MoiraiGraphDiagnostic[] = [];
  const report = (code: string, ids: readonly string[], message: string) =>
    diagnostics.push({
      code,
      source: scope.source,
      affected_ids: ids,
      severity: "warning",
      message
    });
  const registry = registryFor(input, scope.source.world_id);
  const constraints: TemporalConstraint[] = scope.links.flatMap((link) => {
    const r = link.relation;
    return r.type === "precedes" ||
      r.type === "not_after" ||
      r.type === "coincides"
      ? [{ id: r.id, type: r.type, source: r.source_ref, target: r.target_ref }]
      : [];
  });
  const solved = solveTemporalConstraints(constraints, registry);
  for (const diagnostic of solved.diagnostics)
    report(
      "m46_" + diagnostic.code,
      diagnostic.constraint_ids,
      diagnostic.message
    );
  const positions = new Map(solved.projections.map((p) => [p.event_id, p]));
  const extents = new Map<string, { minYear: number; maxYear: number }>();
  const ranks = new Map(scope.nodes.map((n) => [n.id, 0]));
  const layoutConstraints: LayoutConstraint[] = [];
  for (const link of scope.links) {
    if (!["precedes", "not_after", "coincides"].includes(link.relation.type))
      continue;
    const gap = link.relation.type === "precedes" ? 0.001 : 0;
    layoutConstraints.push({
      beforeId: link.sourceId,
      afterId: link.targetId,
      source: link.relation.id,
      minGapYears: gap
    });
    if (link.relation.type === "coincides")
      layoutConstraints.push({
        beforeId: link.targetId,
        afterId: link.sourceId,
        source: link.relation.id,
        minGapYears: 0
      });
  }
  // Longest lower-bound rank; zero-weight equality/non-strict cycles converge.
  // No rank is assigned to disconnected Events without temporal evidence.
  if (solved.valid)
    for (let pass = 0; pass < scope.nodes.length; pass++) {
      let changed = false;
      for (const edge of layoutConstraints) {
        const next =
          (ranks.get(edge.beforeId) ?? 0) + (edge.minGapYears > 0 ? 1 : 0);
        if (next > (ranks.get(edge.afterId) ?? 0)) {
          ranks.set(edge.afterId, next);
          changed = true;
        }
      }
      if (!changed) break;
    }
  for (const node of scope.nodes) {
    if (!solved.valid && node.shape !== "anchor") continue;
    const position =
      node.reference.kind === "event"
        ? positions.get(node.reference.event_id)
        : null;
    const single = node.temporalPosition;
    let lower: CanonicalEventReference | null = null;
    let upper: CanonicalEventReference | null = null;
    if (node.reference.kind === "time_event") lower = upper = node.reference;
    else if (position?.kind === "exact") lower = upper = position.time_event;
    else if (position?.kind === "bounded") {
      lower = position.lower?.time_event ?? null;
      upper = position.upper?.time_event ?? null;
    } else if (single?.kind === "exact") lower = upper = single.at;
    else if (single?.kind === "bounded") {
      lower = single.lower;
      upper = single.upper;
    }
    if (lower || upper) {
      const lo = lower
        ? numericReference(lower, registry, input, scope.source.world_id)
        : null;
      const hi = upper
        ? numericReference(upper, registry, input, scope.source.world_id)
        : null;
      if ((lower && lo === null) || (upper && hi === null)) {
        report(
          "m46_coordinate_not_drawable",
          [node.identityKey],
          "Registered coordinate arithmetic is unavailable or exceeds finite display range; the lossless reference remains in the sidecar."
        );
        continue;
      }
      extents.set(node.id, {
        minYear: lo ?? Number.NEGATIVE_INFINITY,
        maxYear: hi ?? Number.POSITIVE_INFINITY
      });
      report(
        "m46_numeric_display_only",
        [node.identityKey],
        "SVG coordinates are approximate display numbers, not canonical time or Duration. Read the lossless reference and inclusive/strict bounds in the inspector."
      );
    } else if (
      position?.kind === "relative-only" ||
      single?.kind === "relative_only"
    ) {
      const rank = ranks.get(node.id) ?? 0;
      extents.set(node.id, { minYear: rank, maxYear: rank });
    }
  }

  const heightById = new Map<string, number>();
  const byId = new Map(scope.nodes.map((n) => [n.id, n]));
  const height = (id: string, path = new Set<string>()): number => {
    const known = heightById.get(id);
    if (known !== undefined) return known;
    if (path.has(id)) {
      report(
        "m46_containment_cycle",
        [id],
        "Containment cycle has no deepest-first geometry."
      );
      return 0;
    }
    const node = byId.get(id);
    if (!node) return 0;
    const nextPath = new Set(path).add(id);
    const value = node.contains.length
      ? 1 + Math.max(...node.contains.map((child) => height(child, nextPath)))
      : 0;
    heightById.set(id, value);
    return value;
  };
  const ordered = [...scope.nodes].sort(
    (a, b) => height(a.id) - height(b.id) || a.id.localeCompare(b.id)
  );
  const dataset: Dataset = {
    events: ordered.map((n) => ({
      id: n.id,
      canonId: scope.id,
      title: n.label,
      type:
        n.shape === "region"
          ? "composite"
          : n.shape === "anchor"
            ? "temporal-anchor"
            : "instant"
    })),
    canons: [],
    timeSystems: [],
    structuralLinks: scope.links
      .filter((l) => l.relation.type === "causes")
      .map((l) => ({
        id: l.id,
        type: "CAUSES",
        fromEventId: l.sourceId,
        toEventId: l.targetId,
        canonId: scope.id
      })),
    semanticLinks: scope.links
      .filter((l) => l.relation.type !== "causes")
      .map((l) => ({
        id: l.id,
        type: l.relation.type === "not_after" ? "not-after" : l.relation.type,
        fromId: l.sourceId,
        toId: l.targetId
      }))
  };
  // Do not inherit URDR's starts/ends -> contains shortcut. Membership was
  // already resolved explicitly by the Moirai presentation input.
  dataset.semanticLinks = dataset.semanticLinks.filter(
    (l) => !["contains", "starts", "ends"].includes(l.type)
  );
  for (const node of ordered)
    for (const child of node.contains)
      dataset.semanticLinks.push({
        id: "membership:" + node.id + ":" + child,
        type: "contains",
        fromId: node.id,
        toId: child
      });
  const board = {
    axis: {
      startYear: 0,
      endYear: 0,
      timeSystemId: input.sidecar.query.temporal_frame.target.time_system_id,
      compatibilityKey:
        input.sidecar.query.temporal_frame.target.comparison_domain
    }
  };
  const chartPlane = buildGraphShellChartPlane(dataset, board, {
    explicitExtents: extents,
    temporalConstraints: layoutConstraints
  });
  for (const diagnostic of chartPlane.diagnostics) {
    report("m46_urdr_" + diagnostic.code, [], diagnostic.message);
  }
  // User decision: preserve the original placement; track its bounds defect
  // in backlog #57 and expose it without changing canonical time evidence.
  const unsafe = chartPlane.entities.filter((e) => {
    if (e.geometryKind !== "point") return false;
    const bounds = extents.get(e.eventId);
    if (!bounds) return false;
    return (
      !Number.isFinite(e.position.y) ||
      e.position.y < bounds.minYear * CHRONOLOGY_YEAR_SPACING ||
      e.position.y > bounds.maxYear * CHRONOLOGY_YEAR_SPACING
    );
  });
  if (unsafe.length)
    report(
      "m46_legacy_layout_outside_semantic_bounds",
      unsafe.map((e) => e.id),
      "Known URDR display defect (backlog #57): cluster redistribution exceeded an individual temporal interval. Geometry is approximate; canonical bounds remain unchanged in the inspector."
    );
  const drawableIds = new Set(chartPlane.entities.map((e) => e.eventId));
  const unplaced = scope.nodes
    .filter((n) => n.shape !== "anchor" && !drawableIds.has(n.id))
    .map((n) => n.id);
  if (unplaced.length)
    report(
      "m46_geometry_unplaced",
      unplaced,
      "No solved geometry exists; no arbitrary date or placeholder origin was substituted."
    );
  return {
    scope,
    chartPlane,
    unplaced,
    temporal: solved.projections,
    diagnostics
  };
}
