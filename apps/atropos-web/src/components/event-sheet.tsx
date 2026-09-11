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
  readonly scopeContent?: ReactNode;
  readonly title: string;
  readonly summary: string | null;
  readonly kind: string;
  readonly revision: number;
  readonly worldId: string;
  readonly eventId: string;
  readonly canonId?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly narratives: readonly PublicNarrative[];
  readonly relations: readonly PublicRelation[];
  readonly relatedEvents: readonly PublicEvent[];
}

export function EventSheet({
  temporalContent,
  scopeContent,
  title,
  summary,
  kind,
  revision,
  worldId,
  eventId,
  canonId,
  attributes,
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
        <nav
          className="event-detail-navigation"
          aria-label="Stable event navigation"
        >
          {canonId ? (
            <>
              <a href={`/worlds/${worldId}/events/${eventId}`}>
                World Event canonical URL
              </a>
              <a
                href={`/worlds/${worldId}/canons/${canonId}?view=graph&focus=${eventId}`}
              >
                그래프로 돌아가기
              </a>
            </>
          ) : null}
        </nav>
        {scopeContent}
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
                  href={`/worlds/${worldId}/events/${related.id}`}
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
        <section
          className="context-block"
          aria-labelledby="event-attributes-heading"
        >
          <p className="eyebrow" id="event-attributes-heading">
            STRUCTURED ATTRIBUTES
          </p>
          {Object.keys(attributes).length > 0 ? (
            <dl className="structured-attributes">
              {Object.entries(attributes).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    <code>{JSON.stringify(value)}</code>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>No additional attributes.</p>
          )}
        </section>
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
