import { presentationNodeId } from "@moirai/graph-presentation";
import { notFound } from "next/navigation";
import { AtroposGraphRoot } from "../../../../../components/atropos-graph-root";
import { GraphQueryFallback } from "../../../../../components/graph-query-fallback";
import {
  graphEventHref,
  graphReaderState
} from "../../../../../lib/event-reading-navigation";
import { composeCachedGraphPublicationQuery as composeGraphPublicationQuery } from "../../../../../lib/graph-publication-composer";
import {
  graphRevisionPins,
  loadGraphPublicationSources
} from "../../../../../lib/graph-publication-loader";
import { graphPresentationFromResult } from "../../../../../lib/graph-query-presentation";
import { graphSpatialBootstrap } from "../../../../../lib/graph-spatial-bootstrap";
import { graphSpatialDetail } from "../../../../../lib/graph-spatial-detail";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../../../../lib/moirai-graph-source-query";
import {
  readWorldEvent,
  selectPublication,
  selectPublicationRevision
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function GraphEventPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ worldId: string; eventId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ worldId, eventId }, query] = await Promise.all([
    params,
    searchParams
  ]);
  try {
    const requestedRevision =
      typeof query.revision === "string" ? Number(query.revision) : null;
    if (
      requestedRevision !== null &&
      (!Number.isSafeInteger(requestedRevision) || requestedRevision < 1)
    )
      notFound();
    const selected =
      requestedRevision === null
        ? await selectPublication(worldId)
        : await selectPublicationRevision(worldId, requestedRevision);
    const eventDocument = await readWorldEvent(worldId, eventId, selected);
    const { event, pointer } = eventDocument;
    const requestedCanonId =
      typeof query.canon === "string" ? query.canon : null;
    if (requestedCanonId && !event.canon_memberships.includes(requestedCanonId))
      notFound();

    const raw = typeof query.mq === "string" ? query.mq : null;
    const rawPins = graphRevisionPins(raw);
    if (raw && rawPins.length === 0) throw Error("invalid_graph_context");
    const pinnedTarget = rawPins.find((pin) => pin.world_id === worldId);
    if (
      pinnedTarget &&
      pinnedTarget.served_revision !== pointer.served_revision
    )
      throw Error("conflicting_graph_revision");
    const targetPin = {
      world_id: worldId,
      served_revision: pointer.served_revision,
      canon_ids: [...event.canon_memberships]
    };
    const { catalog, snapshots, failures } = await loadGraphPublicationSources(
      raw ? rawPins : [targetPin]
    );
    const defaultState = createDefaultGraphUrlState(catalog);
    const parsedState = raw
      ? parseGraphUrlState(`?mq=${encodeURIComponent(raw)}`, catalog)
      : null;
    if (raw && !parsedState) throw Error("invalid_graph_context");
    const baseState = parsedState ?? defaultState;
    const source = baseState.query.sources.find(
      (candidate) =>
        candidate.world_id === worldId &&
        candidate.served_revision === pointer.served_revision
    );
    if (!source) throw Error("event_source_outside_graph_context");
    const focusCanonId =
      requestedCanonId ??
      event.canon_memberships.find((canonId) =>
        source.canon_ids.includes(canonId)
      );
    if (!focusCanonId || !source.canon_ids.includes(focusCanonId))
      throw Error("event_canon_outside_graph_context");
    const focus = {
      kind: "event" as const,
      world_id: worldId,
      served_revision: pointer.served_revision,
      canon_id: focusCanonId,
      event_ref: { kind: "event" as const, event_id: eventId }
    };
    const initialGraphQuery = { ...baseState, focus };
    const result = composeGraphPublicationQuery(
      initialGraphQuery.query,
      snapshots,
      failures
    );
    const presentation = graphPresentationFromResult(result);
    const spatial = await graphSpatialBootstrap(initialGraphQuery, catalog);
    const detailCanons = requestedCanonId
      ? [requestedCanonId]
      : event.canon_memberships.filter((canonId) =>
          source.canon_ids.includes(canonId)
        );
    const selectedDetails = await Promise.all(
      detailCanons.map((canonId) => {
        const canonFocus = { ...focus, canon_id: canonId };
        return graphSpatialDetail(
          initialGraphQuery,
          presentationNodeId(canonFocus, canonFocus.event_ref)
        );
      })
    );
    const selectedDetail = selectedDetails[0]!;
    const graphSearch = new URLSearchParams();
    if (raw) graphSearch.set("mq", raw);
    const initialEventDetail = requestedCanonId
      ? selectedDetail
      : {
          ...selectedDetail,
          notes: selectedDetails
            .flatMap((detail) => [
              `## ${detail.readingContext?.scopeLabel ?? detail.canonId}`,
              detail.notes
            ])
            .filter(Boolean)
            .join("\n\n"),
          chronologySummary: selectedDetails
            .map(
              (detail) =>
                `${detail.readingContext?.scopeLabel ?? detail.canonId}: ${detail.chronologySummary}`
            )
            .join("\n"),
          causeEvents: uniqueEventLinks(
            selectedDetails.flatMap((detail) => detail.causeEvents)
          ),
          resultEvents: uniqueEventLinks(
            selectedDetails.flatMap((detail) => detail.resultEvents)
          ),
          readingContext: {
            scopeLabel: `${selectedDetails.length} Canon contexts`,
            stableEventHref: graphEventHref({
              worldId,
              eventId,
              revision: pointer.served_revision,
              graphSearch: graphSearch.toString()
            }),
            observation: selectedDetails
              .map(
                (detail) =>
                  `## ${detail.readingContext?.scopeLabel ?? detail.canonId}\n${detail.readingContext?.observation ?? ""}`
              )
              .join("\n\n")
          }
        };

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
          initialEventDetail={initialEventDetail}
          initialDrawerStage="full"
          initialGraphQuery={initialGraphQuery}
          initialReader={graphReaderState(query)}
          initialScreen="graph"
          relations={presentation.relations}
          completeness={result.completeness}
        />
      </>
    );
  } catch {
    notFound();
  }
}

function uniqueEventLinks(
  links: readonly { readonly id: string; readonly label: string }[]
) {
  return [...new Map(links.map((link) => [link.id, link])).values()];
}
