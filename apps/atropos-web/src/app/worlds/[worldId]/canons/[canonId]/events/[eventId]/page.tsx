import { notFound } from "next/navigation";
import { EventSheet } from "../../../../../../../components/event-sheet";
import { StatusIsland } from "../../../../../../../components/status-island";
import {
  readCanon,
  readEvent,
  readWorld
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
    const [{ world }, { canon }, { event, pointer }] = await Promise.all([
      readWorld(worldId),
      readCanon(worldId, canonId),
      readEvent(worldId, canonId, eventId)
    ]);
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
        />
      </main>
    );
  } catch {
    notFound();
  }
}
