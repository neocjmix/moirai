"use client";

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { createV5RenderTileClient } from "../lib/v5-render-tile-client";

type Point = { x: number; y: number };
type View = Point & { scaleX: number; scaleY: number };
type Weighted = { primitive: RenderPrimitive; opacity: number };

/** GraphShell owns the camera, input and drawer; this layer only paints prepared
 * immutable geometry. Collection toggles reuse the same revision-pinned tiles. */
export function V5RenderGraphLayer({
  identity,
  view,
  width,
  height,
  collectionIds,
  gestureActive,
  onPointerTarget,
  onKeyboardTarget
}: {
  identity: { worldId: string; revision: number; timeSystemId: string };
  view: View;
  width: number;
  height: number;
  collectionIds: readonly string[];
  gestureActive: boolean;
  onPointerTarget: (
    id: string,
    label: string,
    event: PointerEvent<Element>
  ) => void;
  onKeyboardTarget: (
    id: string,
    label: string,
    event: KeyboardEvent<Element>
  ) => void;
}) {
  const { worldId, revision, timeSystemId } = identity;
  const client = useMemo(
    () => createV5RenderTileClient({ worldId, revision, timeSystemId }),
    [worldId, revision, timeSystemId]
  );
  const [scene, setScene] = useState<Weighted[]>([]);
  const [status, setStatus] = useState("타일을 불러오는 중…");
  const selection = [...collectionIds].sort().join(",");

  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    if (width <= 0 || height <= 0 || view.scaleX <= 0 || view.scaleY <= 0)
      return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        const viewport = {
          minX: (-width / 2 - view.x) / view.scaleX,
          maxX: (width / 2 - view.x) / view.scaleX,
          minY: (-height / 2 - view.y) / view.scaleY,
          maxY: (height / 2 - view.y) / view.scaleY
        };
        void client
          .loadFrame(
            {
              viewport,
              scaleX: view.scaleX,
              scaleY: view.scaleY,
              width,
              height,
              collectionIds: selection ? selection.split(",") : []
            },
            controller.signal
          )
          .then((frame) => {
            if (controller.signal.aborted) return;
            setScene(frame.representations);
            setStatus(`Render 타일 · ${frame.representations.length}개 표현`);
          })
          .catch((cause: unknown) => {
            if (controller.signal.aborted) return;
            setStatus(
              cause instanceof Error &&
                cause.message === "render_revision_changed"
                ? "새 Revision이 발행됐습니다. 화면을 새로고침하세요."
                : "Render 타일을 읽을 수 없습니다. 새로고침하거나 발행 상태를 확인하세요."
            );
          });
      },
      gestureActive ? 100 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    client,
    view.x,
    view.y,
    view.scaleX,
    view.scaleY,
    width,
    height,
    selection,
    gestureActive
  ]);

  const project = (p: Point) => ({
    x: width / 2 + view.x + p.x * view.scaleX,
    y: height / 2 + view.y + p.y * view.scaleY
  });
  const path = (points: readonly Point[], closed: boolean) =>
    points
      .map((point, index) => {
        const p = project(point);
        return `${index ? "L" : "M"}${p.x},${p.y}`;
      })
      .join(" ") + (closed ? " Z" : "");
  const labels = new Set<string>();
  const occupied: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[] = [];
  for (const { primitive, opacity } of scene) {
    if (
      labels.size >= 32 ||
      opacity < 0.5 ||
      primitive.geometry.kind !== "point"
    )
      continue;
    const p = project(primitive.geometry.xy);
    const box = {
      left: p.x + 10,
      right: p.x + 10 + Math.min(220, [...primitive.label].length * 12),
      top: p.y - 22,
      bottom: p.y - 4
    };
    if (
      box.left < 0 ||
      box.top < 0 ||
      box.right > width ||
      box.bottom > height ||
      occupied.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top
      )
    )
      continue;
    occupied.push(box);
    labels.add(primitive.id);
  }
  return (
    <g data-render-publication="tile" data-render-revision={revision}>
      <text
        x={12}
        y={height - 12}
        fontSize={11}
        fill="#535a53"
        role="status"
        pointerEvents="none"
      >
        {status}
      </text>
      {scene.map(({ primitive, opacity }) => {
        const geometry = primitive.geometry;
        if (geometry.kind === "external") return null;
        const eventId =
          primitive.entity.kind === "event" ||
          primitive.entity.kind === "composite"
            ? primitive.entity.id
            : null;
        const color =
          primitive.entity.kind === "relation" ? "#666c64" : "#394d42";
        return (
          <g
            key={primitive.id}
            opacity={opacity}
            data-render-primitive={primitive.id}
          >
            {geometry.kind === "polygon" &&
              geometry.rings.map((ring, index) => (
                <path
                  key={index}
                  d={path(ring, true)}
                  fill="rgba(139,160,135,0.18)"
                  stroke={color}
                  strokeWidth={1.2}
                  onPointerDown={
                    eventId
                      ? (event) =>
                          onPointerTarget(eventId, primitive.label, event)
                      : undefined
                  }
                />
              ))}
            {geometry.kind === "line" &&
              geometry.paths.map((line, index) => (
                <path
                  key={index}
                  d={path(line, false)}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.3}
                  pointerEvents="none"
                />
              ))}
            {geometry.kind === "point" &&
              (() => {
                const p = project(geometry.xy);
                return (
                  <>
                    {eventId && (
                      <rect
                        x={p.x - 22}
                        y={p.y - 22}
                        width={44}
                        height={44}
                        rx={22}
                        fill="transparent"
                        role="button"
                        tabIndex={0}
                        aria-label={primitive.label}
                        data-primary-hit-target={
                          primitive.entity.kind === "event"
                            ? "event"
                            : "composite"
                        }
                        data-event-point-id={
                          primitive.entity.kind === "event"
                            ? eventId
                            : undefined
                        }
                        onPointerDown={(event) =>
                          onPointerTarget(eventId, primitive.label, event)
                        }
                        onKeyDown={(event) =>
                          onKeyboardTarget(eventId, primitive.label, event)
                        }
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={primitive.entity.kind === "cluster" ? 9 : 5}
                      fill={
                        primitive.entity.kind === "cluster" ? "#8c653f" : color
                      }
                      pointerEvents="none"
                    />
                    {labels.has(primitive.id) && (
                      <text
                        x={p.x + 10}
                        y={p.y - 10}
                        fontSize={12}
                        fill="#273a30"
                        pointerEvents="none"
                      >
                        {primitive.label}
                      </text>
                    )}
                  </>
                );
              })()}
          </g>
        );
      })}
    </g>
  );
}
