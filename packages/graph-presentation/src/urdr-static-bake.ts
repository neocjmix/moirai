// Source: neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760
// shared/domain/src/static-viewport-bake.ts. Band assignment and object-doc bake
// copied unchanged; minimal local types replace the legacy contract dependency.
import type {
  GraphShellChartPlane,
  GraphShellChartPlaneEntity
} from "./urdr-layout-types.js";

type ArtifactClass = "point" | "segment" | "region";
export interface StaticProjectionObjectDoc {
  revisionId: string;
  scopeKey: string;
  timeLevel: string;
  yBand: string;
  artifactClass: ArtifactClass;
  artifacts: {
    revisionId: string;
    scopeKey: string;
    timeLevel: string;
    yBand: string;
    artifactClass: ArtifactClass;
    artifactType: string;
    artifactId: string;
    y: number;
    localX?: number;
    sourceEventIds: string[];
    payload: Record<string, unknown>;
  }[];
}
export interface StaticViewportLevelMeta {
  classes: ArtifactClass[];
  canons: Record<
    string,
    {
      coverageByClass: Partial<
        Record<ArtifactClass, { minBandIndex: number; maxBandIndex: number }>
      >;
    }
  >;
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

export function createStaticProjectionObjectDocs(params: {
  chartPlane: GraphShellChartPlane;
  revisionId: string;
  scopeKey: string;
  timeLevel: string;
  bandSize: number;
  levelMeta?: StaticViewportLevelMeta;
}) {
  const docs = new Map<string, StaticProjectionObjectDoc>();
  const scopeEntities = params.chartPlane.entities.filter(
    (candidate) => candidate.canonId === params.scopeKey
  );
  const minLocalX = scopeEntities.reduce<number>((current, entity) => {
    if (entity.geometryKind === "point") {
      return Math.min(current, entity.position.x);
    }
    if (entity.geometryKind === "segment") {
      return Math.min(current, entity.start.x, entity.end.x);
    }
    return Math.min(current, entity.worldBounds.minX);
  }, Number.POSITIVE_INFINITY);
  const xOffset = Number.isFinite(minLocalX) ? minLocalX : 0;

  const addArtifactToDoc = (
    entity: GraphShellChartPlaneEntity,
    bandIndex: number
  ) => {
    const yBand =
      bandIndex < 0
        ? `n${String(Math.abs(bandIndex)).padStart(6, "0")}`
        : String(bandIndex).padStart(6, "0");
    const key = `${entity.geometryKind}:${yBand}`;
    const normalizedPayload =
      entity.geometryKind === "point"
        ? {
            ...entity,
            position: { ...entity.position, x: entity.position.x - xOffset }
          }
        : entity.geometryKind === "segment"
          ? {
              ...entity,
              start: { ...entity.start, x: entity.start.x - xOffset },
              end: { ...entity.end, x: entity.end.x - xOffset }
            }
          : {
              ...entity,
              worldBounds: {
                ...entity.worldBounds,
                minX: entity.worldBounds.minX - xOffset,
                maxX: entity.worldBounds.maxX - xOffset
              }
            };
    const artifact = {
      revisionId: params.revisionId,
      scopeKey: params.scopeKey,
      timeLevel: params.timeLevel,
      yBand,
      artifactClass: entity.geometryKind,
      artifactType:
        entity.geometryKind === "point"
          ? "event-point"
          : entity.geometryKind === "segment"
            ? "event-edge"
            : "event-region",
      artifactId: entity.id,
      y:
        entity.geometryKind === "point"
          ? entity.position.y
          : entity.geometryKind === "segment"
            ? Math.min(entity.start.y, entity.end.y)
            : entity.worldBounds.minY,
      ...(entity.geometryKind === "point"
        ? { localX: entity.position.x - xOffset }
        : entity.geometryKind === "segment"
          ? { localX: Math.min(entity.start.x, entity.end.x) - xOffset }
          : { localX: entity.worldBounds.minX - xOffset }),
      sourceEventIds: [entity.eventId],
      payload: normalizedPayload as unknown as Record<string, unknown>
    };

    const existing = docs.get(key);
    if (existing) {
      existing.artifacts.push(artifact);
      return;
    }

    docs.set(key, {
      revisionId: params.revisionId,
      scopeKey: params.scopeKey,
      timeLevel: params.timeLevel,
      yBand,
      artifactClass: entity.geometryKind,
      artifacts: [artifact]
    });
  };

  for (const entity of scopeEntities) {
    for (const bandIndex of getStaticEntityBandIndices(
      entity,
      params.bandSize
    )) {
      addArtifactToDoc(entity, bandIndex);
    }
  }

  if (params.levelMeta) {
    const scopeCoverage =
      params.levelMeta.canons[params.scopeKey]?.coverageByClass;
    for (const artifactClass of params.levelMeta.classes) {
      const coverage = scopeCoverage?.[artifactClass];
      if (!coverage) {
        continue;
      }
      for (
        let bandIndex = coverage.minBandIndex;
        bandIndex <= coverage.maxBandIndex;
        bandIndex += 1
      ) {
        const yBand =
          bandIndex < 0
            ? `n${String(Math.abs(bandIndex)).padStart(6, "0")}`
            : String(bandIndex).padStart(6, "0");
        const key = `${artifactClass}:${yBand}`;
        if (!docs.has(key)) {
          docs.set(key, {
            revisionId: params.revisionId,
            scopeKey: params.scopeKey,
            timeLevel: params.timeLevel,
            yBand,
            artifactClass,
            artifacts: []
          });
        }
      }
    }
  }

  return docs;
}
