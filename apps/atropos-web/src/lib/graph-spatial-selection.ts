import type { MoiraiGraphUrlState } from "@moirai/contracts";
import { presentationScopeKey } from "@moirai/graph-presentation";
import type { GraphSpatialBootstrap } from "./graph-spatial-bootstrap";

export function selectGraphSpatialBootstrap(
  spatial: GraphSpatialBootstrap,
  state: MoiraiGraphUrlState
): GraphSpatialBootstrap {
  const sources = state.query.sources.flatMap((source) =>
    source.canon_ids.map((canon_id) => ({
      world_id: source.world_id,
      served_revision: source.served_revision,
      canon_id
    }))
  );
  const ids = new Set(sources.map(presentationScopeKey));
  const navigationScopes = spatial.workspace.navigationScopes?.filter((scope) =>
    ids.has(scope.canonId)
  );
  const tabs = spatial.workspace.tabs
    .map((tab) => ({
      ...tab,
      availableCanonIds: tab.availableCanonIds.filter((id) => ids.has(id)),
      defaultEnabledCanonIds: tab.defaultEnabledCanonIds.filter((id) =>
        ids.has(id)
      )
    }))
    .filter((tab) => tab.availableCanonIds.length > 0);
  const buildRevision = JSON.stringify(sources);
  const changed = spatial.workspace.buildRevision !== buildRevision;
  const firstBounds = navigationScopes?.find((scope) => scope.bounds)?.bounds;
  return {
    workspace: {
      ...spatial.workspace,
      navigationScopes,
      tabs,
      canons: spatial.workspace.canons.filter((canon) => ids.has(canon.id)),
      defaultTabId: tabs.some(
        (tab) => tab.id === spatial.workspace.defaultTabId
      )
        ? spatial.workspace.defaultTabId
        : (tabs[0]?.id ?? spatial.workspace.defaultTabId),
      buildRevision
    },
    center:
      changed && firstBounds
        ? {
            x: (firstBounds.minX + firstBounds.maxX) / 2,
            y: (firstBounds.minY + firstBounds.maxY) / 2
          }
        : changed
          ? null
          : spatial.center
  };
}
