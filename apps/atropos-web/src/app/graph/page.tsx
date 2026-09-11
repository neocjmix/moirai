import { AtroposGraphRoot } from "../../components/atropos-graph-root";
import { GraphQueryFallback } from "../../components/graph-query-fallback";
import { composeGraphPublicationQuery } from "../../lib/graph-publication-composer";
import { loadGraphPublicationSources } from "../../lib/graph-publication-loader";
import { graphPresentationFromResult } from "../../lib/graph-query-presentation";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../lib/moirai-graph-source-query";

export default async function GraphPage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const { catalog, snapshots, failures } = await loadGraphPublicationSources();
  if (catalog.frames.length === 0 || catalog.worlds.length === 0)
    throw new Error("No public graph publication source is available");
  const raw = typeof params.mq === "string" ? params.mq : null;
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

  return (
    <>
      <GraphQueryFallback result={result} state={initialGraphQuery} />
      <AtroposGraphRoot
        catalog={catalog}
        diagnostics={presentation.diagnostics}
        entities={presentation.entities}
        initialGraphQuery={initialGraphQuery}
        initialGraphResult={result}
        initialScreen="graph"
        relations={presentation.relations}
      />
    </>
  );
}
