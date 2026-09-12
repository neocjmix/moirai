// Copied from neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760
// urdr/apps/web/src/graph-read-loader.ts. Pure spatial primitives only.
// Extraction changes: local type imports; exports for characterization tests.
// No production caller until M4.6-D. Caller must restrict chartPlane to query scopes.
import type {
  GraphShellChartPlane,
  GraphShellChartPlaneEntity,
  GraphShellViewportQuery
} from "../shared/contracts";

function pointInBbox(
  point: { x: number; y: number },
  bbox: GraphShellViewportQuery["bbox"]
) {
  return (
    point.x >= bbox.minX &&
    point.x <= bbox.maxX &&
    point.y >= bbox.minY &&
    point.y <= bbox.maxY
  );
}

function entityIntersectsBbox(
  entity: GraphShellChartPlaneEntity,
  bbox: GraphShellViewportQuery["bbox"]
) {
  if (entity.geometryKind === "point") {
    return pointInBbox(entity.position, bbox);
  }

  if (entity.geometryKind === "segment") {
    if (pointInBbox(entity.start, bbox) || pointInBbox(entity.end, bbox)) {
      return true;
    }
    const minX = Math.min(entity.start.x, entity.end.x);
    const maxX = Math.max(entity.start.x, entity.end.x);
    const minY = Math.min(entity.start.y, entity.end.y);
    const maxY = Math.max(entity.start.y, entity.end.y);
    return !(
      maxX < bbox.minX ||
      minX > bbox.maxX ||
      maxY < bbox.minY ||
      minY > bbox.maxY
    );
  }

  return !(
    entity.worldBounds.maxX < bbox.minX ||
    entity.worldBounds.minX > bbox.maxX ||
    entity.worldBounds.maxY < bbox.minY ||
    entity.worldBounds.minY > bbox.maxY
  );
}

export function filterStaticViewportEntities(
  chartPlane: GraphShellChartPlane,
  query: Pick<
    GraphShellViewportQuery,
    "canonIds" | "bbox" | "selectedEntityId" | "includeNeighbors"
  >
): GraphShellChartPlaneEntity[] {
  const canonSet = new Set(query.canonIds);
  const regionEntities = chartPlane.entities.filter(
    (
      entity
    ): entity is Extract<
      GraphShellChartPlaneEntity,
      { geometryKind: "region" }
    > => entity.geometryKind === "region" && canonSet.has(entity.canonId)
  );
  const regionById = new Map(
    regionEntities.map((entity) => [entity.id, entity])
  );
  const parentRegionIdsByChildRef = new Map<string, Set<string>>();
  for (const region of regionEntities) {
    for (const childRef of region.contains) {
      const parentIds =
        parentRegionIdsByChildRef.get(childRef) ?? new Set<string>();
      parentIds.add(region.id);
      parentRegionIdsByChildRef.set(childRef, parentIds);
    }
  }
  const linearEntities = chartPlane.entities.filter(
    (entity) =>
      entity.geometryKind !== "region" &&
      canonSet.has(entity.canonId) &&
      entityIntersectsBbox(entity, query.bbox)
  );
  const byEventId = new Map(
    chartPlane.entities.map((entity) => [entity.eventId, entity])
  );
  const selectedEntity = query.selectedEntityId
    ? byEventId.get(query.selectedEntityId)
    : undefined;
  const results = new Map(linearEntities.map((entity) => [entity.id, entity]));

  if (selectedEntity) {
    results.set(selectedEntity.id, selectedEntity);
    if (query.includeNeighbors) {
      const selectedId = query.selectedEntityId ?? selectedEntity.eventId;
      for (const entity of chartPlane.entities) {
        if (entity.canonId !== selectedEntity.canonId) {
          continue;
        }

        if (
          entity.eventId === selectedId ||
          entity.contains.includes(selectedId) ||
          selectedEntity.contains.includes(entity.eventId) ||
          entity.containedBy === selectedEntity.id ||
          selectedEntity.containedBy === entity.id
        ) {
          results.set(entity.id, entity);
        }
      }
    }
  }

  const visibleEntityIds = new Set(
    [...results.values()].map((entity) => entity.id)
  );
  const visibleEventIds = new Set(
    [...results.values()].map((entity) => entity.eventId)
  );
  for (const entity of regionEntities) {
    if (
      entityIntersectsBbox(entity, query.bbox) ||
      entity.contains.some(
        (childId) =>
          visibleEntityIds.has(childId) || visibleEventIds.has(childId)
      ) ||
      (query.selectedEntityId
        ? entity.contains.includes(query.selectedEntityId)
        : false)
    ) {
      results.set(entity.id, entity);
    }
  }

  const queuedRegionIds = [...results.values()]
    .filter(
      (
        entity
      ): entity is Extract<
        GraphShellChartPlaneEntity,
        { geometryKind: "region" }
      > => entity.geometryKind === "region"
    )
    .map((entity) => entity.id);
  while (queuedRegionIds.length > 0) {
    const regionId = queuedRegionIds.pop();
    if (!regionId) {
      continue;
    }

    const region = regionById.get(regionId);
    if (!region) {
      continue;
    }

    const parentIds = new Set<string>();
    if (region.containedBy) {
      parentIds.add(region.containedBy);
    }
    for (const parentId of parentRegionIdsByChildRef.get(region.id) ?? []) {
      parentIds.add(parentId);
    }
    for (const parentId of parentRegionIdsByChildRef.get(region.eventId) ??
      []) {
      parentIds.add(parentId);
    }

    for (const parentId of parentIds) {
      const parent = regionById.get(parentId);
      if (!parent || results.has(parent.id)) {
        continue;
      }

      results.set(parent.id, parent);
      queuedRegionIds.push(parent.id);
    }

    for (const childId of region.contains) {
      const childRegion = regionById.get(childId);
      if (!childRegion || results.has(childRegion.id)) {
        continue;
      }

      results.set(childRegion.id, childRegion);
      queuedRegionIds.push(childRegion.id);
    }
  }

  return [...results.values()];
}

export function getBandRange(params: {
  viewportMinY: number;
  viewportMaxY: number;
  bandSize: number;
  overscanBefore?: number;
  overscanAfter?: number;
}) {
  const {
    viewportMinY,
    viewportMaxY,
    bandSize,
    overscanBefore = 1,
    overscanAfter = 2
  } = params;
  const minY = Math.min(viewportMinY, viewportMaxY);
  const maxY = Math.max(viewportMinY, viewportMaxY);
  const startBand = Math.floor(minY / bandSize);
  const endBand = Math.floor(maxY / bandSize);

  return {
    startBand: startBand - overscanBefore,
    endBand: endBand + overscanAfter
  };
}

export function mergeUniqueEntities(entities: GraphShellChartPlaneEntity[]) {
  const entityById = new Map<string, GraphShellChartPlaneEntity>();
  for (const entity of entities) {
    entityById.set(entity.id, entity);
  }
  return [...entityById.values()];
}

export function applyCanonOffset(
  entity: GraphShellChartPlaneEntity,
  offsetX: number
): GraphShellChartPlaneEntity {
  if (offsetX === 0) {
    return entity;
  }

  if (entity.geometryKind === "point") {
    return {
      ...entity,
      position: { ...entity.position, x: entity.position.x + offsetX }
    };
  }

  if (entity.geometryKind === "segment") {
    return {
      ...entity,
      start: { ...entity.start, x: entity.start.x + offsetX },
      end: { ...entity.end, x: entity.end.x + offsetX }
    };
  }

  return {
    ...entity,
    worldBounds: {
      ...entity.worldBounds,
      minX: entity.worldBounds.minX + offsetX,
      maxX: entity.worldBounds.maxX + offsetX
    }
  };
}
