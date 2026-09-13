import { EventTimeContext } from "../../../../../../../components/event-time-context";
import { readerSearchFromQuery } from "../../../../../../../lib/event-reading-navigation";
import { notFound } from "next/navigation";
import { EventSheet } from "../../../../../../../components/event-sheet";
import { StatusIsland } from "../../../../../../../components/status-island";
import {
  readCanon,
  readRelationalTime,
  readEvent,
  readWorld,
  selectPublication,
  selectPublicationRevision
} from "../../../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams
}: {
  readonly params: Promise<{
    worldId: string;
    canonId: string;
    eventId: string;
  }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { worldId, canonId, eventId } = await params;
  try {
    const query = await searchParams;
    const graphSearch = readerSearchFromQuery(query);
    const selected =
      typeof query.revision === "string"
        ? await selectPublicationRevision(worldId, Number(query.revision))
        : await selectPublication(worldId);
    const [
      { world },
      canonDocument,
      { event, pointer, narratives, relations, relatedEvents }
    ] = await Promise.all([
      readWorld(worldId, selected),
      readCanon(worldId, canonId, selected),
      readEvent(worldId, canonId, eventId, selected)
    ]);
    const { canon } = canonDocument;
    const temporal = await readRelationalTime(
      worldId,
      canonId,
      canonDocument.temporalArtifact,
      selected
    );
    return (
      <main className="event-canvas">
        <StatusIsland
          worldId={worldId}
          worldTitle={world.title}
          canonId={canon.id}
          canonTitle={canon.title}
          revision={pointer.served_revision}
        />
        <nav className="breadcrumb event-breadcrumb">
          <a href={`/worlds/${worldId}`}>{world.title}</a>
          <span>/</span>
          <a href={`/worlds/${worldId}/canons/${canonId}`}>{canon.title}</a>
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
          canonId={canonId}
          graphSearch={graphSearch}
          canonLabels={{ [canonId]: canon.title }}
          attributes={event.attributes}
          narratives={narratives}
          relations={relations}
          relatedEvents={relatedEvents}
          temporalContent={
            <EventTimeContext
              canonTitle={canon.title}
              projection={temporal}
              events={canonDocument.events}
              eventId={eventId}
              graphSearch={graphSearch}
            />
          }
        />
      </main>
    );
  } catch {
    notFound();
  }
}
