import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { StatusIsland } from "../../../../../components/status-island";
import {
  readCanon,
  readWorld,
  selectPublication
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function CanonPage({
  params
}: {
  readonly params: Promise<{ worldId: string; canonId: string }>;
}) {
  const { worldId, canonId } = await params;
  try {
    const selected = await selectPublication(worldId);
    const [{ world }, { canon, events, narratives, pointer }] =
      await Promise.all([
        readWorld(worldId, selected),
        readCanon(worldId, canonId, selected)
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
          {narratives.map((narrative) => (
            <div className="canon-narrative" key={narrative.id}>
              {narrative.title ? <h2>{narrative.title}</h2> : null}
              <Markdown skipHtml>{narrative.body}</Markdown>
              {narrative.public_references.length > 0 ? (
                <ul className="public-references">
                  {narrative.public_references.map((reference) => (
                    <li key={reference.url}>
                      <a href={reference.url} rel="noreferrer" target="_blank">
                        {reference.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <a className="text-action" href={`/worlds/${worldId}/search`}>
            이 World 검색 →
          </a>
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
