import type { GraphReadLoader } from "../urdr-port/src/graph-read-loader";
import { createViewportCache } from "../urdr-port/src/viewport-cache";
import {
  graphShellViewportResponseSchema,
  type GraphShellWorkspaceShell
} from "../urdr-port/shared/contracts";

/** Each instance owns one World/revision/time-system/selection scope. */
export function createV5GraphReadLoader(input: {
  worldId: string;
  revision: number;
  timeSystemId: string;
  workspace: GraphShellWorkspaceShell;
  collectionIds: string[];
  relationTypes: string[];
  readPage?: number | undefined;
  fetcher?: typeof fetch;
}): GraphReadLoader {
  const fetcher = input.fetcher ?? fetch;
  const call = async (query: Record<string, unknown>, signal?: AbortSignal) => {
    const response = await fetcher("/graph/v5/shell", {
      method: "POST",
      signal: signal ?? null,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        world_id: input.worldId,
        revision: input.revision,
        ...query
      })
    });
    if (!response.ok) throw Error("v5_shell_unavailable");
    return response.json();
  };
  const cached = createViewportCache(
    async (viewport, signal) => {
      const body = await call(
        {
          kind: "viewport",
          time_system_id: input.timeSystemId,
          collection_ids: input.collectionIds,
          relation_types: input.relationTypes,
          viewport
        },
        signal
      );
      if (signal.aborted)
        throw new DOMException("Superseded viewport", "AbortError");
      const value = graphShellViewportResponseSchema.parse(body);
      if (
        value.revision !== input.revision ||
        value.canonicalRevision !== input.revision
      )
        throw Error("v5_shell_revision_mismatch");
      return value;
    },
    {
      // Incomplete snapshots are reusable only for the exact same request.
      // Coverage reuse requires a complete response. Never slide the expiry:
      // after 30 seconds the next read checks the server's current pointer.
      cachePartial: true,
      maxAgeMs: 30_000,
      maxPending: 1
    }
  );
  return {
    viewportMode: "snapshot",
    dispose: () => cached.dispose(),
    loadWorkspace: async () => input.workspace,
    loadViewport: (_locale, viewport) => cached(viewport),
    loadEventDetail: async (_locale, event_id) =>
      event_id.startsWith("collection:")
        ? call({
            kind: "collection",
            collection_id: event_id.slice(11),
            page: input.readPage ?? 0
          })
        : call({ kind: "detail", event_id, page: input.readPage ?? 0 })
  };
}
