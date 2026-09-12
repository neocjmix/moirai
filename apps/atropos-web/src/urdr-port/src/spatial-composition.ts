// Copied from neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760
// urdr/apps/web/src/graph-read-loader.ts (scope composition) and
// shared/domain/src/static-viewport-bake.ts (entity band indices).
// Extraction only: local imports and exported composition function.
import type {
  GraphShellChartPlaneEntity,
  StaticViewportLevelMeta,
  StaticProjectionScopeMeta
} from "../shared/contracts";

function getScopeCompositionMeta(
  scopeKey: string,
  timeLevel: string,
  levelMeta: {
    canons: Record<
      string,
      Pick<
        StaticViewportLevelMeta["canons"][string],
        "widthHint" | "preferredGap"
      >
    >;
  },
  projectionScopeMetaByKey: ReadonlyMap<string, StaticProjectionScopeMeta>
) {
  const projectionLevelMeta =
    projectionScopeMetaByKey.get(scopeKey)?.levels[timeLevel];
  if (projectionLevelMeta) {
    return {
      widthHint: projectionLevelMeta.widthHint,
      preferredGap: projectionLevelMeta.preferredGap
    };
  }

  const compatibilityMeta = levelMeta.canons[scopeKey];
  if (!compatibilityMeta) {
    return null;
  }

  return {
    widthHint: compatibilityMeta.widthHint,
    preferredGap: compatibilityMeta.preferredGap
  };
}

export function composeCanonOffsets(
  canonIds: string[],
  timeLevel: string,
  levelMeta: {
    canons: Record<
      string,
      Pick<
        StaticViewportLevelMeta["canons"][string],
        "widthHint" | "preferredGap"
      >
    >;
  },
  projectionScopeMetaByKey: ReadonlyMap<string, StaticProjectionScopeMeta>
) {
  const offsets = new Map<string, number>();
  let cursor = 0;
  for (const canonId of canonIds) {
    const scopeMeta = getScopeCompositionMeta(
      canonId,
      timeLevel,
      levelMeta,
      projectionScopeMetaByKey
    );
    if (!scopeMeta) {
      continue;
    }
    offsets.set(canonId, cursor);
    cursor += scopeMeta.widthHint + scopeMeta.preferredGap;
  }
  return offsets;
}

export function getStaticEntityBandIndices(
  entity: GraphShellChartPlaneEntity,
  bandSize: number
) {
  if (entity.geometryKind === "point") {
    return [Math.floor(entity.position.y / bandSize)];
  }

  if (entity.geometryKind === "segment") {
    const startBand = Math.floor(
      Math.min(entity.start.y, entity.end.y) / bandSize
    );
    const endBand = Math.floor(
      Math.max(entity.start.y, entity.end.y) / bandSize
    );
    return Array.from(
      { length: endBand - startBand + 1 },
      (_, index) => startBand + index
    );
  }

  const startBand = Math.floor(entity.worldBounds.minY / bandSize);
  const endBand = Math.floor(entity.worldBounds.maxY / bandSize);
  return Array.from(
    { length: endBand - startBand + 1 },
    (_, index) => startBand + index
  );
}
