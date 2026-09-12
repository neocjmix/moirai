import { graphSpatialBootstrap } from "../../lib/graph-spatial-bootstrap";
import { AtroposGraphRoot } from "../../components/atropos-graph-root";
import { GraphQueryFallback } from "../../components/graph-query-fallback";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../lib/moirai-graph-source-query";
import {
  loadGraphPublicationSources,
  graphRevisionPins
} from "../../lib/graph-publication-loader";
import { composeGraphPublicationQuery } from "../../lib/graph-publication-composer";
import { graphPresentationFromResult } from "../../lib/graph-query-presentation";

export default async function GraphPage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const raw = typeof params.mq === "string" ? params.mq : null;
  const pins = graphRevisionPins(raw);
  const { catalog, snapshots, failures } =
    await loadGraphPublicationSources(pins);
  if (catalog.frames.length === 0 || catalog.worlds.length === 0)
    throw new Error("No public graph publication source is available");
  if (
    pins.some(
      (p) =>
        !catalog.worlds.some(
          (w) => w.id === p.world_id && w.servedRevision === p.served_revision
        )
    )
  )
    throw Error("Selected graph revision is unavailable");
  const initialGraphQuery = raw
    ? (parseGraphUrlState(`?mq=${encodeURIComponent(raw)}`, catalog) ??
      createDefaultGraphUrlState(catalog))
    : createDefaultGraphUrlState(catalog);
  const result = composeGraphPublicationQuery(
    initialGraphQuery.query,
    snapshots,
    failures
  );
  const presentation = graphPresentationFromResult(result);
  const spatial = await graphSpatialBootstrap(initialGraphQuery, catalog);

  return (
    <>
      <GraphQueryFallback
        result={result}
        entities={presentation.entities}
        state={initialGraphQuery}
      />
      <AtroposGraphRoot
        spatial={spatial}
        catalog={catalog}
        diagnostics={presentation.diagnostics}
        entities={presentation.entities}
        initialGraphQuery={initialGraphQuery}
        initialScreen="graph"
        relations={presentation.relations}
        result={result}
      />
    </>
  );
}
