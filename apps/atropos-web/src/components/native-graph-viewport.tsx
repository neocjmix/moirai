"use client";

import type {
  MoiraiGraphEvent,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import type { AppLocale } from "../urdr-port/src/locale";
import { useGraphQuery } from "./graph-query-context";
import styles from "./native-graph-viewport.module.css";

type Tab = "sources" | "entities" | "derived" | "relations" | "diagnostics";

const COPY = {
  ko: {
    title: "Moirai 공개 그래프",
    loading: "immutable Publication query를 불러오는 중입니다.",
    unavailable: "공개 그래프 query를 불러올 수 없습니다.",
    sources: "Sources",
    entities: "Entities",
    derived: "Derived",
    relations: "Relations",
    diagnostics: "Diagnostics",
    search: "현재 결과 검색",
    detail: "World Event 상세 열기 →",
    fallback: "접근 가능한 정본 결과 목록",
    memberships: "Canon memberships",
    matched: "Matched Canons"
  },
  en: {
    title: "Moirai public graph",
    loading: "Loading the immutable Publication query.",
    unavailable: "The public graph query is unavailable.",
    sources: "Sources",
    entities: "Entities",
    derived: "Derived",
    relations: "Relations",
    diagnostics: "Diagnostics",
    search: "Search current result",
    detail: "Open World Event detail →",
    fallback: "Accessible canonical result list",
    memberships: "Canon memberships",
    matched: "Matched Canons"
  }
} as const;

function eventKey(event: Pick<MoiraiGraphEvent, "world_id" | "id">) {
  return `${event.world_id}:${event.id}`;
}

function rank(event: MoiraiGraphEvent, fallback: number) {
  return event.temporal_position.kind === "relative_only" ||
    event.temporal_position.kind === "mixed"
    ? event.temporal_position.rank
    : fallback;
}

export function NativeGraphViewport({
  initialResult,
  locale
}: Readonly<{
  initialResult: MoiraiGraphQueryResult;
  locale: AppLocale;
}>) {
  const copy = COPY[locale];
  const { state, setState } = useGraphQuery();
  const [result, setResult] = useState(initialResult);
  const [status, setStatus] = useState<"ready" | "loading" | "unavailable">(
    "ready"
  );
  const [activeTab, setActiveTab] = useState<Tab>("sources");
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ x: 80, y: 170, scale: 1 });
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  useEffect(() => {
    if (state.query === initialResult.query) return;
    const controller = new AbortController();
    setStatus("loading");
    void fetch("/graph/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.query),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("graph query failed");
        return (await response.json()) as { result: MoiraiGraphQueryResult };
      })
      .then((payload) => {
        setResult(payload.result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setStatus("unavailable");
        }
      });
    return () => controller.abort();
  }, [initialResult.query, state.query]);

  useEffect(() => {
    const detail =
      view.scale < 0.75
        ? ({ level: "overview", entities: 250 } as const)
        : view.scale > 1.5
          ? ({ level: "full", entities: 2_500 } as const)
          : ({ level: "standard", entities: 1_000 } as const);
    setState((current) => {
      if (
        current.query.budget.detail_level === detail.level &&
        current.query.budget.max_entities === detail.entities
      )
        return current;
      return {
        ...current,
        query: {
          ...current.query,
          budget: {
            detail_level: detail.level,
            max_entities: detail.entities,
            max_relations: detail.entities * 2,
            max_evidence: detail.entities * 4
          }
        }
      };
    });
  }, [setState, view.scale]);

  const worlds = useMemo(
    () => result.revision_vector.map((entry) => entry.world_id),
    [result.revision_vector]
  );
  const nodes = useMemo(
    () =>
      result.events.map((event, index) => {
        const temporalLane = [
          "exact",
          "bounded",
          "relative_only",
          "mixed",
          "unplaced"
        ].indexOf(event.temporal_position.kind);
        const worldColumn = Math.max(0, worlds.indexOf(event.world_id));
        return {
          event,
          x: worldColumn * 1_080 + Math.max(0, temporalLane) * 210,
          y: rank(event, index) * 118,
          key: eventKey(event)
        };
      }),
    [result.events, worlds]
  );
  const nodeByKey = useMemo(
    () => new Map(nodes.map((node) => [node.key, node])),
    [nodes]
  );
  const selected = useMemo(() => {
    if (state.focus?.kind !== "event" || state.focus.event_ref.kind !== "event")
      return null;
    return (
      result.events.find(
        (event) =>
          event.world_id === state.focus?.world_id &&
          event.id ===
            (state.focus?.kind === "event" &&
            state.focus.event_ref.kind === "event"
              ? state.focus.event_ref.event_id
              : null)
      ) ?? null
    );
  }, [result.events, state.focus]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEvents = result.events.filter((event) =>
    normalizedQuery
      ? `${event.title} ${event.summary ?? ""} ${event.id}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      : true
  );

  const select = (event: MoiraiGraphEvent) => {
    const canonId = event.matched_canon_ids[0] ?? event.canon_memberships[0];
    if (!canonId) return;
    setState((current) => ({
      ...current,
      focus: {
        kind: "event",
        world_id: event.world_id,
        canon_id: canonId,
        served_revision: event.served_revision,
        event_ref: { kind: "event", event_id: event.id }
      }
    }));
  };

  const beginDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-graph-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    if (pointers.current.size === 2) {
      const [left, right] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(
        right!.x - left!.x,
        right!.y - left!.y
      );
      drag.current = null;
      return;
    }
    drag.current = {
      x: view.x,
      y: view.y,
      startX: event.clientX,
      startY: event.clientY
    };
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });
    }
    if (pointers.current.size === 2) {
      const [left, right] = [...pointers.current.values()];
      const next = Math.hypot(right!.x - left!.x, right!.y - left!.y);
      const previous = pinchDistance.current;
      if (previous && next > 0) {
        setView((current) => ({
          ...current,
          scale: Math.min(2.4, Math.max(0.4, current.scale * (next / previous)))
        }));
      }
      pinchDistance.current = next;
      return;
    }
    if (!drag.current) return;
    setView((current) => ({
      ...current,
      x: drag.current!.x + event.clientX - drag.current!.startX,
      y: drag.current!.y + event.clientY - drag.current!.startY
    }));
  };
  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
    drag.current = null;
  };

  return (
    <main className={styles.viewport} data-testid="native-moirai-viewport">
      <svg
        aria-label={copy.title}
        className={styles.canvas}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onWheel={(event) => {
          event.preventDefault();
          setView((current) => ({
            ...current,
            scale: Math.min(
              2.4,
              Math.max(
                0.4,
                current.scale * (event.deltaY < 0 ? 1.08 : 1 / 1.08)
              )
            )
          }));
        }}
        role="img"
        viewBox="0 0 1200 900"
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {result.relations.map((relation) => {
            if (
              relation.source_ref.kind !== "event" ||
              relation.target_ref.kind !== "event"
            )
              return null;
            const source = nodeByKey.get(
              `${relation.world_id}:${relation.source_ref.event_id}`
            );
            const target = nodeByKey.get(
              `${relation.world_id}:${relation.target_ref.event_id}`
            );
            if (!source || !target) return null;
            return (
              <g key={`${relation.world_id}:${relation.id}`}>
                <line
                  className={styles.edge}
                  data-relation-id={relation.id}
                  data-type={relation.type}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
                <text
                  x={(source.x + target.x) / 2 + 8}
                  y={(source.y + target.y) / 2 - 6}
                >
                  {relation.type}
                </text>
              </g>
            );
          })}
          {nodes.map(({ event, x, y, key }) => (
            <g
              className={styles.node}
              data-graph-node
              data-selected={
                selected?.id === event.id &&
                selected.world_id === event.world_id
              }
              key={key}
              onClick={() => select(event)}
              onKeyDown={(keyboardEvent) => {
                if (
                  keyboardEvent.key === "Enter" ||
                  keyboardEvent.key === " "
                ) {
                  keyboardEvent.preventDefault();
                  select(event);
                }
              }}
              role="button"
              tabIndex={0}
              transform={`translate(${x} ${y})`}
            >
              <circle r={38} />
              <text textAnchor="middle" y={-2}>
                {event.title.slice(0, 24)}
              </text>
              <text className={styles.membership} textAnchor="middle" y={15}>
                {event.temporal_position.kind} ·{" "}
                {event.canon_memberships.length} Canon
              </text>
            </g>
          ))}
        </g>
      </svg>

      <section className={styles.island} aria-label="Graph query island">
        <header>
          <div>
            <h1>{copy.title}</h1>
            <p>
              {result.revision_vector
                .map((entry) => `Revision ${entry.served_revision}`)
                .join(" · ")}{" "}
              · {result.events.length} Events · {result.relations.length}{" "}
              Relations
            </p>
          </div>
          <p>{result.completeness}</p>
        </header>
        <div className={styles.tabs} role="tablist">
          {(
            [
              "sources",
              "entities",
              "derived",
              "relations",
              "diagnostics"
            ] as const
          ).map((tab) => (
            <button
              aria-selected={activeTab === tab}
              key={tab}
              onClick={() => setActiveTab(tab)}
              role="tab"
              type="button"
            >
              {copy[tab]}
            </button>
          ))}
        </div>
        <div className={styles.panel} role="tabpanel">
          {activeTab === "sources" ? (
            <ul className={styles.list}>
              {result.query.sources.map((source) => (
                <li key={source.world_id}>
                  <article>
                    <strong>World · {source.world_id}</strong>
                    <span>served Revision {source.served_revision}</span>
                    <small>
                      peer Canon memberships: {source.canon_ids.join(", ")}
                    </small>
                    {source.canon_ids.map((canonId) => (
                      <button
                        aria-label={`Canon ${canonId}`}
                        aria-pressed="true"
                        key={canonId}
                        onClick={() =>
                          setState((current) => {
                            const currentSource = current.query.sources.find(
                              (candidate) =>
                                candidate.world_id === source.world_id
                            );
                            if (
                              !currentSource ||
                              currentSource.canon_ids.length <= 1
                            )
                              return current;
                            return {
                              ...current,
                              query: {
                                ...current.query,
                                sources: current.query.sources.map(
                                  (candidate) =>
                                    candidate.world_id === source.world_id
                                      ? {
                                          ...candidate,
                                          canon_ids: candidate.canon_ids.filter(
                                            (id) => id !== canonId
                                          )
                                        }
                                      : candidate
                                )
                              }
                            };
                          })
                        }
                        type="button"
                      >
                        {canonId}
                      </button>
                    ))}
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
          {activeTab === "entities" ? (
            <>
              <input
                aria-label={copy.search}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.search}
                type="search"
                value={query}
              />
              <ul className={styles.list}>
                {visibleEvents.map((event) => (
                  <li key={eventKey(event)}>
                    <button onClick={() => select(event)} type="button">
                      <strong>{event.title}</strong>
                      <span>{event.event_kind} · persisted</span>
                      <small>
                        {copy.matched}: {event.matched_canon_ids.join(", ")}
                      </small>
                      <small>
                        {copy.memberships}: {event.canon_memberships.join(", ")}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {activeTab === "derived" ? (
            <ul className={styles.list}>
              {result.subjects.map((subject) => (
                <li key={`${subject.world_id}:${subject.subject_handle_id}`}>
                  <article>
                    <strong>Subject · {subject.label}</strong>
                    <span>{subject.subject_handle_id}</span>
                    <small>
                      {subject.completeness} · evidence{" "}
                      {subject.evidence_ids.join(", ") || "none"}
                    </small>
                  </article>
                </li>
              ))}
              {result.composites.map((composite) => (
                <li
                  key={`${composite.world_id}:${composite.canon_id}:${composite.event_id}`}
                >
                  <article>
                    <strong>Composite / Process</strong>
                    <span>{composite.event_id}</span>
                    <small>
                      {composite.completeness} · children{" "}
                      {composite.direct_child_event_ids.length} · evidence{" "}
                      {composite.evidence_ids.join(", ") || "none"}
                    </small>
                  </article>
                </li>
              ))}
              {result.states.map((item) => (
                <li
                  key={`${item.world_id}:${item.canon_id}:${item.composite_event_id}:${item.subject_handle_id}:${item.state_family}`}
                >
                  <article>
                    <strong>State · {item.state_family}</strong>
                    <span>
                      {item.status} · {item.algorithm_version}
                    </span>
                    <small>
                      {item.completeness} · evidence{" "}
                      {item.evidence_ids.join(", ") || "none"}
                    </small>
                  </article>
                </li>
              ))}
              {result.virtual_time_events.map((item) => (
                <li key={`${item.world_id}:${item.canon_id}:${item.id}`}>
                  <article>
                    <strong>Virtual Time Event · derived</strong>
                    <span>{item.reference.coordinate}</span>
                    <small>
                      {item.reference.time_system_ref.time_system_id} · evidence{" "}
                      {item.evidence_ids.join(", ") || "none"}
                    </small>
                  </article>
                </li>
              ))}
              {result.narratives.map((item) => (
                <li key={`${item.world_id}:${item.canon_id}:${item.id}`}>
                  <article>
                    <strong>
                      Narrative · {item.title ?? item.narrative_kind}
                    </strong>
                    <span>
                      {item.locale} · {item.scope_type}
                    </span>
                    <small>
                      {item.public_references
                        .map((reference) => reference.url)
                        .join(", ") || "no public reference"}
                    </small>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
          {activeTab === "relations" ? (
            <ul className={styles.list}>
              {result.relations.map((relation) => (
                <li key={`${relation.world_id}:${relation.id}`}>
                  <article data-relation-result={relation.id}>
                    <strong>{relation.type}</strong>
                    <span>{relation.id}</span>
                    <small>
                      {copy.matched}: {relation.matched_canon_ids.join(", ")}
                    </small>
                    <small>
                      {copy.memberships}:{" "}
                      {relation.canon_memberships.join(", ")}
                    </small>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
          {activeTab === "diagnostics" ? (
            <ul className={styles.list}>
              {result.diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}:${index}`}>
                  <article>
                    <strong>{diagnostic.code}</strong>
                    <span>{diagnostic.message}</span>
                    <small>{diagnostic.severity}</small>
                  </article>
                </li>
              ))}
              {result.diagnostics.length === 0 ? <li>0 diagnostics</li> : null}
            </ul>
          ) : null}
        </div>
      </section>

      <div className={styles.controls} aria-label="Viewport controls">
        <button
          aria-label="확대"
          onClick={() =>
            setView((current) => ({
              ...current,
              scale: Math.min(2.4, current.scale * 1.2)
            }))
          }
          type="button"
        >
          +
        </button>
        <button
          aria-label="축소"
          onClick={() =>
            setView((current) => ({
              ...current,
              scale: Math.max(0.4, current.scale / 1.2)
            }))
          }
          type="button"
        >
          −
        </button>
        <button
          aria-label="맞춤"
          onClick={() => setView({ x: 80, y: 170, scale: 1 })}
          type="button"
        >
          ⌂
        </button>
      </div>

      {selected ? (
        <aside
          aria-label="Selected graph entity inspector"
          className={styles.sheet}
          data-testid="native-graph-inspector"
          role="dialog"
        >
          <p>
            {selected.event_kind === "composite" ? "Composite Event" : "Event"}{" "}
            · persisted
          </p>
          <button
            aria-label="Close selected graph entity inspector"
            onClick={() => setSelectedKey(null)}
            type="button"
          >
            ×
          </button>
          <h2>{selected.title}</h2>
          <p>{selected.summary ?? "No summary"}</p>
          <dl>
            <div>
              <dt>World · Revision</dt>
              <dd>
                {selected.world_id} · {selected.served_revision}
              </dd>
            </div>
            <div>
              <dt>{copy.matched}</dt>
              <dd>{selected.matched_canon_ids.join(", ")}</dd>
            </div>
            <div>
              <dt>{copy.memberships}</dt>
              <dd>{selected.canon_memberships.join(", ")}</dd>
            </div>
            <div>
              <dt>Attributes</dt>
              <dd>
                <code>{JSON.stringify(selected.attributes)}</code>
              </dd>
            </div>
          </dl>
          <a href={`/worlds/${selected.world_id}/events/${selected.id}`}>
            {copy.detail}
          </a>
        </aside>
      ) : null}

      {status !== "ready" ? (
        <p className={styles.status} role="status">
          {status === "loading" ? copy.loading : copy.unavailable}
        </p>
      ) : null}
      <details className={styles.fallback}>
        <summary>{copy.fallback}</summary>
        <ol>
          {result.events.map((event) => (
            <li key={eventKey(event)}>
              {event.title} — {event.id} — Canon{" "}
              {event.canon_memberships.join(", ")}
            </li>
          ))}
          {result.relations.map((relation) => (
            <li key={`${relation.world_id}:${relation.id}`}>
              {relation.type} — {relation.id} — Canon{" "}
              {relation.canon_memberships.join(", ")}
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}
