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
        buildRevision: `tstl:${input.worldId}:56`,
        navigationScopes: input.workspace.navigationScopes?.map((scope) => ({
          ...scope,
          bounds: artifact.bounds,
          ready: true
        }))
      };
    },
    loadViewport: (_locale, query) =>
      lifetime.read(async (signal) => {
        const artifact = await input.client.load();
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
        if (input.mode === "A")
          value.regions = value.regions.map((region) =>
            region.geometryKind !== "region"
              ? region
              : {
                  ...region,
                  preparedWorldRings:
                    artifact.a.contoursByCompositeId[region.id]!,
                  preparedContourMode: "fixed" as const,
                  ...(anchors.has(region.id)
                    ? { preparedAnchor: anchors.get(region.id)! }
                    : {}),
                  validationState: "warning" as const,
                  diagnostics: [
                    {
                      code: "tstl_experimental_area",
                      severity: "warning" as const,
                      message: artifact.a.noAreaCompositeIds.includes(region.id)
                        ? "후보 A에서 면을 구성하지 못한 사건: 점으로 표시"
                        : "후보 A의 검증 미완료 실험 면"
                    }
                  ]
                }
          );
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
