// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
import type { GraphShellChartPlane } from "@urdr/contracts";

import type { ChartShape } from "./chart-surface";

export function createChartShapesFromChartPlane(chartPlane: GraphShellChartPlane, enabledCanonIds?: string[]): ChartShape[] {
  const enabledCanonIdSet = enabledCanonIds ? new Set(enabledCanonIds) : null;
  const entities = enabledCanonIdSet
    ? chartPlane.entities.filter((entity) => enabledCanonIdSet.has(entity.canonId))
    : chartPlane.entities;

  return entities.map<ChartShape | null>((entity) => {
    if (entity.geometryKind === "point") {
      return {
        id: entity.id,
        kind: "point",
        name: entity.label,
        position: entity.position,
        fill: entity.validationState === "error" ? "#b85f32" : "#406b5b"
      };
    }

    if (entity.geometryKind === "segment") {
      return {
        id: entity.id,
        kind: "segment",
        name: entity.label,
        start: entity.start,
        end: entity.end,
        stroke: entity.validationState === "error" ? "#b85f32" : "#39536b"
      };
    }

    return null;
  }).filter((shape): shape is ChartShape => Boolean(shape));
}
