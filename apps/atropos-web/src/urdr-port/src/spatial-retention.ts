// Pinned source: neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760
// urdr/apps/web/src/graph-read-loader.ts. Retention helpers copied unchanged.
// Only the local metadata type seam and exports differ.
import type { SpatialEntityIndexEntry } from "@moirai/graph-presentation/server";
type StaticViewportEntityIndexEntry = SpatialEntityIndexEntry & {
  canonId: string;
  bandIndices: readonly number[];
};
type StaticViewportCanonMeta = {
  entityIndex: Record<string, StaticViewportEntityIndexEntry>;
};
function matchesRetentionSemantics(
  entity: StaticViewportEntityIndexEntry,
  selectedEntity: StaticViewportEntityIndexEntry,
  selectedEntityId: string
) {
  return (
    entity.eventId === selectedEntityId ||
    entity.contains.includes(selectedEntityId) ||
    selectedEntity.contains.includes(entity.eventId) ||
    entity.containedBy === selectedEntity.id ||
    selectedEntity.containedBy === entity.id
  );
}

function getCanonEntityIndexValues(
  canonMeta: StaticViewportCanonMeta
): StaticViewportEntityIndexEntry[] {
  return Object.values(
    canonMeta.entityIndex as Record<string, StaticViewportEntityIndexEntry>
  );
}

export function getSelectedEntityRefs(
  canonMeta: StaticViewportCanonMeta,
  selectedEntityId: string
) {
  return getCanonEntityIndexValues(canonMeta).filter(
    (entity) =>
      entity.eventId === selectedEntityId || entity.id === selectedEntityId
  );
}

export function getNeighborEntityRefs(
  canonMeta: StaticViewportCanonMeta,
  selectedEntityRefs: StaticViewportEntityIndexEntry[],
  selectedEntityId: string
) {
  const matches = new Map<string, StaticViewportEntityIndexEntry>();

  for (const entity of getCanonEntityIndexValues(canonMeta)) {
    for (const selectedEntity of selectedEntityRefs) {
      if (entity.canonId !== selectedEntity.canonId) {
        continue;
      }
      if (
        !matchesRetentionSemantics(entity, selectedEntity, selectedEntityId)
      ) {
        continue;
      }

      matches.set(entity.id, entity);
    }
  }

  return [...matches.values()];
}

export function getRegionRetentionRefs(
  canonMeta: StaticViewportCanonMeta,
  seedRefs: StaticViewportEntityIndexEntry[],
  selectedEntityId?: string
) {
  const regionById = new Map(
    getCanonEntityIndexValues(canonMeta)
      .filter((entity) => entity.geometryKind === "region")
      .map((entity) => [entity.id, entity])
  );
  const requiredIds = new Set(seedRefs.map((entity) => entity.id));
  const requiredEventIds = new Set(seedRefs.map((entity) => entity.eventId));
  const result = new Map<string, StaticViewportEntityIndexEntry>();
  const queue = [...seedRefs];

  if (selectedEntityId) {
    requiredEventIds.add(selectedEntityId);
  }

  while (queue.length > 0) {
    const entity = queue.pop();
    if (!entity) {
      continue;
    }

    if (entity.containedBy) {
      const parent = regionById.get(entity.containedBy);
      if (parent && !result.has(parent.id)) {
        result.set(parent.id, parent);
        requiredIds.add(parent.id);
        requiredEventIds.add(parent.eventId);
        queue.push(parent);
      }
    }

    for (const region of regionById.values()) {
      if (result.has(region.id)) {
        continue;
      }

      if (
        region.contains.some(
          (childId) => requiredIds.has(childId) || requiredEventIds.has(childId)
        ) ||
        (selectedEntityId ? region.contains.includes(selectedEntityId) : false)
      ) {
        result.set(region.id, region);
        requiredIds.add(region.id);
        requiredEventIds.add(region.eventId);
        queue.push(region);
      }
    }
  }

  return [...result.values()];
}
