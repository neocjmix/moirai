"use client";

import type { PublicGraphScopeArtifact } from "@moirai/contracts";
import type { dia } from "@joint/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./graph-explorer.module.css";

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.4;
const PAPER_HEIGHT = 520;

interface ViewState {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const INITIAL_VIEW: ViewState = { scale: 0.78, x: 24, y: 28 };

function focusFromLocation(artifact: PublicGraphScopeArtifact): string | null {
  const value = new URL(window.location.href).searchParams.get("focus");
  return artifact.nodes.some((node) => node.event_id === value) ? value : null;
}

export function GraphExplorer({
  artifact,
  initialFocus
}: {
  readonly artifact: PublicGraphScopeArtifact;
  readonly initialFocus: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    graph: dia.Graph;
    paper: dia.Paper;
    view: ViewState;
  } | null>(null);
  const [focus, setFocus] = useState(
    artifact.nodes.some((node) => node.event_id === initialFocus)
      ? initialFocus
      : null
  );
  const selected = useMemo(
    () => artifact.nodes.find((node) => node.event_id === focus) ?? null,
    [artifact.nodes, focus]
  );
  const titlesByEventId = useMemo(
    () => new Map(artifact.nodes.map((node) => [node.event_id, node.title])),
    [artifact.nodes]
  );

  const applyView = useCallback((view: ViewState) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.view = view;
    runtime.paper.scale(view.scale);
    runtime.paper.translate(view.x, view.y);
  }, []);

  const selectEvent = useCallback((eventId: string, updateHistory = true) => {
    setFocus(eventId);
    const runtime = runtimeRef.current;
    if (runtime) {
      for (const cell of runtime.graph.getElements()) {
        const active = cell.get("eventId") === eventId;
        cell.attr("body/stroke", active ? "#18202c" : "#b9aa9e");
        cell.attr("body/strokeWidth", active ? 3 : 1.2);
      }
    }
    if (updateHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "graph");
      url.searchParams.set("focus", eventId);
      window.history.pushState({}, "", url);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const host = hostRef.current;
    if (!host) return;
    void import("@joint/core").then(({ dia: jointDia, shapes }) => {
      if (disposed) return;
      const graph = new jointDia.Graph({}, { cellNamespace: shapes });
      const width = Math.max(host.clientWidth, 320);
      const paper = new jointDia.Paper({
        el: host,
        model: graph,
        width,
        height: PAPER_HEIGHT,
        async: true,
        frozen: true,
        gridSize: 10,
        background: { color: "transparent" },
        cellViewNamespace: shapes,
        interactive: false
      });
      const elements = artifact.nodes.map((node) => {
        const element = new shapes.standard.Rectangle({
          id: node.cell_id,
          position: { x: node.x, y: node.y },
          size: { width: 164, height: 62 },
          attrs: {
            body: {
              fill: node.kind === "composite" ? "#f3dfcf" : "#fffdf8",
              stroke: node.event_id === initialFocus ? "#18202c" : "#b9aa9e",
              strokeWidth: node.event_id === initialFocus ? 3 : 1.2,
              strokeDasharray: node.kind === "composite" ? "5 3" : "none",
              rx: 22,
              ry: 22
            },
            label: {
              text: node.title,
              fill: "#18202c",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 650,
              textWrap: { width: 136, height: 42, ellipsis: true }
            }
          }
        });
        element.set("eventId", node.event_id);
        return element;
      });
      const links = artifact.links.map((item) => {
        const link = new shapes.standard.Link({
          id: item.cell_id,
          source: { id: item.source_cell_id },
          target: { id: item.target_cell_id },
          attrs: {
            line: {
              stroke: item.type === "contains" ? "#d8805e" : "#756b64",
              strokeWidth: item.type === "contains" ? 1.8 : 1.1,
              strokeDasharray:
                item.type === "precedes" || item.type === "not_after"
                  ? "5 4"
                  : "none",
              targetMarker:
                item.direction === "directed"
                  ? {
                      type: "path",
                      d: "M 10 -5 0 0 10 5 z",
                      fill: item.type === "contains" ? "#d8805e" : "#756b64"
                    }
                  : null
            }
          }
        });
        link.router("metro", { padding: 18 });
        link.connector("rounded", { radius: 10 });
        return link;
      });
      graph.resetCells([...elements, ...links]);
      runtimeRef.current = { graph, paper, view: INITIAL_VIEW };
      applyView(INITIAL_VIEW);
      paper.on("element:pointerclick", (elementView: dia.ElementView) => {
        const eventId = elementView.model.get("eventId") as string | undefined;
        if (eventId) selectEvent(eventId);
      });
      paper.unfreeze();

      resize = new ResizeObserver(() => {
        paper.setDimensions(Math.max(host.clientWidth, 320), PAPER_HEIGHT);
      });
      resize.observe(host);
    });
    return () => {
      disposed = true;
      resize?.disconnect();
      runtimeRef.current?.paper.remove();
      runtimeRef.current = null;
      host.replaceChildren();
    };
  }, [applyView, artifact, initialFocus, selectEvent]);

  useEffect(() => {
    const restore = () => {
      const next = focusFromLocation(artifact);
      setFocus(next);
      if (next) selectEvent(next, false);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [artifact, selectEvent]);

  const zoom = (factor: number) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const nextScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, runtime.view.scale * factor)
    );
    applyView({ ...runtime.view, scale: nextScale });
  };

  return (
    <section className={styles.explorer} aria-labelledby="graph-title">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">
            CANON GRAPH · REVISION {artifact.served_revision}
          </p>
          <h2 id="graph-title">사건 관계 탐색</h2>
          <p>
            이 좌표는 시간 사실이 아닌 결정적 overview 배치입니다. 시간 의미는
            아래 관계 기반 시간 표면에서 확인할 수 있습니다.
          </p>
        </div>
        <div className={styles.controls} aria-label="그래프 확대 및 맞춤">
          <button type="button" onClick={() => zoom(1.2)} aria-label="확대">
            +
          </button>
          <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="축소">
            −
          </button>
          <button type="button" onClick={() => applyView(INITIAL_VIEW)}>
            맞춤
          </button>
        </div>
      </div>
      <div className={styles.stage} data-testid="jointjs-graph-stage">
        <div aria-hidden="true" className={styles.paper} ref={hostRef} />
        {selected ? (
          <aside className={styles.selection} aria-live="polite">
            <span>
              {selected.kind === "composite" ? "Composite Event" : "Event"}
            </span>
            <strong>{selected.title}</strong>
            <a href={selected.canonical_url}>Event 상세 열기 →</a>
          </aside>
        ) : null}
      </div>
      <details className={styles.textAlternative}>
        <summary>접근 가능한 사건과 관계 목록</summary>
        <ul>
          {artifact.nodes.map((node) => (
            <li key={node.event_id}>
              <button type="button" onClick={() => selectEvent(node.event_id)}>
                {node.title}
              </button>
              <span>{node.kind}</span>
              <a href={node.canonical_url}>상세</a>
            </li>
          ))}
        </ul>
        <ol>
          {artifact.links.map((link) => (
            <li key={link.relation_id}>
              {link.type}:{" "}
              {titlesByEventId.get(link.source_event_id) ??
                link.source_event_id}{" "}
              {link.direction === "directed" ? "→" : "↔"}{" "}
              {titlesByEventId.get(link.target_event_id) ??
                link.target_event_id}
            </li>
          ))}
        </ol>
      </details>
      <footer className={styles.budget}>
        {artifact.budget.visible_cells}/{artifact.budget.max_cells} cells ·{" "}
        {artifact.budget.visible_labels}/{artifact.budget.max_labels} labels ·{" "}
        {artifact.algorithm_version}
        {artifact.truncated ? ` · ${artifact.next_scope_hint}` : ""}
      </footer>
    </section>
  );
}
