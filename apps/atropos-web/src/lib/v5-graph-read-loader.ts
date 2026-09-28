import type { GraphReadLoader } from "../urdr-port/src/graph-read-loader";
import { createViewportCache } from "../urdr-port/src/viewport-cache";
import { viewportCompleteness } from "../urdr-port/src/viewport-completeness";
import { v5ViewportCursorSchema } from "./v5-viewport-cursor";
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
    if (signal?.aborted)
      throw new DOMException("Superseded viewport", "AbortError");
    if (!response.ok) throw Error("v5_shell_unavailable");
    return response.json();
  };
  const cached = createViewportCache(
    async (viewport, signal) => {
      let cursor = null;
      let accumulated: ReturnType<
        typeof graphShellViewportResponseSchema.parse
      > | null = null;
      const seen = new Set<string>();
      for (;;) {
        const body = await call(
          {
            kind: "viewport",
            time_system_id: input.timeSystemId,
            collection_ids: input.collectionIds,
            relation_types: input.relationTypes,
            viewport,
            cursor
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
        const next =
          body.next_cursor == null
            ? null
            : v5ViewportCursorSchema.parse(body.next_cursor);
        if (accumulated) {
          const union = <T extends { id: string }>(a: T[], b: T[]) => [
            ...new Map([...a, ...b].map((item) => [item.id, item])).values()
          ];
          value.entities = union(accumulated.entities, value.entities);
          value.regions = union(accumulated.regions, value.regions);
          value.edges = union(accumulated.edges, value.edges);
          // Relations crossing server batches are not guaranteed by this read.
          value.completeness = viewportCompleteness(
            [...value.entities, ...value.regions],
            next !== null,
            true
          );
          value.truncated = Object.values(value.completeness).some(
            (complete) => !complete
          );
        }
        accumulated = value;
        if (!next) return value;
        const token = JSON.stringify(next);
        if (seen.has(token)) throw Error("v5_shell_cursor_stalled");
        seen.add(token);
        cursor = next;
      }
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
    inspectViewport: () => cached.inspect(),
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
