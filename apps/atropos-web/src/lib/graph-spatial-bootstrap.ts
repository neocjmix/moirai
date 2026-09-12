import type { MoiraiGraphUrlState } from "@moirai/contracts";
import { presentationScopeKey } from "@moirai/graph-presentation";
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
  for (const meta of metas) {
    if (!center && meta?.bounds && meta.entityCount)
      center = {
        x: offset + (meta.bounds.minX + meta.bounds.maxX) / 2,
        y: (meta.bounds.minY + meta.bounds.maxY) / 2
      };
    offset += (meta?.widthHint ?? 1800) + 240;
  }
  const workspace: GraphShellWorkspaceShell = {
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
