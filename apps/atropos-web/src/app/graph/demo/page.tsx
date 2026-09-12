import { notFound } from "next/navigation";
import { AtroposGraphRoot } from "../../../components/atropos-graph-root";
import { loadGraphPublicationSources } from "../../../lib/graph-publication-loader";
import { createDefaultGraphUrlState } from "../../../lib/moirai-graph-source-query";
import { composeGraphPublicationQuery } from "../../../lib/graph-publication-composer";
import { graphPresentationFromResult } from "../../../lib/graph-query-presentation";
export default async function DemoGraphPage() {
  if (!process.env.LOCAL_PUBLICATION_FIXTURE_DIR) notFound();
  const { catalog, snapshots, failures } = await loadGraphPublicationSources();
  const initialGraphQuery = createDefaultGraphUrlState(catalog);
  const result = composeGraphPublicationQuery(
    initialGraphQuery.query,
    snapshots,
    failures
  );
  const presentation = graphPresentationFromResult(result);
  return (
    <AtroposGraphRoot
      demo
      spatial={{
        workspace: { menuItems: [], tabs: [], canons: [], defaultTabId: "" },
        center: null
      }}
      initialScreen="graph"
      initialGraphQuery={initialGraphQuery}
      catalog={catalog}
      result={result}
      {...presentation}
    />
  );
}
