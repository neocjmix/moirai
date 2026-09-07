"use client";

import type {
  PublicEvent,
  PublicNarrative,
  PublicRelation
} from "@moirai/contracts";
import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";

interface EventSheetProps {
  readonly temporalContent?: ReactNode;
  readonly title: string;
  readonly summary: string | null;
  readonly kind: string;
  readonly revision: number;
  readonly worldId: string;
  readonly canonId: string;
  readonly eventId: string;
  readonly narratives: readonly PublicNarrative[];
  readonly relations: readonly PublicRelation[];
  readonly relatedEvents: readonly PublicEvent[];
}

export function EventSheet({
  temporalContent,
  title,
  summary,
  kind,
  revision,
  worldId,
  canonId,
  eventId,
  narratives,
  relations,
  relatedEvents
}: EventSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const eventById = new Map(relatedEvents.map((event) => [event.id, event]));
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
        {temporalContent}
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
        {relations.length > 0 ? (
          <section
            className="context-block"
            aria-labelledby="relations-heading"
          >
            <p className="eyebrow" id="relations-heading">
              RELATED CONTEXT
            </p>
            {relations.map((relation) => {
              const sourceId =
                relation.source_ref.kind === "event"
                  ? relation.source_ref.event_id
                  : null;
              const targetId =
                relation.target_ref.kind === "event"
                  ? relation.target_ref.event_id
                  : null;
              const outgoing = sourceId === eventId;
              const relatedId = outgoing ? targetId : sourceId;
              if (!relatedId) return null;
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
