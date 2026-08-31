import { notFound } from "next/navigation";
import { StatusIsland } from "../../../../../components/status-island";
import { readCanon, readWorld } from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function CanonPage({
  params
}: {
  readonly params: Promise<{ worldId: string; canonId: string }>;
}) {
  const { worldId, canonId } = await params;
  try {
    const [{ world }, { canon, events, pointer }] = await Promise.all([
      readWorld(worldId),
      readCanon(worldId, canonId)
    ]);
    return (
      <main className="world-canvas">
        <StatusIsland
          worldId={worldId}
          worldTitle={world.title}
          canonId={canon.id}
          canonTitle={canon.title}
          revision={pointer.served_revision}
        />
        <nav className="breadcrumb">
          <a href={`/worlds/${worldId}`}>{world.title}</a>
          <span>/</span>
          <span>{canon.title}</span>
        </nav>
        <section className="world-intro">
          <p className="eyebrow">CANON · REVISION {pointer.served_revision}</p>
          <h1>{canon.title}</h1>
          <p>{canon.description}</p>
        </section>
        <section className="card-dock" aria-labelledby="events-title">
          <p className="eyebrow" id="events-title">
            EVENTS
          </p>
          <div className="card-list">
            {events.map((event) => (
              <a
                className="canon-card event-card"
                href={`/worlds/${worldId}/canons/${canon.id}/events/${event.id}`}
                key={event.id}
              >
                <span>{event.title}</span>
                <small>{event.summary}</small>
                <b aria-hidden="true">→</b>
              </a>
            ))}
          </div>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
