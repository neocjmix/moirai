import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import type {
  GraphShellChartPlaneEntity,
  GraphShellViewportResponse
} from "../urdr-port/shared/contracts";

/** Translate a complete fine tile working set to the established GraphShell
 * presentation contract. Tile grid clusters are transport LOD, never events. */
export function renderTileViewport(input: {
  worldId: string;
  revision: number;
  primitives: readonly RenderPrimitive[];
  relationTypes: readonly string[];
}): GraphShellViewportResponse {
  const { worldId, revision, primitives } = input;
  const base = (primitive: RenderPrimitive) => ({
    id: primitive.entity.id,
    eventId: primitive.entity.id,
    canonId: worldId,
    label: primitive.label,
    validationState: "ok" as const,
    contains: [] as string[],
    diagnostics: [],
    viewportClass: "visible" as const
  });
  const entities: GraphShellChartPlaneEntity[] = [];
  const regions: GraphShellChartPlaneEntity[] = [];
  const edges: GraphShellChartPlaneEntity[] = [];
  for (const primitive of primitives) {
    const geometry = primitive.geometry;
    if (primitive.entity.kind === "cluster") continue;
    if (geometry.kind === "external") throw Error("render_geometry_unresolved");
    if (primitive.entity.kind === "composite") {
      if (geometry.kind !== "polygon") continue; // discard coarse center
      if (!primitive.composite || !geometry.rings[0]?.length)
        throw Error("render_composite_metadata_missing");
      regions.push({
        ...base(primitive),
        geometryKind: "region",
        worldBounds: primitive.composite.worldBounds,
        contains: [...primitive.composite.childEventIds],
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
