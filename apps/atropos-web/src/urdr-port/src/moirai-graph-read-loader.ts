import { presentationScopeKey } from "@moirai/graph-presentation";
import type { MoiraiGraphSource, MoiraiGraphUrlState } from "@moirai/contracts";
import {
  graphShellViewportResponseSchema,
  type GraphShellWorkspaceShell
} from "../shared/contracts";
import type { GraphReadLoader } from "./graph-read-loader";
/** Browser seam: geometry comes only from the bounded revision-pinned reader. */
export function createMoiraiGraphReadLoader(input: {
  sources: readonly MoiraiGraphSource[];
  state?: MoiraiGraphUrlState;
  workspace: GraphShellWorkspaceShell;
  loadEventDetail: GraphReadLoader["loadEventDetail"];
  maxEntities?: number;
  fetcher?: typeof fetch;
}): GraphReadLoader {
  const fetcher = input.fetcher ?? fetch;
  return {
    loadWorkspace: async () => input.workspace,
    loadEventDetail: input.loadEventDetail,
    async loadViewport(_locale, viewport) {
      const response = await fetcher("/graph/spatial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sources: input.sources,
          state: input.state,
          viewport: { ...viewport, currentTimeLevel: "full" },
          maxEntities: input.maxEntities ?? 1000
        })
      });
      if (!response.ok) throw Error("moirai_spatial_read_failed");
      const body = await response.json();
      const expected = input.sources.filter((s) =>
        s.canon_ids.some((c) =>
          viewport.canonIds.includes(
            presentationScopeKey({
              world_id: s.world_id,
              served_revision: s.served_revision,
              canon_id: c
            })
          )
        )
      );
      if (
        JSON.stringify(body.revision_vector) !==
        JSON.stringify(
          expected.map((s) => ({
            world_id: s.world_id,
            served_revision: s.served_revision
          }))
        )
      )
        throw Error("moirai_spatial_revision_mismatch");
      return graphShellViewportResponseSchema.parse(body.viewport);
    }
  };
}
