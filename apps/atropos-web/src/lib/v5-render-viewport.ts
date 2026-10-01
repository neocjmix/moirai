import type { ResolvedRenderPrimitive } from "./v5-render-density";
import type {
  GraphShellChartPlaneEntity,
  GraphShellViewportResponse
} from "../urdr-port/shared/contracts";

/** Translate a complete fine tile working set to the established GraphShell
 * presentation contract. Tile grid clusters are transport LOD, never events. */
export function renderTileViewport(input: {
  worldId: string;
  revision: number;
  primitives: readonly ResolvedRenderPrimitive[];
  relationTypes: readonly string[];
}): GraphShellViewportResponse {
  const { worldId, revision, primitives } = input;
  const visibleChildren = new Map<string, Set<string>>();
  for (const primitive of primitives) {
    if (primitive.entity.kind === "relation") continue;
    for (const ancestor of primitive.ancestorCompositeIds ??
      primitive.parentCompositeIds ??
      []) {
      const ids = visibleChildren.get(ancestor) ?? new Set<string>();
      ids.add(primitive.entity.id);
      visibleChildren.set(ancestor, ids);
    }
  }
  // These are prepared display closure links, not newly asserted contains
  // relations. They bridge a density-omitted middle Composite without a graph read.
  const displayChildren = (primitive: ResolvedRenderPrimitive) => [
    ...new Set([
      ...(primitive.composite?.childEventIds ?? []),
      ...(visibleChildren.get(primitive.entity.id) ?? [])
    ])
  ];
  const base = (primitive: ResolvedRenderPrimitive) => ({
    id: primitive.entity.id,
    eventId: primitive.entity.id,
    canonId: worldId,
    label: primitive.label,
    validationState: "ok" as const,
    contains: [] as string[],
    diagnostics: [],
    viewportClass: "visible" as const,
    ...(primitive.renderDensity
      ? { renderDensity: primitive.renderDensity }
      : {})
  });
  const entities: GraphShellChartPlaneEntity[] = [];
  const regions: GraphShellChartPlaneEntity[] = [];
  const edges: GraphShellChartPlaneEntity[] = [];
  for (const primitive of primitives) {
    const geometry = primitive.geometry;
    if (primitive.entity.kind === "cluster") continue;
    if (geometry.kind === "external") throw Error("render_geometry_unresolved");
    if (primitive.entity.kind === "composite") {
      if (geometry.kind === "point" && primitive.composite?.hullBounds) {
        regions.push({
          ...base(primitive),
          geometryKind: "region",
          worldBounds: primitive.composite.worldBounds,
          contains: displayChildren(primitive),
          ...(primitive.composite.depth === undefined
            ? {}
            : { preparedDepth: primitive.composite.depth }),
          childrenComplete: primitive.composite.supportComplete,
          preparedCompactBounds: primitive.composite.hullBounds
        });
        continue;
      }
      if (geometry.kind !== "polygon") continue; // legacy preview coarse center
      if (!primitive.composite || !geometry.rings[0]?.length)
        throw Error("render_composite_metadata_missing");
      regions.push({
        ...base(primitive),
        geometryKind: "region",
        worldBounds: primitive.composite.worldBounds,
        contains: displayChildren(primitive),
        ...(primitive.composite.depth === undefined
          ? {}
          : { preparedDepth: primitive.composite.depth }),
        childrenComplete: primitive.composite.supportComplete,
        preparedWorldHull: [...geometry.rings[0]]
      });
    } else if (primitive.entity.kind === "event") {
      const line = geometry.kind === "line" ? geometry.paths[0] : undefined;
      if (geometry.kind === "point")
        entities.push({
          ...base(primitive),
          geometryKind: "point",
          position: geometry.xy
        });
      else if (line && line.length >= 2)
        entities.push({
          ...base(primitive),
          geometryKind: "segment",
          start: line[0]!,
          end: line[line.length - 1]!
        });
    } else if (primitive.entity.kind === "relation") {
      const line = geometry.kind === "line" ? geometry.paths[0] : undefined;
      if (
        line &&
        line.length >= 2 &&
        primitive.endpointIds &&
        input.relationTypes.includes(primitive.label)
      )
        edges.push({
          ...base(primitive),
          id: primitive.entity.id,
          eventId: primitive.endpointIds[0],
          geometryKind: "segment",
          contains: [...primitive.endpointIds],
          start: line[0]!,
          end: line[line.length - 1]!
        });
    }
  }
  return {
    revision,
    canonicalRevision: revision,
    lodLevel: 0,
    entities,
    regions,
    edges,
    diagnostics: [],
    truncated: false,
    completeness: {
      entities: true,
      regions: true,
      edges: true,
      regionSupport: regions.every((region) =>
        region.geometryKind === "region"
          ? region.childrenComplete === true
          : true
      )
    },
    cache: { stale: false }
  };
}
