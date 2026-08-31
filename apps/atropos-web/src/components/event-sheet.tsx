"use client";

import { useState } from "react";

interface EventSheetProps {
  readonly title: string;
  readonly summary: string | null;
  readonly kind: string;
  readonly revision: number;
}

export function EventSheet({
  title,
  summary,
  kind,
  revision
}: EventSheetProps) {
  const [expanded, setExpanded] = useState(false);
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
