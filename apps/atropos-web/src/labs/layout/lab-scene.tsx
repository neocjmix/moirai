"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { LayoutOutput } from "@moirai/graph-presentation/layout-engine";
import {
  evaluateRepresentationScene,
  type RepresentationConfig,
  type RepresentationHistory
} from "./representation";
import { layoutGeometry, project, type LabGeometry } from "./geometry";
import type { LabCamera } from "./preset";
import type { LabSnapshot } from "./types";
import { labDisplayTitle, labRelationLabel } from "./copy";

const HEIGHT = 430;
export function LabScene({
  name,
  snapshot,
  output,
  camera,
  width,
  active,
  includeUncollected,
  config,
  initialHistory,
  historyEpoch,
  onHistory,
  onCamera,
  onSelect,
  reverseWheel
}: {
  name: string;
  snapshot: LabSnapshot;
  output: LayoutOutput;
  camera: LabCamera;
  width: number;
  active: readonly string[];
  includeUncollected: boolean;
  config: RepresentationConfig;
  initialHistory: RepresentationHistory;
  historyEpoch: number;
  onHistory: (history: RepresentationHistory) => void;
  onCamera: (camera: LabCamera) => void;
  onSelect: (id: string) => void;
  reverseWheel: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    // React delegates wheel listeners as passive. Own the browser default here,
    // scoped to this map, so zoom cannot also scroll or pinch-zoom the page.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = Math.exp(
        Math.sign(event.deltaY) * (reverseWheel ? -0.12 : 0.12)
      );
      onCamera({
        ...camera,
        spanX: camera.spanX * (event.shiftKey ? 1 : factor),
        spanY: camera.spanY * (event.altKey ? 1 : factor)
      });
    };
    // touch-action on the HTML viewport owns touch gestures. This scoped
    // non-passive fallback also blocks Safari scroll chaining for map touches.
    const touchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchmove", touchMove);
    };
  }, [camera, onCamera, reverseWheel]);
  const history = useRef(initialHistory);
  const epoch = useRef(historyEpoch);
  if (epoch.current !== historyEpoch) {
    history.current = initialHistory;
    epoch.current = historyEpoch;
  }
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
    eventId: string | null;
  } | null>(null);
  const geometry = useMemo(
    () => layoutGeometry(snapshot, output),
    [snapshot, output]
  );
  const byId = useMemo(
    () => new Map(geometry.map((item) => [item.id, item])),
    [geometry]
  );
  const xy = (point: { x: number; y: number }) =>
    project(point, camera, width, HEIGHT);
  const screenBounds = (item: LabGeometry) => {
    // The region layout box includes layout padding. Representation ownership
    // follows the complete authored hull support, including offscreen children.
    if (item.kind === "region" && item.polygon.length) {
      return item.polygon.map(xy).reduce(
        (bounds, point) => ({
          minX: Math.min(bounds.minX, point.x),
          maxX: Math.max(bounds.maxX, point.x),
          minY: Math.min(bounds.minY, point.y),
          maxY: Math.max(bounds.maxY, point.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
    }
    const min = xy({ x: item.bounds.minX, y: item.bounds.minY });
    const max = xy({ x: item.bounds.maxX, y: item.bounds.maxY });
    return { minX: min.x, maxX: max.x, minY: min.y, maxY: max.y };
  };
  const projected = new Map(
    geometry.map((item) => {
      const bounds = screenBounds(item);
      return [
        item.id,
        {
          bounds,
          center: {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2
          }
        }
      ] as const;
    })
  );
  const scene = evaluateRepresentationScene(
    {
      nodes: snapshot.events.flatMap((event) => {
        const item = byId.get(event.id);
        if (!item) return [];
        const bounds = projected.get(item.id)!.bounds;
        const viewportCoverage =
          (Math.max(
            0,
            Math.min(width, bounds.maxX) - Math.max(0, bounds.minX)
          ) *
            Math.max(
              0,
              Math.min(HEIGHT, bounds.maxY) - Math.max(0, bounds.minY)
            )) /
          (width * HEIGHT);
        return [
          {
            id: event.id,
            kind: event.childIds.length
              ? ("composite" as const)
              : ("event" as const),
            bounds,
            childIds: event.childIds,
            viewportCoverage,
            inViewport:
              bounds.maxX >= 0 &&
              bounds.minX <= width &&
              bounds.maxY >= 0 &&
              bounds.minY <= HEIGHT,
            visible: event.collectionIds.length
              ? event.collectionIds.some((id) => active.includes(id))
              : includeUncollected
          }
        ];
      }),
      relations: snapshot.relations
        .filter((r) => r.type !== "contains")
        .map((r) => ({ id: r.id, endpointIds: [r.sourceId, r.targetId] }))
    },
    config,
    history.current
  );
  useLayoutEffect(() => {
    history.current = scene.state;
    onHistory(scene.state);
  });
  const states = new Map(scene.nodes.map((item) => [item.id, item]));
  const relationStates = new Map(
    scene.relations.map((item) => [item.id, item.opacity])
  );
  const labels: {
    id: string;
    title: string;
    x: number;
    y: number;
    opacity: number;
  }[] = [];
  const occupied: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  for (const event of snapshot.events) {
    const title = labDisplayTitle(snapshot.worldId, event.id, event.title);
    const item = projected.get(event.id),
      state = states.get(event.id);
    const point = item?.center ?? { x: 0, y: 0 };
    const box = {
      left: point.x + 8,
      top: point.y - 18,
      right: point.x + 8 + Math.min(200, [...title].length * 10),
      bottom: point.y - 3
    };
    const admitted =
      item &&
      state &&
      state.labelOpacity >= 0.01 &&
      box.left >= 0 &&
      box.top >= 0 &&
      box.right <= width &&
      box.bottom <= HEIGHT &&
      !occupied.some(
        (b) =>
          box.left < b.right &&
          box.right > b.left &&
          box.top < b.bottom &&
          box.bottom > b.top
      );
    if (admitted) occupied.push(box);
    // Stable DOM ownership lets CSS reverse or finish the opacity transition
    // when density, collisions, or visibility suppress an existing label.
    labels.push({
      id: event.id,
      title,
      x: box.left,
      y: box.bottom,
      opacity: admitted ? state.labelOpacity : 0
    });
  }
  const path = (item: LabGeometry) => {
    const points = item.polygon.length >= 3 ? item.polygon.map(xy) : [];
    if (points.length)
      return (
        points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + " Z"
      );
    const b = screenBounds(item),
      pad = 7;
    return `M${b.minX - pad},${b.minY - pad} L${b.maxX + pad},${b.minY - pad} L${b.maxX + pad},${b.maxY + pad} L${b.minX - pad},${b.maxY + pad} Z`;
  };
  const counts = scene.nodes.reduce(
    (all, item) => ({ ...all, [item.state]: (all[item.state] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  return (
    <section className="lab-pane" aria-label={`${name} 비교`}>
      <div className="lab-pane-heading">
        <strong>{name}</strong>
        <span>
          {Object.entries(counts)
            .map(
              ([key, value]) =>
                `${({ hull: "영역", "ordinary-point": "보통 점", "small-point": "작은 점", hidden: "숨김" } as Record<string, string>)[key] ?? key} ${value}`
            )
            .join(" · ")}
        </span>
      </div>
      <div className="lab-map-viewport">
        <svg
          ref={svg}
          role="img"
          aria-label={`${name} 지도`}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          style={{
            touchAction: "none",
            display: "block",
            background: "#fbfaf5"
          }}
          onPointerDown={(e) => {
            if (drag.current) return;
            const eventId =
              (e.target as Element)
                .closest("[data-event-id]")
                ?.getAttribute("data-event-id") ?? null;
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              startX: e.clientX,
              startY: e.clientY,
              moved: false,
              pointerId: e.pointerId,
              eventId
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const old = drag.current;
            if (!old || old.pointerId !== e.pointerId) return;
            const dx = e.clientX - old.x,
              dy = e.clientY - old.y;
            drag.current = {
              ...old,
              x: e.clientX,
              y: e.clientY,
              moved:
                old.moved ||
                Math.hypot(e.clientX - old.startX, e.clientY - old.startY) > 2
            };
            const inverse = e.currentTarget.getScreenCTM()?.inverse();
            if (!inverse) return;
            const origin = new DOMPoint(0, 0).matrixTransform(inverse);
            const delta = new DOMPoint(dx, dy).matrixTransform(inverse);
            onCamera({
              ...camera,
              x: camera.x - ((delta.x - origin.x) * camera.spanX) / width,
              y: camera.y - ((delta.y - origin.y) * camera.spanY) / HEIGHT
            });
          }}
          onPointerUp={(e) => {
            const current = drag.current;
            if (!current || current.pointerId !== e.pointerId) return;
            if (!current.moved && current.eventId) onSelect(current.eventId);
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            if (drag.current?.pointerId === e.pointerId) drag.current = null;
          }}
          onLostPointerCapture={(e) => {
            if (drag.current?.pointerId === e.pointerId) drag.current = null;
          }}
        >
          <g pointerEvents="none">
            {Array.from({ length: 7 }, (_, i) => {
              const y = 25 + (i * (HEIGHT - 50)) / 6;
              // Shared layout builds its chronology board with startYear=endYear=0;
              // its year coordinate is therefore World Y / CHRONOLOGY_YEAR_SPACING.
              const scalar =
                (camera.y + (y / HEIGHT - 0.5) * camera.spanY) / 140 +
                (snapshot.input.board.axis.startYear +
                  snapshot.input.board.axis.endYear) /
                  2;
              return (
                <g key={i}>
                  <line
                    x1={0}
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke="#d8ddd4"
                    strokeDasharray="3 5"
                  />
                  <text x={6} y={y - 4} fill="#68786c" fontSize={10}>
                    {scalar.toFixed(
                      Math.max(
                        1,
                        Math.min(
                          8,
                          Math.ceil(-Math.log10(camera.spanY / 140 / 6)) + 1
                        )
                      )
                    )}
                  </text>
                </g>
              );
            })}
          </g>
          {snapshot.relations
            .filter((r) => r.type !== "contains")
            .map((relation) => {
              const from = projected.get(relation.sourceId),
                to = projected.get(relation.targetId);
              if (!from || !to) return null;
              const a = from.center,
                b = to.center;
              return (
                <line
                  key={relation.id}
                  data-relation-id={relation.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  pointerEvents="none"
                  opacity={relationStates.get(relation.id) ?? 0}
                  stroke="#64778a"
                  strokeWidth={1.2}
                  style={{ transition: `opacity ${config.fadeDurationMs}ms` }}
                >
                  <title>{labRelationLabel(relation.type)}</title>
                </line>
              );
            })}
          {[...geometry]
            .sort(
              (a, b) =>
                Number(b.kind === "region") - Number(a.kind === "region")
            )
            .map((item) => {
              const state = states.get(item.id);
              if (!state) return null;
              const point = projected.get(item.id)!.center;
              const pointOpacity =
                state.ordinaryPointOpacity + state.smallPointOpacity;
              return (
                <g
                  key={item.id}
                  data-event-id={item.id}
                  data-representation={state.state}
                  data-density-rank={state.densityRank ?? "offscreen"}
                  pointerEvents={state.opacity > 0.01 ? undefined : "none"}
                  aria-hidden={state.opacity <= 0.01 || undefined}
                >
                  {item.kind === "region" && (
                    <path
                      d={path(item)}
                      fill="#c59a48"
                      fillOpacity={0.12}
                      stroke="#aa8243"
                      strokeWidth={1.8}
                      opacity={state.hullOpacity}
                      pointerEvents={
                        state.hullOpacity > 0.01 ? "visiblePainted" : "none"
                      }
                      style={{
                        transition: `opacity ${config.fadeDurationMs}ms`
                      }}
                    />
                  )}
                  {item.kind === "segment" && (
                    <line
                      x1={xy(item.ends[0]!).x}
                      y1={xy(item.ends[0]!).y}
                      x2={xy(item.ends[1]!).x}
                      y2={xy(item.ends[1]!).y}
                      stroke="#49677e"
                      opacity={state.opacity}
                      pointerEvents={
                        state.opacity > 0.01 ? "visiblePainted" : "none"
                      }
                    />
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={6 * state.radiusScale}
                    fill={item.kind === "region" ? "#aa8243" : "#324b5c"}
                    opacity={pointOpacity}
                    pointerEvents="none"
                    style={{
                      transition: `opacity ${config.fadeDurationMs}ms, r ${config.fadeDurationMs}ms`
                    }}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={11}
                    fill="transparent"
                    pointerEvents={pointOpacity > 0.01 ? "all" : "none"}
                  />
                </g>
              );
            })}
          {labels.map((label) => (
            <text
              key={label.id}
              data-event-id={label.id}
              x={label.x}
              y={label.y}
              fill="#263d36"
              fontSize={12}
              opacity={label.opacity}
              aria-hidden={label.opacity === 0 || undefined}
              pointerEvents={label.opacity > 0.01 ? "visiblePainted" : "none"}
              style={{ transition: `opacity ${config.labelFadeDurationMs}ms` }}
            >
              {label.title.length > 22
                ? `${label.title.slice(0, 22)}…`
                : label.title}
            </text>
          ))}
        </svg>
      </div>
      <small>
        세로축은 시간, 가로축은 사건의 배치입니다. 겹치는 이름은 일부 숨깁니다.
        지도 안을 끌면 지도가, 지도 밖을 쓸면 페이지가 움직입니다.
      </small>
    </section>
  );
}
