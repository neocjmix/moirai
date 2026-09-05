import { notFound, redirect } from "next/navigation";
import { StatusIsland } from "../../../../../../../components/status-island";
import {
  readCanon,
  readSubject,
  readStates,
  readWorld,
  selectPublication
} from "../../../../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function SubjectPage({
  params
}: {
  readonly params: Promise<{
    worldId: string;
    canonId: string;
    subjectHandleId: string;
  }>;
}) {
  const { worldId, canonId, subjectHandleId } = await params;
  try {
    const selected = await selectPublication(worldId);
    const [{ world }, canonDocument, { pointer, document }] = await Promise.all(
      [
        readWorld(worldId, selected),
        readCanon(worldId, canonId, selected),
        readSubject(worldId, canonId, subjectHandleId, selected)
      ]
    );
    const { canon, events } = canonDocument;
    if (document.handle.status === "redirected" && document.redirect_url) {
      redirect(document.redirect_url);
    }
    if (document.handle.status !== "active" || !document.subject) notFound();

    const subject = document.subject;
    const memberEvents = subject.member_event_ids.flatMap((eventId) => {
      const event = events.find((candidate) => candidate.id === eventId);
      return event ? [event] : [];
    });
    const states = canonDocument.stateArtifact
      ? (
          await readStates(
            worldId,
            canonId,
            canonDocument.stateArtifact,
            selected
          )
        ).items.filter(
          (state) => state.subject_handle_id === subject.subject_handle_id
        )
      : [];
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
          <a href={`/worlds/${worldId}/canons/${canonId}`}>{canon.title}</a>
          <span>/</span>
          <span>Subject</span>
        </nav>
        <section className="world-intro">
          <p className="eyebrow">
            DERIVED SUBJECT · REVISION {pointer.served_revision}
          </p>
          <h1>{subject.label}</h1>
          <p>
            저장된 정체성 관계로 계산한 관점입니다. 이름이 같다는 이유만으로
            사건을 합치지 않습니다.
          </p>
        </section>
        <section className="card-dock" aria-labelledby="subject-events-title">
          <div className="timeline-heading">
            <div>
              <p className="eyebrow">IDENTITY EVIDENCE</p>
              <h2 id="subject-events-title">연결된 사건</h2>
            </div>
            <span>{subject.completeness}</span>
          </div>
          <div className="card-list">
            {memberEvents.map((event) => (
              <a
                className="canon-card event-card"
                href={`/worlds/${worldId}/canons/${canonId}/events/${event.id}`}
                key={event.id}
              >
                <span>{event.title}</span>
                <small>
                  {event.id === subject.anchor_event_id
                    ? "stable handle anchor"
                    : "identity member"}
                </small>
                <b aria-hidden="true">→</b>
              </a>
            ))}
          </div>
          {subject.lineage.incoming.length > 0 ||
          subject.lineage.outgoing.length > 0 ? (
            <p className="timeline-note">
              Lineage: {subject.lineage.incoming.length} incoming ·{" "}
              {subject.lineage.outgoing.length} outgoing
            </p>
          ) : null}
        </section>
        {states.length > 0 ? (
          <section className="card-dock" aria-labelledby="subject-states-title">
            <div className="timeline-heading">
              <div>
                <p className="eyebrow">DERIVED STATE</p>
                <h2 id="subject-states-title">계산된 상태</h2>
              </div>
              <span>{states.length}</span>
            </div>
            <div className="card-list">
              {states.map((state) => (
                <a
                  className="canon-card event-card"
                  href={`/worlds/${worldId}/canons/${canonId}/events/${state.state_event_id}`}
                  key={`${state.state_event_id}-${state.time_system_id ?? "unresolved"}`}
                >
                  <span>{state.label}</span>
                  <small>
                    {state.value ? `${state.value} · ` : ""}
                    {state.open_ended
                      ? "종료 근거 없음"
                      : state.duration
                        ? `${state.duration.minimum}${state.duration.minimum === state.duration.maximum ? "" : `–${state.duration.maximum}`} ${state.duration.precision}`
                        : "기간 미해결"}
                  </small>
                  <b aria-hidden="true">→</b>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      (error.digest.startsWith("NEXT_REDIRECT") ||
        error.digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
    ) {
      throw error;
    }
    notFound();
  }
}
