import type { GraphReadLoader } from "../urdr-port/src/graph-read-loader";
import { createGraphReadLifetime } from "../urdr-port/src/graph-read-lifetime";
import type { GraphShellWorkspaceShell } from "../urdr-port/shared/contracts";
import { renderTileViewport } from "./v5-render-viewport";
import type { TstlExperimentClient } from "./tstl-experiment-client";
import {
  TSTL_EXPERIMENT_WORLD_ID,
  TSTL_EXPERIMENT_REVISION,
  TSTL_EXPERIMENT_TIME_SYSTEM_ID,
  type TstlExperimentMode
} from "./tstl-experiment-types";

export function createTstlGraphReadLoader(input: {
  client: TstlExperimentClient;
  mode: TstlExperimentMode;
  organicVersion?: number;
  workspace: GraphShellWorkspaceShell;
  worldId: string;
  revision: number;
  timeSystemId: string;
  collectionIds: string[];
  relationTypes: string[];
  detailLoader: GraphReadLoader;
}): GraphReadLoader {
  if (
    input.worldId !== TSTL_EXPERIMENT_WORLD_ID ||
    input.revision !== TSTL_EXPERIMENT_REVISION ||
    input.timeSystemId !== TSTL_EXPERIMENT_TIME_SYSTEM_ID
  )
    throw Error("tstl_experiment_scope_mismatch");
  const lifetime = createGraphReadLifetime();
  const reader = input.client.viewport(input.mode);
  return {
    viewportMode: "snapshot",
    paintSourceKey: `tstl:${input.mode}${input.mode === "organic" ? `:${input.organicVersion}` : ""}`,
    dispose: () => lifetime.dispose(),
    inspectViewport: () => ({
      ...input.client.inspect(),
      renderBytes: reader.inspect().bytes,
      renderSnapshots: reader.inspect().snapshots
    }),
    loadWorkspace: async () => {
      lifetime.assertActive();
      const artifact = await input.client.load();
      lifetime.assertActive();
      return {
        ...input.workspace,
        buildRevision: `v5:${input.worldId}:56:tstl`,
        navigationScopes: input.workspace.navigationScopes?.map((scope) => ({
          ...scope,
          bounds: artifact.bounds,
          ready: true
        }))
      };
    },
    loadViewport: (_locale, query) =>
      lifetime.read(async (signal) => {
        const box = query.bbox;
        const { primitives } = await reader.load(
          box,
          input.collectionIds,
          signal,
          undefined,
          {
            visibleViewport: {
              minX: (box.minX + box.maxX) / 2 - (box.maxX - box.minX) / 8,
              maxX: (box.minX + box.maxX) / 2 + (box.maxX - box.minX) / 8,
              minY: (box.minY + box.maxY) / 2 - (box.maxY - box.minY) / 8,
              maxY: (box.minY + box.maxY) / 2 + (box.maxY - box.minY) / 8
            },
            ...(query.selectedEntityId
              ? { selectedId: query.selectedEntityId }
              : {}),
            scaleX: query.scale,
            scaleY:
              (query.viewportHeight * 4) /
              Math.max(Number.EPSILON, box.maxY - box.minY)
          }
        );
        const value = renderTileViewport({
          worldId: input.worldId,
          revision: input.revision,
          primitives,
          relationTypes: input.relationTypes
        });
        const anchors = new Map(
          primitives.flatMap((primitive) =>
            primitive.composite?.anchor
              ? [[primitive.entity.id, primitive.composite.anchor] as const]
              : []
          )
        );
        if (input.mode !== "B0") {
          const candidate = await input.client.candidate(input.mode);
          value.regions = value.regions.map((region) =>
            region.geometryKind !== "region"
              ? region
              : {
                  ...region,
                  preparedWorldRings:
                    candidate.contoursByCompositeId[region.id]!,
                  preparedContourMode: "fixed" as const,
                  ...(candidate.fillRule
                    ? { preparedContourFillRule: candidate.fillRule }
                    : {}),
                  preparedWorldTraces:
                    candidate.tracesByCompositeId?.[region.id] ?? [],
                  ...(anchors.has(region.id)
                    ? { preparedAnchor: anchors.get(region.id)! }
                    : {}),
                  validationState: "warning" as const,
                  // The persistent Labs control and settings disclose this
                  // scope-wide limitation. Per-region diagnostics are logged
                  // on each viewport update by GraphShell, so do not emit the
                  // same experimental warning hundreds of times while panning.
                  diagnostics: []
                }
          );
        }
        return value;
      }),
    loadEventDetail: (locale, eventId, signal) =>
      lifetime.read(
        (readSignal) =>
          input.detailLoader.loadEventDetail(locale, eventId, readSignal),
        signal
      )
  };
}
