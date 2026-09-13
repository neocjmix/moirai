"use client";

import type {
  PublicEvent,
  PublicNarrative,
  PublicRelation
} from "@moirai/contracts";
import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import {
  eventReadingSearch,
  graphReturnHref
} from "../lib/event-reading-navigation";
import { relationReadingLabel } from "../lib/relation-reading-label";

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
  readonly graphSearch?: string;
  readonly canonLabels?: Readonly<Record<string, string>>;
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
  graphSearch = "",
  canonLabels = {},
  attributes,
  narratives,
  relations,
  relatedEvents
}: EventSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const eventById = new Map(relatedEvents.map((event) => [event.id, event]));
  const readingSearch = eventReadingSearch(revision, graphSearch);
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
              <a href={`/worlds/${worldId}/events/${eventId}${readingSearch}`}>
                이 사건의 모든 Canon 읽기
              </a>
              <a
                href={
                  graphReturnHref(graphSearch) ??
                  `/worlds/${worldId}/canons/${canonId}${readingSearch}&view=graph&focus=${eventId}`
                }
              >
                그래프로 돌아가기
              </a>
            </>
          ) : null}
        </nav>
        {temporalContent}
        {narratives.map((narrative) => (
          <section className="narrative-block" key={narrative.id}>
            <p className="eyebrow">
              {canonLabels[narrative.canon_id] ?? "Canon"} · {narrative.locale}
            </p>
            {narrative.title && narrative.title !== title ? (
              <h2>{narrative.title}</h2>
            ) : null}
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
        {scopeContent}
        {relations.length > 0 ? (
          <section
            className="context-block"
            aria-labelledby="relations-heading"
          >
            <p className="eyebrow" id="relations-heading">
              함께 읽을 사건
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
                  href={`/worlds/${worldId}/events/${related.id}${readingSearch}`}
                  key={relation.id}
                >
                  <span>{relationReadingLabel(relation.type, outgoing)}</span>
                  <b>{related.title}</b>
                  <small>
                    {(canonId ? [canonId] : relation.canon_memberships)
                      .map((id) => canonLabels[id] ?? id)
                      .join(" · ")}
                  </small>
                  <i aria-hidden="true">→</i>
                </a>
              ) : null;
            })}
          </section>
        ) : null}
        <details className="context-block">
          <summary>기록 정보 · 속성과 Publication</summary>
          <section
            className="context-block"
            aria-labelledby="event-attributes-heading"
            data-testid="event-raw-attributes"
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
          <a
            href={`/worlds/${worldId}/revisions/${revision}/events/${eventId}.json`}
          >
            이 판본의 공개 사건 원문
          </a>
        </details>
      </div>
    </article>
  );
}
