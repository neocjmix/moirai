import { notFound } from "next/navigation";
import { EventSheet } from "../../../../../components/event-sheet";
import { EventTimeContext } from "../../../../../components/event-time-context";
import {
  eventReadingSearch,
  graphReturnHref,
  readerSearchFromQuery
} from "../../../../../lib/event-reading-navigation";
import { StatusIsland } from "../../../../../components/status-island";
import {
  readWorld,
  readWorldEvent,
  readCanon,
  readRelationalTime,
  selectPublication,
  selectPublicationRevision
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function WorldEventPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ worldId: string; eventId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { worldId, eventId } = await params;
  try {
    const query = await searchParams;
    const graphSearch = readerSearchFromQuery(query);
    const returnHref = graphReturnHref(graphSearch);
    const selected =
      typeof query.revision === "string"
        ? await selectPublicationRevision(worldId, Number(query.revision))
        : await selectPublication(worldId);
    const [worldDocument, eventDocument] = await Promise.all([
      readWorld(worldId, selected),
      readWorldEvent(worldId, eventId, selected)
    ]);
    const { world, canons } = worldDocument;
    const { event, pointer, narratives, relations, relatedEvents } =
      eventDocument;
    const membershipCanons = canons.filter((canon) =>
      event.canon_memberships.includes(canon.id)
    );
    if (membershipCanons.length !== event.canon_memberships.length) notFound();
    const temporalContexts = await Promise.all(
      membershipCanons.map(async (canon) => {
        const document = await readCanon(worldId, canon.id, selected);
        const projection = await readRelationalTime(
          worldId,
          canon.id,
          document.temporalArtifact,
          selected
        );
        return { canon, document, projection };
      })
    );
    const readingSearch = eventReadingSearch(
      pointer.served_revision,
      graphSearch
    );
    return (
      <main className="event-canvas">
        {returnHref ? (
          <a data-testid="return-to-graph" href={returnHref}>
            그래프로 돌아가기 / Return to graph
          </a>
        ) : null}
        <StatusIsland
          worldId={worldId}
          worldTitle={world.title}
          revision={pointer.served_revision}
        />
        <nav className="breadcrumb event-breadcrumb">
          <a href={`/worlds/${worldId}`}>{world.title}</a>
          <span>/</span>
          <span>여러 Canon에서 읽는 사건</span>
        </nav>
        <div className="temporal-orbit" aria-hidden="true">
          <span />
        </div>
        <EventSheet
          title={event.title}
          summary={event.summary}
          kind={event.kind}
          revision={pointer.served_revision}
          worldId={worldId}
          eventId={eventId}
          graphSearch={graphSearch}
          canonLabels={Object.fromEntries(
            membershipCanons.map((canon) => [canon.id, canon.title])
          )}
          attributes={event.attributes}
          narratives={narratives}
          relations={relations}
          relatedEvents={relatedEvents}
          temporalContent={temporalContexts.map(
            ({ canon, document, projection }) => (
              <EventTimeContext
                key={canon.id}
                canonTitle={canon.title}
                projection={projection}
                events={document.events}
                eventId={eventId}
                graphSearch={graphSearch}
              />
            )
          )}
          scopeContent={
            <section className="context-block" aria-labelledby="canon-scopes">
              <p className="eyebrow" id="canon-scopes">
                이 사건을 읽는 Canon
              </p>
              {membershipCanons.map((canon) => (
                <a
                  className="relation-row"
                  href={`/worlds/${worldId}/canons/${canon.id}/events/${eventId}${readingSearch}`}
                  key={canon.id}
                >
                  <span>이 Canon에서 읽기</span>
                  <b>{canon.title}</b>
                  <i aria-hidden="true">→</i>
                </a>
              ))}
            </section>
          }
        />
      </main>
    );
  } catch {
    notFound();
  }
}
