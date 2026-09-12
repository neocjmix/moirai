import { graphSpatialBootstrap } from "../../../lib/graph-spatial-bootstrap";
import { notFound } from "next/navigation";

import { AtroposGraphRoot } from "../../../components/atropos-graph-root";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../../lib/moirai-graph-source-query";
import {
  loadGraphPublicationSources,
  graphRevisionPins
} from "../../../lib/graph-publication-loader";
import { composeGraphPublicationQuery } from "../../../lib/graph-publication-composer";
import { graphPresentationFromResult } from "../../../lib/graph-query-presentation";
import {
  getAtroposScreen,
  type AtroposScreenId
} from "../../../lib/atropos-screen-registry";

const RELOADABLE_SCREENS = new Set<AtroposScreenId>([
  "private",
  "explore",
  "settings"
]);

export default async function GraphScreenPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ screen: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { screen } = await params;
  const queryParams = await searchParams;
  const raw = typeof queryParams.mq === "string" ? queryParams.mq : null;
  const pins = graphRevisionPins(raw);
  const { catalog, snapshots, failures } =
    await loadGraphPublicationSources(pins);
  if (catalog.frames.length === 0 || catalog.worlds.length === 0) notFound();
  if (!RELOADABLE_SCREENS.has(screen as AtroposScreenId)) notFound();

  const definition = getAtroposScreen(screen as AtroposScreenId);
  if (definition.availability === "auth_gated_future") notFound();

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
    <AtroposGraphRoot
      spatial={spatial}
      catalog={catalog}
      diagnostics={presentation.diagnostics}
      entities={presentation.entities}
      initialGraphQuery={initialGraphQuery}
      initialScreen={definition.id}
      relations={presentation.relations}
      result={result}
    />
  );
}
