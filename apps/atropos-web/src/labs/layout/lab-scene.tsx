"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  hullFeatherLayers,
  hullLayerOpacity
} from "../../components/hull-feather";
import { pigmentCssColor } from "../../lib/spectral-pigment";
import {
  createPanInertiaTracker,
  panInertiaFrame
} from "../../lib/pan-inertia";
import { expandCompositePolygon } from "../../urdr-port/src/components/composite-local-padding";
import { compositeColorAssignment } from "../../urdr-port/src/components/graph-shell-composite";
import type { LayoutOutput } from "@moirai/graph-presentation/layout-engine";
import {
  evaluateRepresentationScene,
  advanceRepresentationStages,
  type RepresentationConfig,
  type RepresentationHistory
} from "./representation";
import { layoutGeometry, project, type LabGeometry } from "./geometry";
import type { LabCamera } from "./preset";
import type { LabSnapshot } from "./types";
import { labDisplayTitle, labRelationLabel } from "./copy";
import {
  addLabPointer,
  createLabGesture,
  moveLabPointer,
  removeLabPointer,
  resetLabGesture,
  viewToCamera
} from "./gestures";

export function LabScene({
  name,
  snapshot,
  output,
  camera,
  width,
  height,
  active,
  includeUncollected,
  config,
  initialHistory,
  historyEpoch,
  onHistory,
  onCamera,
  onSelect,
  interactive
}: {
  name: string;
  snapshot: LabSnapshot;
  output: LayoutOutput;
  camera: LabCamera;
  width: number;
  height: number;
  active: readonly string[];
  includeUncollected: boolean;
  config: RepresentationConfig;
  initialHistory: RepresentationHistory;
  historyEpoch: number;
  onHistory: (history: RepresentationHistory) => void;
  onCamera: (camera: LabCamera) => void;
  onSelect: (id: string) => void;
  interactive: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef(createLabGesture(camera, { width, height }));
  const lastPublishedCamera = useRef(camera);
  const previousSize = useRef({ width, height });
  const inertiaTracker = useRef(createPanInertiaTracker());
  const inertiaFrame = useRef<number | null>(null);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  const cancelInertia = useCallback(() => {
    if (inertiaFrame.current !== null)
      cancelAnimationFrame(inertiaFrame.current);
    inertiaFrame.current = null;
    inertiaTracker.current.suppress();
  }, []);
  const tap = useRef<{
    pointerId: number;
    x: number;
    y: number;
    eventId: string | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (
      camera !== lastPublishedCamera.current ||
      width !== previousSize.current.width ||
      height !== previousSize.current.height
    ) {
      cancelInertia();
      gesture.current = resetLabGesture(gesture.current, camera, {
        width,
        height
      });
    }
    lastPublishedCamera.current = camera;
    previousSize.current = { width, height };
    if (!interactive) {
      cancelInertia();
      inertiaTracker.current.cancel();
      tap.current = null;
      for (const id of Object.keys(gesture.current.activePointers).map(
        Number
      )) {
        gesture.current = removeLabPointer(gesture.current, id);
        if (svg.current?.hasPointerCapture(id))
          svg.current.releasePointerCapture(id);
      }
    }
  }, [camera, width, height, interactive, cancelInertia]);
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopForReducedMotion = () => {
      if (reducedMotion.matches) cancelInertia();
    };
    const endContacts = () => {
      cancelInertia();
      inertiaTracker.current.cancel();
      tap.current = null;
      for (const id of Object.keys(gesture.current.activePointers).map(
        Number
      )) {
        gesture.current = removeLabPointer(gesture.current, id);
        if (svg.current?.hasPointerCapture(id))
          svg.current.releasePointerCapture(id);
      }
    };
    const stopForHiddenPage = () => {
      if (document.hidden) endContacts();
    };
    window.addEventListener("pagehide", endContacts);
    document.addEventListener("visibilitychange", stopForHiddenPage);
    reducedMotion.addEventListener("change", stopForReducedMotion);
    return () => {
      cancelInertia();
      window.removeEventListener("pagehide", endContacts);
      document.removeEventListener("visibilitychange", stopForHiddenPage);
      reducedMotion.removeEventListener("change", stopForReducedMotion);
    };
  }, [cancelInertia]);
  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    // Mobile navigation owns map touches. Keep browser page gestures outside
    // the map; do not expose wheel or button zoom as a second navigation path.
    const ownInput = (event: Event) => {
      if (event.type === "wheel") cancelInertia();
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("wheel", ownInput, { passive: false });
    element.addEventListener("touchmove", ownInput, { passive: false });
    return () => {
      element.removeEventListener("wheel", ownInput);
      element.removeEventListener("touchmove", ownInput);
    };
  }, [cancelInertia]);
  const endPointer = (id: number, released = false) => {
    if (!inertiaTracker.current.has(id)) return;
    const velocity = inertiaTracker.current.end(
      id,
      performance.now(),
      released
    );
    if (tap.current?.pointerId === id) tap.current = null;
    gesture.current = removeLabPointer(gesture.current, id);
    if (svg.current?.hasPointerCapture(id))
      svg.current.releasePointerCapture(id);
    if (
      !velocity ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const startView = gesture.current.view;
    const started = performance.now();
    const animate = (now: number) => {
      const frame = panInertiaFrame(velocity, now - started);
      const next = viewToCamera(
        { ...startView, x: startView.x + frame.x, y: startView.y + frame.y },
        { width, height }
      );
      gesture.current = resetLabGesture(gesture.current, next, {
        width,
        height
      });
      lastPublishedCamera.current = next;
      onCameraRef.current(next);
      inertiaFrame.current = frame.done ? null : requestAnimationFrame(animate);
    };
    inertiaFrame.current = requestAnimationFrame(animate);
  };
  const pointerPoint = (x: number, y: number) => {
    const inverse = svg.current?.getScreenCTM()?.inverse();
    return inverse ? new DOMPoint(x, y).matrixTransform(inverse) : null;
  };
  const history = useRef(initialHistory);
  const epoch = useRef(historyEpoch);
  if (epoch.current !== historyEpoch) {
    history.current = initialHistory;
    epoch.current = historyEpoch;
  }
  const geometry = useMemo(
    () => layoutGeometry(snapshot, output),
    [snapshot, output]
  );
  const compositeIds = useMemo(
    () =>
      new Set(
        snapshot.events
          .filter((event) => event.childIds.length > 0)
          .map((event) => event.id)
      ),
    [snapshot]
  );
  const byId = useMemo(
    () => new Map(geometry.map((item) => [item.id, item])),
    [geometry]
  );
  const xy = (point: { x: number; y: number }) =>
    project(point, camera, width, height);
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
  const representationInput = {
    nodes: snapshot.events.flatMap((event) => {
      const item = byId.get(event.id);
      if (!item) return [];
      const bounds = projected.get(item.id)!.bounds;
      const viewportCoverage =
        (Math.max(0, Math.min(width, bounds.maxX) - Math.max(0, bounds.minX)) *
          Math.max(
            0,
            Math.min(height, bounds.maxY) - Math.max(0, bounds.minY)
          )) /
        (width * height);
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
            bounds.minY <= height,
          visible: event.collectionIds.length
            ? event.collectionIds.some((id) => active.includes(id))
            : includeUncollected
        }
      ];
    }),
    relations: snapshot.relations
      .filter((r) => r.type !== "contains")
      .map((r) => ({ id: r.id, endpointIds: [r.sourceId, r.targetId] }))
  };
  const stageHistory = useRef({
    output,
    historyEpoch,
    spans: new Map<string, number>(),
    at: 0,
    stagedHierarchy: config.stagedHierarchy
  });
  const [, setStageClock] = useState(0);
  const stageNow = performance.now();
  const priorStages =
    stageHistory.current.output === output &&
    stageHistory.current.historyEpoch === historyEpoch &&
    stageHistory.current.stagedHierarchy === config.stagedHierarchy
      ? stageHistory.current
      : { spans: new Map<string, number>(), at: stageNow };
  const stages = advanceRepresentationStages(
    representationInput.nodes,
    config,
    priorStages.spans,
    stageNow - priorStages.at,
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const scene = evaluateRepresentationScene(
    { ...representationInput, nodes: stages.nodes },
    config,
    history.current
  );
  useLayoutEffect(() => {
    stageHistory.current = {
      output,
      historyEpoch,
      spans: stages.spans,
      at: stageNow,
      stagedHierarchy: config.stagedHierarchy
    };
    if (!stages.active) return;
    const frame = requestAnimationFrame(() => setStageClock(performance.now()));
    return () => cancelAnimationFrame(frame);
  });
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
      right: point.x + 8 + [...title].length * 12,
      bottom: point.y - 3
    };
    const admitted =
      item &&
      state &&
      state.labelOpacity >= 0.01 &&
      box.right > 0 &&
      box.bottom > 0 &&
      box.left < width &&
      box.top < height &&
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
    const support = item.polygon.length ? item.polygon.map(xy) : [];
    const points = support.length
      ? expandCompositePolygon(
          support,
          (item.paddingProfile ?? []).map((band) => ({
            minY: xy({ x: 0, y: band.minY }).y,
            maxY: xy({ x: 0, y: band.maxY }).y,
            depth: band.depth
          }))
        )
      : [];
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
                `${({ hull: "영역", "borderless-hull": "테두리 없는 영역", "ordinary-point": "보통 점", "small-point": "작은 점", hidden: "숨김" } as Record<string, string>)[key] ?? key} ${value}`
            )
            .join(" · ")}
        </span>
      </div>
      <div className="lab-map-viewport">
        <svg
          ref={svg}
          role="img"
          aria-label={`${name} 지도`}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          style={{
            touchAction: "none",
            height: "100%",
            display: "block",
            background: "#fff"
          }}
          onPointerDown={(event) => {
            if (
              !interactive ||
              (event.pointerType === "mouse" && event.button !== 0)
            )
              return;
            event.preventDefault();
            cancelInertia();
            const point = pointerPoint(event.clientX, event.clientY);
            if (!point) return;
            inertiaTracker.current.start(
              event.pointerId,
              point,
              performance.now(),
              event.pointerType
            );
            const old = gesture.current;
            const next = addLabPointer(old, event.pointerId, point);
            if (next === old) {
              tap.current = null;
              return;
            }
            gesture.current = next;
            if (Object.keys(next.activePointers).length === 1) {
              tap.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                eventId:
                  (event.target as Element)
                    .closest("[data-event-id]")
                    ?.getAttribute("data-event-id") ?? null
              };
            } else tap.current = null;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (
              !interactive ||
              !gesture.current.activePointers[event.pointerId]
            )
              return;
            event.preventDefault();
            if (
              tap.current?.pointerId === event.pointerId &&
              Math.hypot(
                event.clientX - tap.current.x,
                event.clientY - tap.current.y
              ) > 8
            )
              tap.current = null;
            const point = pointerPoint(event.clientX, event.clientY);
            if (!point) return;
            inertiaTracker.current.move(
              event.pointerId,
              point,
              performance.now()
            );
            // Refs retain each move synchronously, including a burst and final
            // release in one React batch. Removing a finger rebases the survivor.
            gesture.current = moveLabPointer(
              gesture.current,
              event.pointerId,
              point
            );
            const next = viewToCamera(gesture.current.view, { width, height });
            lastPublishedCamera.current = next;
            onCamera(next);
          }}
          onPointerUp={(event) => {
            const candidate = tap.current;
            if (
              candidate?.pointerId === event.pointerId &&
              candidate.eventId &&
              Object.keys(gesture.current.activePointers).length === 1 &&
              Math.hypot(
                event.clientX - candidate.x,
                event.clientY - candidate.y
              ) <= 8
            )
              onSelect(candidate.eventId);
            endPointer(event.pointerId, true);
          }}
          onPointerCancel={(event) => endPointer(event.pointerId)}
          onLostPointerCapture={(event) => endPointer(event.pointerId)}
        >
          <g pointerEvents="none">
            {Array.from({ length: 7 }, (_, i) => {
              const y = 25 + (i * (height - 50)) / 6;
              // Shared layout builds its chronology board with startYear=endYear=0;
              // its year coordinate is therefore World Y / CHRONOLOGY_YEAR_SPACING.
              const scalar =
                (camera.y + (y / height - 0.5) * camera.spanY) / 140 +
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
              const compositeColor = compositeIds.has(item.id)
                ? compositeColorAssignment(item.id, snapshot.worldId)
                : null;
              const pointOpacity =
                state.ordinaryPointOpacity + state.smallPointOpacity;
              const hullPath = item.kind === "region" ? path(item) : null;
              const featherLayers = hullPath
                ? hullFeatherLayers(hullPath, 1 - state.hullStrokeOpacity)
                : [];
              return (
                <g
                  key={item.id}
                  data-event-id={item.id}
                  data-representation={state.state}
                  data-density-rank={state.densityRank ?? "offscreen"}
                  pointerEvents={state.opacity > 0.01 ? undefined : "none"}
                  aria-hidden={state.opacity <= 0.01 || undefined}
                >
                  {hullPath && (
                    <g
                      opacity={state.hullOpacity}
                      pointerEvents={
                        state.hullOpacity > 0.01 ? "visiblePainted" : "none"
                      }
                      style={{
                        mixBlendMode: "multiply",
                        transition: `opacity ${config.fadeDurationMs}ms`
                      }}
                    >
                      <path
                        d={hullPath}
                        fill="none"
                        stroke={compositeColor?.label ?? "#1b2330"}
                        strokeWidth={1.15}
                        strokeOpacity={0.15 * state.hullStrokeOpacity}
                        style={{
                          transition: `stroke-opacity ${config.fadeDurationMs}ms`
                        }}
                      />
                      {featherLayers.map((layer, index) => (
                        <path
                          key={index}
                          d={layer.contours.join(" ")}
                          fill={pigmentCssColor(
                            compositeColor?.fill ?? "#1b2330"
                          )}
                          fillOpacity={hullLayerOpacity(
                            0.12 * state.hullFillOpacity,
                            layer.weight
                          )}
                        />
                      ))}
                    </g>
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
                    fill={compositeColor?.fill ?? "#1b2330"}
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
              {label.title}
            </text>
          ))}
        </svg>
      </div>
      <small>세로축은 시간 · 가로축은 배치 · 겹치는 이름은 일부 생략</small>
    </section>
  );
}
