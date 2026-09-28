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
  collections,
  demo = false
}: {
  worldId: string;
  revision: number;
  timeSystemId: string;
  collections: { id: string; title: string }[];
  demo?: boolean;
}) {
  const client = useMemo(
    () =>
      createV5RenderTileClient({
        worldId,
        revision,
        timeSystemId,
        ...(demo ? { endpoint: "/graph/v5/render-demo" } : {})
      }),
    [worldId, revision, timeSystemId, demo]
  );
  const surface = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [size, setSize] = useState({ width: 360, height: 520 });
  const [camera, setCamera] = useState<Camera | null>(null);
  const [active, setActive] = useState(() =>
    collections.map((item) => item.id)
  );
  const [scene, setScene] = useState<Weighted[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [worldBounds, setWorldBounds] = useState<Bounds | null>(null);
  const [showGrid, setShowGrid] = useState(false);
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
        setWorldBounds(bounds);
        setCamera({
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
          spanX: Math.max(bounds.maxX - bounds.minX, 1) * 1.2,
          spanY: Math.max(bounds.maxY - bounds.minY, 1) * 1.2
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus(
          error instanceof Error &&
            error.message === "render_manifest_unavailable"
            ? "현재 revision에는 Render Publication이 없습니다. 새 revision 발행이 필요합니다."
            : "Render Publication 상태를 확인할 수 없습니다. 잠시 후 다시 시도하세요."
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
          `${frame.representations.length} representations · Level ${frame.level.toFixed(2)} · ${frame.cache?.entries ?? 0} cached assets / ${Math.round((frame.cache?.bytes ?? 0) / 1024)} KiB`
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(
          error instanceof Error && error.message === "render_revision_changed"
            ? "새 revision이 발행됐습니다. 새 발행 확인을 누르세요."
            : error instanceof Error &&
                error.message === "render_asset_unlisted"
              ? "필요한 타일이 manifest에 없습니다. 이 revision의 Render Publication을 점검해야 합니다."
              : "타일을 읽거나 검증할 수 없습니다. 새로고침해 다시 확인하세요."
        );
      });
    return () => controller.abort();
  }, [client, camera, size, active]);

  const view = camera && viewOf(camera);
  const gridLevel = Math.floor(level);
  const gridCount = 2 ** gridLevel;
  const gridWidth = worldBounds
    ? Math.max(worldBounds.maxX - worldBounds.minX, 1) / gridCount
    : 0;
  const gridHeight = worldBounds
    ? Math.max(worldBounds.maxY - worldBounds.minY, 1) / gridCount
    : 0;
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
  // Only screen-space collision belongs to the renderer. Text and positions
  // arrive in prepared tiles; panning never reads Event/Composite semantics.
  const labels = new Set<string>();
  const occupied: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[] = [];
  if (camera) {
    for (const { primitive, opacity } of scene) {
      if (labels.size >= 32) break;
      if (
        opacity < 0.5 ||
        primitive.geometry.kind !== "point" ||
        !primitive.label
      )
        continue;
      const p = xy(primitive.geometry.xy);
      const box = {
        left: p.x + 8,
        right:
          p.x +
          8 +
          Math.min(
            220,
            [...primitive.label].reduce(
              (width, char) => width + (char.charCodeAt(0) > 255 ? 12 : 7),
              0
            )
          ),
        top: p.y - 20,
        bottom: p.y - 4
      };
      if (
        box.left < 0 ||
        box.top < 0 ||
        box.right > size.width ||
        box.bottom > size.height ||
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
  }
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
        Render Publication preview {demo ? "· synthetic fixture" : ""}
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
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />
          타일 경계
        </label>
        <a href={`/graph/v5?world=${encodeURIComponent(worldId)}`}>
          기존 그래프 보기
        </a>
        {selectedEvent && !demo && (
          <a
            href={`/graph/v5?world=${encodeURIComponent(worldId)}&event=${encodeURIComponent(selectedEvent)}`}
          >
            선택한 Event 상세 읽기
          </a>
        )}
        {!demo && (
          <a href="/graph/v5/render-preview?demo=1">즉시 체험: 합성 World</a>
        )}
      </nav>
      <svg
        ref={surface}
        role="img"
        aria-label="Prepared World render tiles"
        onPointerDown={(e) => {
          dragging.current = { x: e.clientX, y: e.clientY };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !camera) return;
          const dx = e.clientX - dragging.current.x,
            dy = e.clientY - dragging.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2 && !moved.current) {
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
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
        {camera && worldBounds && showGrid && (
          <g
            pointerEvents="none"
            stroke="#2478ba"
            strokeWidth="1"
            opacity="0.45"
          >
            {Array.from({ length: gridCount + 1 }, (_, index) => {
              const x = xy({
                x: worldBounds.minX + index * gridWidth,
                y: worldBounds.minY
              }).x;
              return (
                <line
                  key={`x-${index}`}
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={size.height}
                />
              );
            })}
            {Array.from({ length: gridCount + 1 }, (_, index) => {
              const y = xy({
                x: worldBounds.minX,
                y: worldBounds.minY + index * gridHeight
              }).y;
              return (
                <line key={`y-${index}`} x1={0} x2={size.width} y1={y} y2={y} />
              );
            })}
          </g>
        )}
        {camera &&
          scene.map(({ primitive, opacity }) => {
            const g = primitive.geometry;
            if (g.kind === "external") return null;
            const color =
              primitive.entity.kind === "relation" ? "#57606c" : "#b27839";
            return (
              <g
                key={primitive.id}
                opacity={opacity}
                onClick={() => {
                  if (!moved.current && primitive.entity.kind === "event")
                    setSelectedEvent(primitive.entity.id);
                }}
              >
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
                    {labels.has(primitive.id) && (
                      <text
                        x={xy(g.xy).x + 8}
                        y={xy(g.xy).y - 8}
                        fontSize="12"
                        fill="#222"
                      >
                        {primitive.label}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
      </svg>
      <p style={{ fontSize: 12 }}>
        준비된 타일 geometry와 화면 좌표 레이블 충돌을 확인하세요. Event를
        선택하면 별도 상세 읽기 링크가 표시됩니다. Level {level.toFixed(2)}
        {worldBounds &&
          ` · Level ${gridLevel} 타일 ${gridCount}×${gridCount}, 셀 ${gridWidth.toPrecision(3)} × ${gridHeight.toPrecision(3)} World 단위`}
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
