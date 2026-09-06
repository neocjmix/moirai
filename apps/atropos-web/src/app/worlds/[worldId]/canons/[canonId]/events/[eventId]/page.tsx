import { RelationalTime } from "../../../../../../../components/relational-time";
import { notFound } from "next/navigation";
import { EventSheet } from "../../../../../../../components/event-sheet";
import { StatusIsland } from "../../../../../../../components/status-island";
import {
  readCanon,
  readRelationalTime,
  readEvent,
  readWorld,
  selectPublication
} from "../../../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params
}: {
  readonly params: Promise<{
    worldId: string;
    canonId: string;
    eventId: string;
  }>;
}) {
  const { worldId, canonId, eventId } = await params;
  try {
    const selected = await selectPublication(worldId);
    const [
      { world },
      canonDocument,
      {
        event,
        parentProcessIds,
        pointer,
        process,
        narratives,
        temporalPlacements,
        timeSystems,
        relations,
        relatedEvents
      }
    ] = await Promise.all([
      readWorld(worldId, selected),
      readCanon(worldId, canonId, selected),
      readEvent(worldId, canonId, eventId, selected)
    ]);
    const { canon } = canonDocument;
    const temporal = canonDocument.temporalArtifact
      ? await readRelationalTime(
          worldId,
          canonId,
          canonDocument.temporalArtifact,
          selected
        )
      : null;
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
        <div className="lantern-orbit" aria-hidden="true">
          <span />
        </div>
        <EventSheet
          title={event.title}
          summary={event.summary}
          kind={event.kind}
          revision={pointer.served_revision}
          worldId={worldId}
          canonId={canonId}
          eventId={eventId}
          process={process}
          parentProcessIds={parentProcessIds}
          narratives={narratives}
          temporalPlacements={temporalPlacements}
          timeSystems={timeSystems}
          relations={relations}
          relatedEvents={relatedEvents}
          temporalContent={
            temporal ? (
              <RelationalTime
                projection={temporal}
                events={canonDocument.events}
                eventId={eventId}
              />
            ) : null
          }
        />
      </main>
    );
  } catch {
    notFound();
  }
}
