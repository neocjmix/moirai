import type { MoiraiGraphUrlState } from "@moirai/contracts";
import { projectPresentationInput } from "@moirai/graph-presentation";
import { composeGraphPublicationQuery } from "@moirai/graph-query";
import {
  loadGraphPublicationSources,
  graphRevisionPins
} from "./graph-publication-loader";
import { normalizeGraphUrlState } from "./moirai-graph-source-query";
import { BoundedPublicationCache } from "./bounded-publication-cache";
const cache = new BoundedPublicationCache<
  Awaited<ReturnType<typeof buildContext>>
>(4, 128 * 1024 * 1024);
export const graphSpatialContextCacheMetrics = () => cache.metrics();
async function buildContext(value: unknown) {
  const raw = JSON.stringify(value);
  if (raw.length > 64 * 1024) throw Error("invalid_graph_query");
  const pins = graphRevisionPins(raw);
  if (!pins.length) throw Error("invalid_graph_query");
  const { catalog, snapshots, failures } = await loadGraphPublicationSources(
    pins,
    { onlyPinned: true }
  );
  const state = normalizeGraphUrlState(value, catalog);
  if (!state) throw Error("graph_selected_revision_unavailable");
  // Browser budgets do not silently restrict exploration to the first N Events.
  const full = composeGraphPublicationQuery(
    {
      ...state.query,
      budget: {
        ...state.query.budget,
        max_entities: Number.MAX_SAFE_INTEGER,
        max_relations: Number.MAX_SAFE_INTEGER,
        max_evidence: Number.MAX_SAFE_INTEGER
      }
    },
    snapshots,
    failures
  );
  const input = projectPresentationInput(full);
  const ids = new Set(
    input.scopes.flatMap((s) => [
      ...s.nodes.map((n) => n.id),
      ...s.links.map((l) => l.id)
    ])
  );
  return { state, full, input, ids };
}
export async function graphSpatialQueryContext(value: unknown) {
  // Focus affects the sheet; the explicit query scope alone filters geometry.
  const raw = value as MoiraiGraphUrlState;
  const key = JSON.stringify({
    version: raw?.version,
    query: raw?.query,
    focus: null
  });
  return cache.read(key, () => buildContext(JSON.parse(key)));
}
