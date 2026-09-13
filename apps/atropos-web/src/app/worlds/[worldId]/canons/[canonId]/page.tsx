import { RelationalTime } from "../../../../../components/relational-time";
import { GraphExplorer } from "../../../../../components/graph-explorer";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { StatusIsland } from "../../../../../components/status-island";
import {
  readCanon,
  readGraphScope,
  readRelationalTime,
  readWorld,
  selectPublication,
  selectPublicationRevision
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function CanonPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ worldId: string; canonId: string }>;
  readonly searchParams: Promise<{
    focus?: string | string[];
    revision?: string | string[];
  }>;
}) {
  const { worldId, canonId } = await params;
  const query = await searchParams;
  try {
    const selected =
      typeof query.revision === "string"
        ? await selectPublicationRevision(worldId, Number(query.revision))
        : await selectPublication(worldId);
    const [{ world }, canonDocument] = await Promise.all([
      readWorld(worldId, selected),
      readCanon(worldId, canonId, selected)
    ]);
    const {
      canon,
      events,
      narratives,
      pointer,
      subjectArtifacts,
      temporalArtifact,
      graphScopeArtifact
    } = canonDocument;
    const temporal = await readRelationalTime(
      worldId,
      canonId,
      temporalArtifact,
      selected
    );
    const graphScope = graphScopeArtifact
      ? await readGraphScope(
          worldId,
          canonId,
          graphScopeArtifact,
          selected
        ).catch(() => null)
      : null;
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
        {graphScope ? (
          <GraphExplorer
            artifact={graphScope}
            initialFocus={typeof query.focus === "string" ? query.focus : null}
          />
        ) : (
          <section className="graph-unavailable" aria-label="그래프 준비 상태">
            <p className="eyebrow">CANON GRAPH</p>
            <h2>이 Revision에는 현재 그래프 projection이 없습니다.</h2>
            <p>
              Event와 관계 기반 시간 내용은 아래에서 그대로 탐색할 수 있습니다.
              다음 Publication Revision에서 그래프가 생성됩니다.
            </p>
          </section>
        )}
        <RelationalTime projection={temporal} events={events} />
        {subjectArtifacts.length > 0 ? (
          <section className="card-dock" aria-labelledby="subjects-title">
            <p className="eyebrow" id="subjects-title">
              DERIVED SUBJECTS
            </p>
            <p className="timeline-note">
              명시적인 정체성 관계로 연결된 사건 집합입니다.
            </p>
            <div className="card-list">
              {subjectArtifacts.map((subject) => (
                <a
                  className="canon-card"
                  href={`/worlds/${worldId}/canons/${canon.id}/subjects/${subject.subject_handle_id}`}
                  key={subject.subject_handle_id}
                >
                  <span>{subject.label}</span>
                  <small>{subject.member_count} identity events</small>
                  <b aria-hidden="true">→</b>
                </a>
              ))}
            </div>
          </section>
        ) : null}
        <section className="card-dock" aria-labelledby="events-title">
          <p className="eyebrow" id="events-title">
            EVENTS
          </p>
          <div className="card-list">
            {events.map((event) => (
              <a
                className="canon-card event-card"
                href={`/worlds/${worldId}/canons/${canon.id}/events/${event.id}?revision=${pointer.served_revision}`}
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
