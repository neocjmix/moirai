"use client";

import type {
  PublicEvent,
  PublicNarrative,
  PublicProcessProjection,
  PublicRelation,
  PublicTemporalPlacement,
  PublicTimeSystem
} from "@moirai/contracts";
import { useState } from "react";
import Markdown from "react-markdown";

interface EventSheetProps {
  readonly title: string;
  readonly summary: string | null;
  readonly kind: string;
  readonly revision: number;
  readonly worldId: string;
  readonly canonId: string;
  readonly eventId: string;
  readonly process: PublicProcessProjection | null;
  readonly parentProcessIds: readonly string[];
  readonly narratives: readonly PublicNarrative[];
  readonly temporalPlacements: readonly PublicTemporalPlacement[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly relations: readonly PublicRelation[];
  readonly relatedEvents: readonly PublicEvent[];
}

export function EventSheet({
  title,
  summary,
  kind,
  revision,
  worldId,
  canonId,
  eventId,
  process,
  parentProcessIds,
  narratives,
  temporalPlacements,
  timeSystems,
  relations,
  relatedEvents
}: EventSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const eventById = new Map(relatedEvents.map((event) => [event.id, event]));
  const timeSystemById = new Map(
    timeSystems.map((timeSystem) => [timeSystem.id, timeSystem])
  );
  return (
    <article className="event-sheet" data-expanded={expanded}>
      <button
        aria-expanded={expanded}
        aria-label={
          expanded ? "사건 상세 줄이기" : "사건 상세 전체 화면으로 보기"
        }
        className="sheet-handle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span />
      </button>
      <div className="sheet-copy">
        <p className="eyebrow">EVENT · {kind.toUpperCase()}</p>
        <h1>{title}</h1>
        <p className="event-summary">
          {summary ?? "이 사건에는 아직 요약이 없습니다."}
        </p>
        {narratives.map((narrative) => (
          <section className="narrative-block" key={narrative.id}>
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
          </section>
        ))}
        {process ? (
          <section className="context-block" aria-labelledby="process-heading">
            <p className="eyebrow" id="process-heading">
              DERIVED PROCESS
            </p>
            <div className="context-row">
              <span>
                {process.direct_child_event_ids.length} direct events ·{" "}
                {process.descendant_event_ids.length} total
              </span>
              <small>{process.completeness}</small>
            </div>
            {process.durations.map((duration) => (
              <div className="context-row" key={duration.time_system_id}>
                <span>
                  Duration{" "}
                  {duration.minimum === duration.maximum
                    ? duration.minimum
                    : `${duration.minimum}–${duration.maximum}`}{" "}
                  {duration.precision}
                </span>
                <small>
                  {timeSystemById.get(duration.time_system_id)?.title ??
                    "Time System"}{" "}
                  · {duration.kind}
                </small>
              </div>
            ))}
            {process.direct_child_event_ids.map((childId) => {
              const child = eventById.get(childId);
              return child ? (
                <a
                  className="relation-row"
                  href={`/worlds/${worldId}/canons/${canonId}/events/${child.id}`}
                  key={child.id}
                >
                  <span>contains</span>
                  <b>{child.title}</b>
                  <i aria-hidden="true">→</i>
                </a>
              ) : null;
            })}
            {process.diagnostics.length > 0 ? (
              <p className="timeline-warning" role="status">
                {process.diagnostics.map((item) => item.code).join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}
        {parentProcessIds.length > 0 ? (
          <section
            className="context-block"
            aria-labelledby="parent-process-heading"
          >
            <p className="eyebrow" id="parent-process-heading">
              PART OF PROCESS
            </p>
            {parentProcessIds.map((parentId) => {
              const parent = eventById.get(parentId);
              return parent ? (
                <a
                  className="relation-row"
                  href={`/worlds/${worldId}/canons/${canonId}/events/${parent.id}`}
                  key={parent.id}
                >
                  <span>process</span>
                  <b>{parent.title}</b>
                  <i aria-hidden="true">→</i>
                </a>
              ) : null;
            })}
          </section>
        ) : null}
        {temporalPlacements.length > 0 ? (
          <section className="context-block" aria-labelledby="time-heading">
            <p className="eyebrow" id="time-heading">
              TIME
            </p>
            {temporalPlacements.map((placement) => (
              <div className="context-row" key={placement.id}>
                <span>
                  {placement.display_label ??
                    `${placement.earliest_start.value}–${placement.latest_start.value}`}
                </span>
                <small>
                  {timeSystemById.get(placement.time_system_id)?.title ??
                    "Time System"}{" "}
                  · {placement.certainty}
                </small>
              </div>
            ))}
          </section>
        ) : null}
        {relations.length > 0 ? (
          <section
            className="context-block"
            aria-labelledby="relations-heading"
          >
            <p className="eyebrow" id="relations-heading">
              RELATED CONTEXT
            </p>
            {relations.map((relation) => {
              const outgoing = relation.source_event_id === eventId;
              const relatedId = outgoing
                ? relation.target_event_id
                : relation.source_event_id;
              const related = eventById.get(relatedId);
              return related ? (
                <a
                  className="relation-row"
                  href={`/worlds/${worldId}/canons/${canonId}/events/${related.id}`}
                  key={relation.id}
                >
                  <span>
                    {outgoing ? relation.type : `${relation.type} · incoming`}
                  </span>
                  <b>{related.title}</b>
                  <i aria-hidden="true">→</i>
                </a>
              ) : null;
            })}
          </section>
        ) : null}
        <dl className="event-meta">
          <div>
            <dt>Publication</dt>
            <dd>Revision {revision}</dd>
          </div>
          <div>
            <dt>Reading source</dt>
            <dd>Snapshot only</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
