"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { createV5RenderTileClient } from "../lib/v5-render-tile-client";

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
type Weighted = { primitive: RenderPrimitive; opacity: number };
type Camera = { x: number; y: number; spanX: number; spanY: number };

const viewOf = (camera: Camera): Bounds => ({
  minX: camera.x - camera.spanX / 2,
  maxX: camera.x + camera.spanX / 2,
  minY: camera.y - camera.spanY / 2,
  maxY: camera.y + camera.spanY / 2
});

export function RenderPreview({
  worldId,
  revision,
  timeSystemId,
  collections
}: {
  worldId: string;
  revision: number;
  timeSystemId: string;
  collections: { id: string; title: string }[];
}) {
  const client = useMemo(
    () => createV5RenderTileClient({ worldId, revision, timeSystemId }),
    [worldId, revision, timeSystemId]
  );
  const surface = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 360, height: 520 });
  const [camera, setCamera] = useState<Camera | null>(null);
  const [active, setActive] = useState(() =>
    collections.map((item) => item.id)
  );
  const [scene, setScene] = useState<Weighted[]>([]);
  const [level, setLevel] = useState(0);
  const [status, setStatus] = useState("Publication 확인 중…");

  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: node.clientWidth || 360,
        height: node.clientHeight || 520
      })
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void client
      .manifest()
      .then((manifest) => {
        if (cancelled) return;
        if (!manifest.bounds) {
          setStatus("표시할 geometry가 없습니다.");
          return;
        }
        const bounds = manifest.bounds;
        setCamera({
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          spanX: Math.max(bounds.maxX - bounds.minX, 1) * 1.2,
          spanY: Math.max(bounds.maxY - bounds.minY, 1) * 1.2
        });
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            "현재 revision에는 Render Publication이 없습니다. 다음 발행을 기다리고 있습니다."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  useEffect(() => {
    if (!camera) return;
    const controller = new AbortController();
    void client
      .loadFrame(
        {
          viewport: viewOf(camera),
          scaleX: size.width / camera.spanX,
          scaleY: size.height / camera.spanY,
          width: size.width,
          height: size.height,
          collectionIds: active
        },
        controller.signal
      )
      .then((frame) => {
        if (controller.signal.aborted) return;
        setScene(frame.representations);
        setLevel(frame.level);
        setStatus(
          `${frame.representations.length} representations · Level ${frame.level.toFixed(2)}`
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus("타일을 읽을 수 없습니다. 새로고침해 다시 확인하세요.");
      });
    return () => controller.abort();
  }, [client, camera, size, active]);

  const view = camera && viewOf(camera);
  const xy = (point: { x: number; y: number }) => ({
    x: ((point.x - view!.minX) / camera!.spanX) * size.width,
    y: ((point.y - view!.minY) / camera!.spanY) * size.height
  });
  const path = (points: readonly { x: number; y: number }[], closed: boolean) =>
    points
      .map((point, index) => {
        const p = xy(point);
        return `${index ? "L" : "M"}${p.x},${p.y}`;
      })
      .join(" ") + (closed ? " Z" : "");
  const zoom = (factor: number) =>
    setCamera(
      (old) =>
        old && { ...old, spanX: old.spanX * factor, spanY: old.spanY * factor }
    );

  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: 16,
        background: "#f7f7f4",
        color: "#222",
        fontFamily: "system-ui"
      }}
    >
      <h1 style={{ fontSize: 19, margin: "0 0 5px" }}>
        Render Publication preview
      </h1>
      <p style={{ fontSize: 12, margin: "0 0 12px" }}>
        World {worldId} · revision {revision} · {timeSystemId}
      </p>
      <p role="status" style={{ fontSize: 13 }}>
        {status}
      </p>
      <nav
        aria-label="Preview controls"
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
      >
        <button onClick={() => zoom(0.6)} aria-label="Zoom in">
          ＋
        </button>
        <button onClick={() => zoom(1 / 0.6)} aria-label="Zoom out">
          －
        </button>
        <button onClick={() => window.location.reload()}>새 발행 확인</button>
        <a href={`/graph/v5?world=${encodeURIComponent(worldId)}`}>
          기존 그래프 보기
        </a>
      </nav>
      <svg
        ref={surface}
        role="img"
        aria-label="Prepared World render tiles"
        onPointerDown={(e) => {
          dragging.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !camera) return;
          const dx = e.clientX - dragging.current.x,
            dy = e.clientY - dragging.current.y;
          dragging.current = { x: e.clientX, y: e.clientY };
          setCamera(
            (old) =>
              old && {
                ...old,
                x: old.x - (dx * old.spanX) / size.width,
                y: old.y - (dy * old.spanY) / size.height
              }
          );
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        style={{
          display: "block",
          width: "100%",
          height: "min(70dvh, 650px)",
          background: "white",
          border: "1px solid #ddd",
          touchAction: "none"
        }}
      >
        {camera &&
          scene.map(({ primitive, opacity }) => {
            const g = primitive.geometry;
            if (g.kind === "external") return null;
            const color =
              primitive.entity.kind === "relation" ? "#57606c" : "#b27839";
            return (
              <g key={primitive.id} opacity={opacity}>
                {g.kind === "polygon" &&
                  g.rings.map((ring, index) => (
                    <path
                      key={index}
                      d={path(ring, true)}
                      fill="rgba(201,150,74,0.18)"
                      stroke={color}
                      strokeWidth="1.5"
                    />
                  ))}
                {g.kind === "line" &&
                  g.paths.map((line, index) => (
                    <path
                      key={index}
                      d={path(line, false)}
                      fill="none"
                      stroke={color}
                      strokeWidth="1.5"
                    />
                  ))}
                {g.kind === "point" && (
                  <>
                    <circle
                      cx={xy(g.xy).x}
                      cy={xy(g.xy).y}
                      r={primitive.entity.kind === "cluster" ? 9 : 4}
                      fill={
                        primitive.entity.kind === "cluster" ? "#b27839" : "#333"
                      }
                    />
                    <title>{primitive.label}</title>
                  </>
                )}
              </g>
            );
          })}
      </svg>
      <p style={{ fontSize: 12 }}>
        준비된 타일 geometry 확인용 화면입니다. 기존 그래프의 레이블·선택·읽기
        동작은 위 링크에서 확인하세요. Level {level.toFixed(2)}
      </p>
      <details>
        <summary>
          Collection 선택 ({active.length}/{collections.length})
        </summary>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: 12 }}
        >
          {collections.map((item) => (
            <label key={item.id} style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={active.includes(item.id)}
                onChange={(e) =>
                  setActive((old) =>
                    e.target.checked
                      ? [...old, item.id]
                      : old.filter((id) => id !== item.id)
                  )
                }
              />
              {item.title}
            </label>
          ))}
        </div>
      </details>
    </main>
  );
}
