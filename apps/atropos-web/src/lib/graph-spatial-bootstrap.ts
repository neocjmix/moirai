import type { MoiraiGraphUrlState } from "@moirai/contracts";
import {
  presentationScopeKey,
  presentationNodeId
} from "@moirai/graph-presentation";
import type { GraphShellWorkspaceShell } from "../urdr-port/shared/contracts";
import type { GraphSourceCatalog } from "./moirai-graph-source-query";
import { moiraiSpatialReader } from "./moirai-spatial";
export type GraphSpatialBootstrap = {
  workspace: GraphShellWorkspaceShell;
  center: { x: number; y: number } | null;
};
export async function graphSpatialBootstrap(
  state: MoiraiGraphUrlState,
  catalog: GraphSourceCatalog
): Promise<GraphSpatialBootstrap> {
  const sources = state.query.sources.flatMap((s) =>
    s.canon_ids.map((canon_id) => ({
      world_id: s.world_id,
      served_revision: s.served_revision,
      canon_id
    }))
  );
  const ids = sources.map(presentationScopeKey);
  const frame = catalog.frames.find(
    (f) =>
      f.target.time_system_id ===
      state.query.temporal_frame.target.time_system_id
  );
  const label = frame?.label.en ?? "Temporal frame";
  const tabId = `presentation:${frame?.id ?? "selected"}`;
  const metas = await Promise.all(
    sources.map((s) => moiraiSpatialReader.scope(s).catch(() => null))
  );
  let offset = 0;
  let center: GraphSpatialBootstrap["center"] = null;
  let focusedCenter: GraphSpatialBootstrap["center"] = null;
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const focus = state.focus;
    if (
      meta?.entityCount &&
      focus?.kind === "event" &&
      presentationScopeKey(focus) === meta.scopeId
    ) {
      const id = presentationNodeId(focus, focus.event_ref);
      const selected = await moiraiSpatialReader
        .viewport({
          sources: [
            {
              world_id: focus.world_id,
              served_revision: focus.served_revision,
              canon_ids: [focus.canon_id],
              time_systems: []
            }
          ],
          viewport: {
            canonIds: [meta.scopeId],
            bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
            scale: 1,
            viewportWidth: 390,
            viewportHeight: 844,
            selectedEntityId: id,
            includeNeighbors: false
          },
          maxEntities: 1
        })
        .catch(() => null);
      const entity = selected
        ? [...selected.viewport.entities, ...selected.viewport.regions].find(
            (e) => e.id === id
          )
        : null;
      if (entity?.geometryKind === "point")
        focusedCenter = { x: offset + entity.position.x, y: entity.position.y };
      if (entity?.geometryKind === "region")
        focusedCenter = {
          x: offset + (entity.worldBounds.minX + entity.worldBounds.maxX) / 2,
          y: (entity.worldBounds.minY + entity.worldBounds.maxY) / 2
        };
    }
    if (!center && meta?.entityCount) {
      const point = await moiraiSpatialReader
        .initialPoint(sources[i]!)
        .catch(() => null);
      if (point) center = { x: offset + point.x, y: point.y };
    }
    offset += (meta?.widthHint ?? 1800) + 240;
  }
  center = focusedCenter ?? center;
  const workspace: GraphShellWorkspaceShell = {
    // The Moirai producer uses elapsed mean Gregorian years from year zero.
    // Structural/custom frames must never receive Gregorian calendar labels.
    ...(state.query.temporal_frame.target.adapter_identity ===
      "yyyy-iso-fields-fraction12-z-v1" &&
    state.query.temporal_frame.target.comparison_domain ===
      "yyyy-iso-fields-fraction12-z-v1"
      ? {
          chronologyBoard: {
            mode: "gregorian" as const,
            axis: {
              scheme: "gregorian_utc" as const,
              coordinateScale: "elapsed-gregorian" as const,
              timeSystemId: state.query.temporal_frame.target.time_system_id,
              compatibilityKey:
                state.query.temporal_frame.target.comparison_domain,
              startYear: 0,
              endYear: 0,
              tickYears: []
            },
            columns: [],
            placements: [],
            unplaced: []
          }
        }
      : {}),
    menuItems: [
      { id: "publication", label: "Moirai Publication", active: true }
    ],
    tabs: [
      {
        id: tabId,
        label,
        description: "Selected Publication revisions",
        availableCanonIds: ids,
        defaultEnabledCanonIds: ids,
        timeSystemId: state.query.temporal_frame.target.time_system_id,
        compatibilityKey: frame?.id ?? "presentation"
      }
    ],
    canons: sources.map((s) => {
      const w = catalog.worlds.find((w) => w.id === s.world_id);
      return {
        id: presentationScopeKey(s),
        label:
          w?.canons.find((c) => c.id === s.canon_id)?.label.en ?? s.canon_id,
        worldId: s.world_id,
        worldLabel: w?.label.en ?? s.world_id,
        timeSystemId: state.query.temporal_frame.target.time_system_id,
        timeSystemLabel: label,
        compatibilityKey: frame?.id ?? "presentation"
      };
    }),
    defaultTabId: tabId,
    buildRevision: JSON.stringify(sources)
  };
  return { workspace, center };
}
