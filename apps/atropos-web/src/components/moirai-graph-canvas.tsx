"use client";

import { Cross2Icon, MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";

import type {
  CanonicalEventReference,
  MoiraiGraphEntityReference
} from "@moirai/contracts";

import type { AppLocale } from "../urdr-port/src/locale";
import { useGraphQuery } from "./graph-query-context";
import {
  graphEventKey,
  graphTimeReferenceKey,
  layoutMoiraiGraph,
  type MoiraiLayoutNode
} from "../lib/moirai-graph-layout";
import styles from "./moirai-graph-canvas.module.css";

type View = { readonly x: number; readonly y: number; readonly scale: number };
type Pointer = { readonly x: number; readonly y: number };

const INITIAL_VIEW: View = { x: 22, y: 26, scale: 0.82 };
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.4;

const COPY = {
  ko: {
    aria: "Moirai 그래프 뷰포트",
    zoomIn: "확대",
    zoomOut: "축소",
    reset: "화면 맞춤",
    exact: "정확한 시간",
    bounded: "시간 범위",
    relative_only: "상대 순서만",
    mixed: "혼합 시간 근거",
    unplaced: "미배치",
    inspector: "그래프 상세",
    close: "상세 닫기",
    event: "World Event",
    time: "Virtual Time Event",
    memberships: "Canon memberships",
    matched: "Matched Canon context",
    derived: "Derived context",
    evidence: "Evidence",
    narratives: "Narratives",
    diagnostics: "Diagnostics",
    canonical: "World Event 상세 열기",
    virtual: "persisted: false",
    complete: "complete"
  },
  en: {
    aria: "Moirai graph viewport",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Fit view",
    exact: "Exact time",
    bounded: "Bounded time",
    relative_only: "Relative order only",
    mixed: "Mixed temporal evidence",
    unplaced: "Unplaced",
    inspector: "Graph detail",
    close: "Close detail",
    event: "World Event",
    time: "Virtual Time Event",
    memberships: "Canon memberships",
    matched: "Matched Canon context",
    derived: "Derived context",
    evidence: "Evidence",
    narratives: "Narratives",
    diagnostics: "Diagnostics",
    canonical: "Open World Event detail",
    virtual: "persisted: false",
    complete: "complete"
  }
} as const;

function referenceKey(worldId: string, reference: CanonicalEventReference) {
  return reference.kind === "event"
    ? graphEventKey(worldId, reference.event_id)
    : graphTimeReferenceKey(worldId, reference);
}

function focusKey(focus: MoiraiGraphEntityReference | null): string | null {
  if (!focus || focus.kind !== "event") return null;
  return referenceKey(focus.world_id, focus.event_ref);
}

function relationFamily(type: string) {
  if (["precedes", "not_after", "coincides"].includes(type)) return "temporal";
  if (["contains", "starts", "ends"].includes(type)) return "structure";
  if (type.startsWith("identity_")) return "identity";
  if (["causes", "enables", "prevents", "influences"].includes(type))
    return "causal";
  return "association";
}

function eventFocus(
  node: MoiraiLayoutNode
): Extract<MoiraiGraphEntityReference, { kind: "event" }> | null {
  if (node.event) {
    const canonId =
      node.event.matched_canon_ids[0] ?? node.event.canon_memberships[0];
    if (!canonId) return null;
    return {
      kind: "event",
      world_id: node.worldId,
      canon_id: canonId,
      served_revision: node.event.served_revision,
      event_ref: { kind: "event", event_id: node.event.id }
    };
  }
  if (node.timeEvent)
    return {
      kind: "event",
      world_id: node.worldId,
      canon_id: node.timeEvent.canon_id,
      served_revision: node.timeEvent.served_revision,
      event_ref: node.timeEvent.reference
    };
  return null;
}

export function MoiraiGraphCanvas({ locale }: Readonly<{ locale: AppLocale }>) {
  const copy = COPY[locale];
  const { result, state, setSourceState } = useGraphQuery();
  const visibleResult = useMemo(
    () => ({
      ...result,
      events: result.events.filter(
        (event) =>
          (state.query.diagnostics_filter.include_unplaced ||
            event.temporal_position.kind !== "unplaced") &&
          state.query.entity_filter.event_kinds.includes(event.event_kind) &&
          (state.query.entity_filter.roles.length === 0 ||
            state.query.entity_filter.roles.some((role) =>
              event.roles.includes(role)
            ))
      ),
      virtual_time_events: state.query.entity_filter.include_virtual_time_events
        ? result.virtual_time_events
        : [],
      relations: result.relations.filter(
        (relation) =>
          state.query.relation_filter.types.includes(relation.type) &&
          state.query.relation_filter.directions.includes(relation.direction)
      ),
      subjects:
        state.query.entity_filter.subject_handle_ids.length === 0
          ? result.subjects.filter(
              (subject) =>
                state.query.diagnostics_filter.include_unresolved ||
                subject.completeness !== "unresolved"
            )
          : result.subjects.filter(
              (subject) =>
                (state.query.diagnostics_filter.include_unresolved ||
                  subject.completeness !== "unresolved") &&
                state.query.entity_filter.subject_handle_ids.includes(
                  subject.subject_handle_id
                )
            ),
      composites: result.composites.filter(
        (composite) =>
          state.query.diagnostics_filter.include_unresolved ||
          composite.completeness !== "unresolved"
      ),
      states: state.query.entity_filter.include_states
        ? result.states.filter(
            (item) =>
              state.query.diagnostics_filter.include_unresolved ||
              (item.status !== "unresolved" &&
                item.completeness !== "unresolved")
          )
        : [],
      narratives: state.query.entity_filter.include_narratives
        ? result.narratives
        : [],
      diagnostics: result.diagnostics.filter(
        (item) =>
          state.query.diagnostics_filter.include_codes.length === 0 ||
          state.query.diagnostics_filter.include_codes.includes(item.code)
      )
    }),
    [result, state.query]
  );
  const layout = useMemo(
    () => layoutMoiraiGraph(visibleResult),
    [visibleResult]
  );
  const [view, setView] = useState(INITIAL_VIEW);
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    focusKey(state.focus)
  );
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<{
    distance: number;
    center: Pointer;
    view: View;
  } | null>(null);

  useEffect(() => setSelectedKey(focusKey(state.focus)), [state.focus]);

  const nodeByKey = useMemo(
    () => new Map(layout.nodes.map((node) => [node.key, node])),
    [layout.nodes]
  );
  const selected = selectedKey ? (nodeByKey.get(selectedKey) ?? null) : null;

  useEffect(() => {
    if (!selected?.event || view.scale < 1.3) return;
    const focus = eventFocus(selected);
    if (!focus) return;
    const depth = view.scale >= 1.9 ? 2 : 1;
    if (
      state.query.scope.kind === "neighborhood" &&
      state.query.scope.depth === depth &&
      state.query.budget.detail_level === (depth === 2 ? "full" : "standard")
    )
      return;
    setSourceState((current) => ({
      ...current,
      focus,
      query: {
        ...current.query,
        scope: {
          kind: "neighborhood",
          event: {
            world_id: focus.world_id,
            canon_id: focus.canon_id,
            served_revision: focus.served_revision,
            event_ref: focus.event_ref
          },
          depth
        },
        budget: {
          ...current.query.budget,
          detail_level: depth === 2 ? "full" : "standard"
        }
      }
    }));
  }, [selected, setSourceState, state.query, view.scale]);
  const selectedSubjects = selected?.event
    ? result.subjects.filter(
        (subject) =>
          subject.world_id === selected.worldId &&
          subject.member_event_ids.includes(selected.event!.id)
      )
    : [];
  const selectedComposites = selected?.event
    ? result.composites.filter(
        (composite) =>
          composite.world_id === selected.worldId &&
          (composite.event_id === selected.event!.id ||
            composite.descendant_event_ids.includes(selected.event!.id))
      )
    : [];
  const selectedStates = selected?.event
    ? result.states.filter(
        (item) =>
          item.world_id === selected.worldId &&
          item.composite_event_id === selected.event!.id
      )
    : [];
  const selectedNarratives = selected?.event
    ? result.narratives.filter(
        (item) =>
          item.world_id === selected.worldId &&
          selected.event!.narrative_ids.includes(item.id)
      )
    : [];
  const evidenceIds =
    selected?.event?.evidence_ids ?? selected?.timeEvent?.evidence_ids ?? [];
  const selectedEvidence = result.evidence.filter((item) =>
    evidenceIds.includes(item.id)
  );
  const selectedDiagnostics = selected
    ? result.diagnostics.filter((item) =>
        item.affected_ids.includes(selected.entityId)
      )
    : [];

  const selectNode = useCallback(
    (node: MoiraiLayoutNode) => {
      const focus = eventFocus(node);
      setSelectedKey(node.key);
      if (focus)
        setSourceState((current) => ({
          ...current,
          focus,
          query: {
            ...current.query,
            scope: { kind: "selection", references: [focus] }
          }
        }));
    },
    [setSourceState]
  );
  const closeInspector = useCallback(() => {
    setSelectedKey(null);
    setSourceState((current) => ({
      ...current,
      focus: null,
      query:
        current.query.scope.kind === "selection"
          ? { ...current.query, scope: { kind: "overview" } }
          : current.query
    }));
  }, [setSourceState]);

  const zoom = useCallback((factor: number) => {
    setView((current) => ({
      ...current,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor))
    }));
  }, []);
  const pointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = {
          distance: Math.hypot(b!.x - a!.x, b!.y - a!.y),
          center: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
          view
        };
      }
    },
    [view]
  );
  const pointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });
      if (pointers.current.size === 1) {
        setView((current) => ({
          ...current,
          x: current.x + event.clientX - previous.x,
          y: current.y + event.clientY - previous.y
        }));
        return;
      }
      const [a, b] = [...pointers.current.values()];
      const start = gesture.current;
      if (!start) return;
      const distance = Math.hypot(b!.x - a!.x, b!.y - a!.y);
      const center = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      setView({
        x: start.view.x + center.x - start.center.x,
        y: start.view.y + center.y - start.center.y,
        scale: Math.min(
          MAX_SCALE,
          Math.max(
            MIN_SCALE,
            start.view.scale * (distance / Math.max(1, start.distance))
          )
        )
      });
    },
    []
  );
  const pointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }, []);
  const wheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      zoom(event.deltaY > 0 ? 0.9 : 1.1);
    },
    [zoom]
  );

  return (
    <div className={styles.frame}>
      <div
        className={styles.viewport}
        data-testid="moirai-native-graph-stage"
        onPointerCancel={pointerEnd}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onWheel={wheel}
      >
        <svg
          aria-label={copy.aria}
          className={styles.canvas}
          role="img"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <defs>
            <marker
              id="moirai-arrow"
              markerHeight="7"
              markerWidth="7"
              orient="auto"
              refX="6"
              refY="3.5"
            >
              <path d="M0 0 L7 3.5 L0 7 Z" />
            </marker>
            <pattern
              height="28"
              id="moirai-grid"
              patternUnits="userSpaceOnUse"
              width="28"
            >
              <circle cx="1" cy="1" r="0.7" />
            </pattern>
          </defs>
          <rect className={styles.backdrop} height="100%" width="100%" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {layout.lanes.map((lane) => (
              <g className={styles.lane} key={lane.key}>
                <line
                  x1={lane.x + 88}
                  x2={lane.x + 88}
                  y1={70}
                  y2={layout.height - 90}
                />
                <text x={lane.x + 88} y={48}>
                  {lane.label}
                </text>
              </g>
            ))}
            {(
              [
                "exact",
                "bounded",
                "relative_only",
                "mixed",
                "unplaced"
              ] as const
            ).map((kind, index) => (
              <g className={styles.band} key={kind}>
                <line
                  x1={70}
                  x2={layout.width - 70}
                  y1={100 + index * 320}
                  y2={100 + index * 320}
                />
                <text x={76} y={90 + index * 320}>
                  {copy[kind]}
                </text>
              </g>
            ))}
            {layout.regions.map((region) => (
              <g
                className={styles.region}
                data-completeness={region.completeness}
                key={region.key}
              >
                <rect
                  height={region.height}
                  rx="34"
                  width={region.width}
                  x={region.x}
                  y={region.y}
                />
                <text x={region.x + 18} y={region.y + 23}>
                  {region.label}
                </text>
              </g>
            ))}
            {layout.edges.map((edge) => {
              const source = nodeByKey.get(edge.sourceKey)!;
              const target = nodeByKey.get(edge.targetKey)!;
              return (
                <g
                  className={styles.edge}
                  data-relation-id={edge.relation.id}
                  data-relation-type={edge.relation.type}
                  data-family={relationFamily(edge.relation.type)}
                  key={edge.key}
                >
                  <path
                    d={`M ${source.x + source.width / 2} ${source.y + source.height} C ${source.x + source.width / 2} ${(source.y + target.y) / 2} ${target.x + target.width / 2} ${(source.y + target.y) / 2} ${target.x + target.width / 2} ${target.y}`}
                    markerEnd={
                      edge.relation.direction === "directed"
                        ? "url(#moirai-arrow)"
                        : undefined
                    }
                  />
                  <text
                    x={(source.x + target.x) / 2 + 70}
                    y={(source.y + target.y) / 2}
                  >
                    {edge.relation.type}
                  </text>
                </g>
              );
            })}
            {layout.nodes.map((node) => {
              const active = node.key === selectedKey;
              return (
                <g
                  aria-label={`${node.title}, ${node.detail}`}
                  className={styles.node}
                  data-active={active ? "true" : "false"}
                  data-event-id={node.event?.id}
                  data-canon-memberships={node.event?.canon_memberships.join(
                    ","
                  )}
                  data-node-kind={node.kind}
                  data-placement-kind={node.placementKind}
                  key={node.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectNode(node);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      selectNode(node);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${node.x} ${node.y})`}
                >
                  {node.kind === "time_event" ? (
                    <path
                      d={`M ${node.width / 2} 0 L ${node.width} ${node.height / 2} L ${node.width / 2} ${node.height} L 0 ${node.height / 2} Z`}
                    />
                  ) : (
                    <rect height={node.height} rx="22" width={node.width} />
                  )}
                  <text
                    className={styles.nodeTitle}
                    x={node.width / 2}
                    y={node.height / 2 - 5}
                  >
                    {node.title}
                  </text>
                  <text
                    className={styles.nodeDetail}
                    x={node.width / 2}
                    y={node.height / 2 + 15}
                  >
                    {node.detail}
                  </text>
                  {node.event && node.event.canon_memberships.length > 1 ? (
                    <text
                      className={styles.canonBadge}
                      x={node.width - 12}
                      y={13}
                    >
                      {node.event.canon_memberships.length}C
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        <div className={styles.controls}>
          <button
            aria-label={copy.zoomIn}
            onClick={() => zoom(1.18)}
            type="button"
          >
            <PlusIcon />
          </button>
          <button
            aria-label={copy.zoomOut}
            onClick={() => zoom(0.84)}
            type="button"
          >
            <MinusIcon />
          </button>
          <button
            aria-label={copy.reset}
            onClick={() => setView(INITIAL_VIEW)}
            type="button"
          >
            1:1
          </button>
        </div>
        <div className={styles.status} role="status">
          <span>{result.completeness}</span>
          <span>{result.budget.detail_level}</span>
          <span>
            {result.revision_vector
              .map(
                (item) => `${item.world_id.slice(0, 8)}@${item.served_revision}`
              )
              .join(" · ")}
          </span>
          <span data-testid="graph-source-legend">
            {result.query.sources
              .map(
                (source) =>
                  `World ${source.world_id.slice(0, 8)} · Canons ${source.canon_ids.map((id) => id.slice(0, 8)).join(", ")}`
              )
              .join(" | ")}
          </span>
          <span>
            {layout.nodes.length}/{Math.min(result.budget.max_entities, 2_500)}{" "}
            nodes
          </span>
          {layout.diagnostics.slice(0, 3).map((item) => (
            <span className={styles.warning} key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
      {selected ? (
        <aside
          aria-label={copy.inspector}
          className={styles.inspector}
          data-testid="graph-inspector-sheet"
        >
          <header>
            <div>
              <p>{selected.kind === "event" ? copy.event : copy.time}</p>
              <h2>{selected.title}</h2>
              <small>
                {selected.worldId} · Revision{" "}
                {selected.event?.served_revision ??
                  selected.timeEvent?.served_revision}
              </small>
            </div>
            <button
              aria-label={copy.close}
              onClick={closeInspector}
              type="button"
            >
              <Cross2Icon />
            </button>
          </header>
          <div className={styles.inspectorBody}>
            <section>
              <h3>Temporal position</h3>
              <p>{selected.detail}</p>
              {selected.timeEvent ? <code>{copy.virtual}</code> : null}
            </section>
            {selected.event ? (
              <>
                <section>
                  <h3>{copy.memberships}</h3>
                  <p>{selected.event.canon_memberships.join(" · ")}</p>
                  <h3>{copy.matched}</h3>
                  <p>{selected.event.matched_canon_ids.join(" · ")}</p>
                </section>
                <section>
                  <h3>{copy.derived}</h3>
                  <p>
                    Subjects {selectedSubjects.length} · Composites{" "}
                    {selectedComposites.length} · States {selectedStates.length}
                  </p>
                  {selectedSubjects.map((subject) => (
                    <p key={subject.subject_handle_id}>
                      Subject {subject.label} · {subject.completeness} ·
                      identity {subject.identity_relation_ids.length} · lineage{" "}
                      {subject.lineage_relation_ids.length}
                    </p>
                  ))}
                  {selectedComposites.map((item) => (
                    <p key={`${item.canon_id}:${item.event_id}`}>
                      Composite {item.completeness} · boundary{" "}
                      {item.boundary.start_event_id ?? "?"} →{" "}
                      {item.boundary.end_event_id ?? "?"}
                    </p>
                  ))}
                  {selectedStates.map((item) => (
                    <p key={`${item.canon_id}:${item.state_family}`}>
                      State {item.state_family} · {item.status} ·{" "}
                      {item.completeness}
                    </p>
                  ))}
                </section>
                <section>
                  <h3>{copy.narratives}</h3>
                  {selectedNarratives.length ? (
                    selectedNarratives.map((item) => (
                      <article key={item.id}>
                        <strong>{item.title ?? item.narrative_kind}</strong>
                        <p>{item.body}</p>
                        {item.public_references.map((reference) => (
                          <a
                            href={reference.url}
                            key={reference.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {reference.label}
                          </a>
                        ))}
                      </article>
                    ))
                  ) : (
                    <p>0</p>
                  )}
                </section>
                <a
                  href={`/worlds/${selected.worldId}/events/${selected.event.id}`}
                >
                  {copy.canonical} →
                </a>
              </>
            ) : null}
            <section>
              <h3>{copy.evidence}</h3>
              {selectedEvidence.length ? (
                selectedEvidence.map((item) => (
                  <p key={item.id}>
                    {item.kind} · {item.algorithm_version ?? copy.complete} ·{" "}
                    {item.id}
                  </p>
                ))
              ) : (
                <p>{evidenceIds.join(" · ") || "0"}</p>
              )}
            </section>
            <section>
              <h3>{copy.diagnostics}</h3>
              {selectedDiagnostics.length ? (
                selectedDiagnostics.map((item) => (
                  <p key={`${item.code}:${item.message}`}>
                    {item.code} · {item.message}
                  </p>
                ))
              ) : (
                <p>{copy.complete}</p>
              )}
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
