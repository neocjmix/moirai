import type { PublicTimelineItem } from "@moirai/contracts";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { StatusIsland } from "../../../../../components/status-island";
import {
  readCanon,
  readTimeline,
  readWorld,
  selectPublication
} from "../../../../../lib/publication";

export const dynamic = "force-dynamic";

function groupTimelineItems(
  items: readonly PublicTimelineItem[]
): readonly (readonly [string, readonly PublicTimelineItem[]])[] {
  const groups = new Map<string, PublicTimelineItem[]>();
  for (const item of items) {
    const group = groups.get(item.unordered_group) ?? [];
    group.push(item);
    groups.set(item.unordered_group, group);
  }
  return [...groups];
}

function timelineGroupLabel(items: readonly PublicTimelineItem[]): string {
  const first = items[0];
  if (!first) return "시간 배치 없음";
  if (items.length > 1 && first.placement_kind === "authored_coordinate") {
    return "겹치는 시간 범위 · 순서 미정";
  }
  if (first.display_label) return first.display_label;
  if (first.placement_kind === "unplaced") return "시간 배치 없음";
  return `구조 순서 ${first.structural_rank ?? 0}`;
}

export default async function CanonPage({
  params
}: {
  readonly params: Promise<{ worldId: string; canonId: string }>;
}) {
  const { worldId, canonId } = await params;
  try {
    const selected = await selectPublication(worldId);
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
      timeSystems,
      timelineArtifacts
    } = canonDocument;
    const timelines = await Promise.all(
      timelineArtifacts.map((reference) =>
        readTimeline(worldId, canonId, reference, selected)
      )
    );
    const eventById = new Map(events.map((event) => [event.id, event]));
    const timeSystemById = new Map(
      timeSystems.map((timeSystem) => [timeSystem.id, timeSystem])
    );
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
        {timelines.map((timeline) => {
          const groups = groupTimelineItems(timeline.items);
          return (
            <section
              className="timeline-dock"
              aria-labelledby={`timeline-${timeline.time_system_id}`}
              key={timeline.time_system_id}
            >
              <div className="timeline-heading">
                <div>
                  <p className="eyebrow">DERIVED TIMELINE</p>
                  <h2 id={`timeline-${timeline.time_system_id}`}>
                    {timeSystemById.get(timeline.time_system_id)?.title ??
                      "Timeline"}
                  </h2>
                </div>
                <span>{timeline.completeness}</span>
              </div>
              <p className="timeline-note">
                저장된 시간 좌표와 구조 관계에서 계산한 관점입니다. 같은 묶음
                안의 사건에는 임의의 순서를 부여하지 않습니다.
              </p>
              <ol className="timeline-groups">
                {groups.map(([groupId, items]) => (
                  <li className="timeline-group" key={groupId}>
                    <p>{timelineGroupLabel(items)}</p>
                    <div>
                      {items.map((item) => {
                        const event = eventById.get(item.event_id);
                        return event ? (
                          <a
                            href={`/worlds/${worldId}/canons/${canon.id}/events/${event.id}`}
                            key={event.id}
                          >
                            <b>{event.title}</b>
                            <small>
                              {item.placement_kind.replaceAll("_", " ")}
                              {item.certainty ? ` · ${item.certainty}` : ""}
                            </small>
                          </a>
                        ) : null;
                      })}
                    </div>
                  </li>
                ))}
              </ol>
              {timeline.diagnostics.length > 0 ? (
                <p className="timeline-warning" role="status">
                  {timeline.diagnostics.map((item) => item.code).join(", ")}
                </p>
              ) : null}
            </section>
          );
        })}
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
