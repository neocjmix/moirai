import type {
  GraphShellChartPlaneEntity,
  GraphShellChartPlaneRegionEntity
} from "../../shared/contracts";
import {
  buildCompositeHull,
  type CompositeHullMode
} from "./graph-shell-region-geometry";
import type { ViewportCoordinate } from "./graph-shell-composite";
type CompositeHullGeometry = { points: ViewportCoordinate[] };
type Bounds = GraphShellChartPlaneRegionEntity["worldBounds"];

function worldBoundsIntersect(
  bounds: GraphShellChartPlaneRegionEntity["worldBounds"],
  viewportBounds: GraphShellChartPlaneRegionEntity["worldBounds"]
) {
  return (
    bounds.maxX >= viewportBounds.minX &&
    bounds.minX <= viewportBounds.maxX &&
    bounds.maxY >= viewportBounds.minY &&
    bounds.minY <= viewportBounds.maxY
  );
}

function worldBoundsToPolygon(
  bounds: GraphShellChartPlaneRegionEntity["worldBounds"]
): ViewportCoordinate[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
}

function collectRecursiveRegionClosure(
  seedRegionIds: Set<string>,
  regionById: Map<string, GraphShellChartPlaneRegionEntity>,
  parentRegionIdsByChildId: Map<string, Set<string>>
) {
  const allRegionIds = new Set<string>();
  const stack = [...seedRegionIds];

  while (stack.length > 0) {
    const regionId = stack.pop();
    if (!regionId || allRegionIds.has(regionId)) {
      continue;
    }

    allRegionIds.add(regionId);
    const region = regionById.get(regionId);
    if (!region) {
      continue;
    }

    for (const childId of region.contains) {
      if (regionById.has(childId) && !allRegionIds.has(childId)) {
        stack.push(childId);
      }
    }

    for (const parentRegionId of parentRegionIdsByChildId.get(regionId) ?? []) {
      if (!allRegionIds.has(parentRegionId)) {
        stack.push(parentRegionId);
      }
    }
  }

  return allRegionIds;
}

function computeRegionDepth(
  regionId: string,
  regionById: Map<string, GraphShellChartPlaneRegionEntity>,
  memo: Map<string, number>,
  visited: Set<string>
): number {
  if (memo.has(regionId)) {
    return memo.get(regionId) ?? 0;
  }

  if (visited.has(regionId)) {
    return 0;
  }

  visited.add(regionId);
  const region = regionById.get(regionId);
  if (!region) {
    memo.set(regionId, 0);
    return 0;
  }

  const childRegionIds = region.contains.filter((childId) =>
    regionById.has(childId)
  );
  if (childRegionIds.length === 0) {
    memo.set(regionId, 0);
    return 0;
  }

  const depth =
    1 +
    Math.max(
      ...childRegionIds.map((childId) =>
        computeRegionDepth(childId, regionById, memo, new Set(visited))
      )
    );
  memo.set(regionId, depth);
  return depth;
}

/** Build original geometry once per response; navigation only selects from it. */
export function prepareCompositeWorldGeometry(
  entities: readonly GraphShellChartPlaneEntity[],
  points: readonly { id: string; x: number; y: number }[],
  mode: CompositeHullMode
) {
  const allWorldInstantPointById = new Map(
    points.map((point) => [point.id, point])
  );
  const regionById = new Map(
    entities
      .filter(
        (
          entity
        ): entity is Extract<
          GraphShellChartPlaneEntity,
          { geometryKind: "region" }
        > => entity.geometryKind === "region"
      )
      .map((entity) => [entity.id, entity])
  );
  const parentRegionIdsByChildId = new Map<string, Set<string>>();
  for (const region of regionById.values()) {
    for (const childId of region.contains) {
      const parents =
        parentRegionIdsByChildId.get(childId) ?? new Set<string>();
      parents.add(region.id);
      parentRegionIdsByChildId.set(childId, parents);
    }
  }

  const selectedRegionEntities = [...regionById.values()];
  const regionDepthById = new Map<string, number>();
  for (const entity of selectedRegionEntities) {
    regionDepthById.set(
      entity.id,
      computeRegionDepth(
        entity.id,
        regionById,
        regionDepthById,
        new Set<string>()
      )
    );
  }

  const supportCompleteById = new Map<string, boolean>();
  const regionGeometryById = new Map<string, CompositeHullGeometry>();
  const rawRegions = selectedRegionEntities
    .sort(
      (left, right) =>
        (regionDepthById.get(left.id) ?? 0) -
          (regionDepthById.get(right.id) ?? 0) ||
        left.id.localeCompare(right.id)
    )
    .map((entity) => {
      const directSupportPoints: ViewportCoordinate[] = [];
      const childRegionPolygons: ViewportCoordinate[][] = [];

      for (const childId of entity.contains) {
        if (allWorldInstantPointById.has(childId)) {
          const point = allWorldInstantPointById.get(childId);
          if (point) {
            directSupportPoints.push({ x: point.x, y: point.y });
          }
          continue;
        }

        const childRegionGeometry = regionGeometryById.get(childId);
        if (childRegionGeometry) {
          childRegionPolygons.push(childRegionGeometry.points);
        }
      }

      const fallbackBoundsPolygon =
        directSupportPoints.length === 0 && childRegionPolygons.length === 0
          ? worldBoundsToPolygon(entity.worldBounds)
          : [];
      const hullSupportPoints =
        directSupportPoints.length > 0
          ? directSupportPoints
          : fallbackBoundsPolygon;

      const hullPoints = entity.preparedCompactBounds
        ? worldBoundsToPolygon(entity.preparedCompactBounds)
        : entity.preparedWorldHull && mode === "concave"
        ? entity.preparedWorldHull
        : buildCompositeHull(
            {
              instantPoints: hullSupportPoints,
              childPolygons: childRegionPolygons
            },
            mode
          );
      const geometry = {
        points: hullPoints
      } satisfies CompositeHullGeometry;
      regionGeometryById.set(entity.id, geometry);
      const supportComplete = entity.preparedWorldHull || entity.preparedCompactBounds
        ? entity.childrenComplete === true
        : entity.childrenComplete === true && entity.contains.length > 0 && entity.contains.every((id) => allWorldInstantPointById.has(id) || supportCompleteById.get(id) === true);
      supportCompleteById.set(entity.id, supportComplete);

      return {
        id: entity.id,
        label: entity.label,
        supportComplete,
        depth: entity.preparedDepth ?? (regionDepthById.get(entity.id) ?? 0) + 1,
        contains: entity.contains,
        containedBy: entity.containedBy,
        editorial: entity.editorial,
        points: geometry.points,
        hullPending: Boolean(entity.preparedCompactBounds)
      };
    })
    .filter((region) => region !== null)
    .sort(
      (left, right) =>
        left.depth - right.depth || left.id.localeCompare(right.id)
    );

  return { regions: rawRegions, regionById, parentRegionIdsByChildId, points };
}

/** Bounds come from inverting the viewport, before projecting any points. */
export function selectCompositeWorldRegions(
  prepared: ReturnType<typeof prepareCompositeWorldGeometry>,
  visibleBounds: Bounds,
  pointBounds: Bounds
) {
  const seedVisibleInstantIds = new Set(
    prepared.points
      .filter(
        (point) =>
          point.x >= pointBounds.minX &&
          point.x <= pointBounds.maxX &&
          point.y >= pointBounds.minY &&
          point.y <= pointBounds.maxY
      )
      .map((point) => point.id)
  );
  const seedRegionIds = new Set(
    [...prepared.regionById.values()]
      .filter(
        (region) =>
          region.contains.some((id) => seedVisibleInstantIds.has(id)) ||
          worldBoundsIntersect(region.worldBounds, visibleBounds)
      )
      .map((region) => region.id)
  );
  const ids = collectRecursiveRegionClosure(
    seedRegionIds,
    prepared.regionById,
    prepared.parentRegionIdsByChildId
  );
  return prepared.regions.filter((region) => ids.has(region.id));
}
