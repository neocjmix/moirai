"use client";

import { useState } from "react";

interface StatusIslandProps {
  readonly worldId: string;
  readonly worldTitle: string;
  readonly canonId?: string;
  readonly canonTitle?: string;
  readonly revision: number;
}

export function StatusIsland({
  worldId,
  worldTitle,
  canonId,
  canonTitle,
  revision
}: StatusIslandProps) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="status-chrome">
      <div className="status-island" data-open={open}>
        <button
          aria-expanded={open}
          className="status-island-toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span>Atropos</span>
          <span className="status-divider" />
          <span className="status-context">{canonTitle ?? worldTitle}</span>
          <span className="revision-chip">r{revision}</span>
        </button>
        <div className="status-panel" aria-hidden={!open}>
          <p className="eyebrow">CURRENT PUBLICATION</p>
          <h2>{worldTitle}</h2>
          {canonTitle ? <p className="panel-canon">{canonTitle}</p> : null}
          <dl className="status-facts">
            <div>
              <dt>Served revision</dt>
              <dd>{revision}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Immutable Snapshot</dd>
            </div>
          </dl>
          <nav className="panel-actions" aria-label="Publication context">
            <a href={`/worlds/${worldId}`}>World</a>
            {canonId ? (
              <a href={`/worlds/${worldId}/canons/${canonId}`}>Canon</a>
            ) : null}
            <a href="/__status">Status</a>
          </nav>
        </div>
      </div>
    </aside>
  );
}
