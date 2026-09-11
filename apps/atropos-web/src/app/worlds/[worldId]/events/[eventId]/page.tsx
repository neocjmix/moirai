import { notFound } from "next/navigation";
import { EventSheet } from "../../../../../components/event-sheet";
import { StatusIsland } from "../../../../../components/status-island";
import {
  readWorld,
  readWorldEvent,
  selectPublication
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function WorldEventPage({
  params
}: {
  readonly params: Promise<{ worldId: string; eventId: string }>;
}) {
  const { worldId, eventId } = await params;
  try {
    const selected = await selectPublication(worldId);
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
    return (
      <main className="event-canvas">
        <StatusIsland
          worldId={worldId}
          worldTitle={world.title}
          revision={pointer.served_revision}
        />
        <nav className="breadcrumb event-breadcrumb">
          <a href={`/worlds/${worldId}`}>{world.title}</a>
          <span>/</span>
          <span>Shared Event</span>
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
          narratives={narratives}
          relations={relations}
          relatedEvents={relatedEvents}
          scopeContent={
            <section className="context-block" aria-labelledby="canon-scopes">
              <p className="eyebrow" id="canon-scopes">
                INTERPRETIVE KNOWLEDGE SCOPES
              </p>
              {membershipCanons.map((canon) => (
                <a
                  className="relation-row"
                  href={`/worlds/${worldId}/canons/${canon.id}/events/${eventId}`}
                  key={canon.id}
                >
                  <span>Canon context</span>
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
