"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./v5-explorer.module.css";

type Box = { minX: number; maxX: number; minY: number; maxY: number };
type Shape =
  | { event_id: string; kind: "point"; position: { x: number; y: number } }
  | {
      event_id: string;
      kind: "segment";
      start: { x: number; y: number };
      end: { x: number; y: number };
    }
  | { event_id: string; kind: "region"; bounds: Box };
type Collection = {
  id: string;
  slug: string;
  title: string;
  member_count: number;
  member_page_count: number;
};
type TimeSystem = { id: string; slug: string; title: string };
type Spatial = {
  shape_count: number;
  unplaced_count: number;
  bounds: Box | null;
};
type Detail = {
  kind: "event" | "collection";
  title: string;
  body: string;
  subtitle: string;
  childIds?: readonly string[];
  childPageCount?: number;
  eventId?: string;
  memberIds?: readonly string[];
  memberNextPage?: number | null;
  collectionId?: string;
};
const MAX_VISIBLE_SHAPES = 512;

function padded(bounds: Box | null): Box {
  if (!bounds) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  const x = Math.max(bounds.maxX - bounds.minX, 1) * 0.12;
  const y = Math.max(bounds.maxY - bounds.minY, 1) * 0.12;
  return {
    minX: bounds.minX - x,
    maxX: bounds.maxX + x,
    minY: bounds.minY - y,
    maxY: bounds.maxY + y
  };
}

/** Visual hit area only. A one-child Composite may have a zero-area factual
 * envelope at its child's coordinate; its World geometry stays unchanged. */
function displayRegion(bounds: Box, radius: number): Box {
  const x = (bounds.minX + bounds.maxX) / 2;
  const y = (bounds.minY + bounds.maxY) / 2;
  const halfX = Math.max((bounds.maxX - bounds.minX) / 2, radius * 4);
  const halfY = Math.max((bounds.maxY - bounds.minY) / 2, radius * 4);
  return {
    minX: x - halfX,
    maxX: x + halfX,
    minY: y - halfY,
    maxY: y + halfY
  };
}

async function read<T>(
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch("/graph/v5/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: signal ?? null
  });
  if (!response.ok) throw Error("읽기 요청을 완료하지 못했습니다.");
  const result = (await response.json()) as { data: T };
  return result.data;
}

export function V5Explorer({
  worldId,
  revision,
  worldTitle,
  initialCollections,
  nextCollectionPage,
  initialTimeSystems,
  nextTimeSystemPage,
  initialSpatial,
  initialEventId
}: {
  worldId: string;
  revision: number;
  worldTitle: string;
  initialCollections: readonly Collection[];
  nextCollectionPage: number | null;
  initialTimeSystems: readonly TimeSystem[];
  nextTimeSystemPage: number | null;
  initialSpatial: Spatial | null;
  initialEventId?: string;
}) {
  const [collections, setCollections] = useState([...initialCollections]);
  const [collectionPage, setCollectionPage] = useState(nextCollectionPage);
  const [systems, setSystems] = useState([...initialTimeSystems]);
  const [systemPage, setSystemPage] = useState(nextTimeSystemPage);
  const [timeSystemId, setTimeSystemId] = useState(
    initialTimeSystems[0]?.id ?? ""
  );
  const [activeIds, setActiveIds] = useState<string[]>(
    initialCollections[0] ? [initialCollections[0].id] : []
  );
  const [spatial, setSpatial] = useState<Spatial | null>(initialSpatial);
  const [viewport, setViewport] = useState<Box>(() =>
    padded(initialSpatial?.bounds ?? null)
  );
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [cursor, setCursor] = useState<unknown | null>(null);
  const [nextCursor, setNextCursor] = useState<unknown | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previewLayer = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; viewport: Box } | null>(null);
  const selectedIds = useMemo(() => [...activeIds].sort(), [activeIds]);
  const selectionKey = selectedIds.join("|");

  useEffect(() => {
    setCursor(null);
    setNextCursor(null);
    setShapes([]);
  }, [selectionKey, timeSystemId, viewport]);

  useEffect(() => {
    if (!timeSystemId || selectedIds.length === 0) {
      setShapes([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/graph/v5/viewport", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        world_id: worldId,
        time_system_id: timeSystemId,
        collection_ids: selectedIds,
        viewport,
        cursor
      }),
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw Error("이 범위의 사건을 불러오지 못했습니다.");
        return response.json() as Promise<{
          served_revision: number;
          shapes: Shape[];
          next_cursor: unknown | null;
        }>;
      })
      .then((page) => {
        if (page.served_revision !== revision)
          throw Error("Publication Revision이 바뀌었습니다. 새로고침하세요.");
        setShapes((previous) => {
          const byId = new Map(
            (cursor ? previous : []).map((shape) => [shape.event_id, shape])
          );
          for (const shape of page.shapes) byId.set(shape.event_id, shape);
          return [...byId.values()].slice(0, MAX_VISIBLE_SHAPES);
        });
        setNextCursor(page.next_cursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "읽기 실패");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [worldId, revision, selectionKey, timeSystemId, viewport, cursor]);

  const chooseSystem = async (id: string) => {
    setTimeSystemId(id);
    setDetail(null);
    try {
      const next = await read<Spatial>({
        world_id: worldId,
        kind: "spatial_summary",
        time_system_id: id
      });
      setSpatial(next);
      setViewport(padded(next.bounds));
    } catch {
      setError("시간 체계의 공간 범위를 불러오지 못했습니다.");
    }
  };
  const toggle = (id: string) => {
    setActiveIds((old) =>
      old.includes(id)
        ? old.filter((value) => value !== id)
        : old.length < 8
          ? [...old, id]
          : old
    );
  };
  const zoom = (ratio: number) =>
    setViewport((box) => {
      const x = (box.minX + box.maxX) / 2,
        y = (box.minY + box.maxY) / 2;
      const halfX = ((box.maxX - box.minX) * ratio) / 2,
        halfY = ((box.maxY - box.minY) * ratio) / 2;
      return {
        minX: x - halfX,
        maxX: x + halfX,
        minY: y - halfY,
        maxY: y + halfY
      };
    });
  const pan = (dx: number, dy: number) =>
    setViewport((box) => ({
      minX: box.minX + dx,
      maxX: box.maxX + dx,
      minY: box.minY + dy,
      maxY: box.maxY + dy
    }));
  const openEvent = async (id: string) => {
    try {
      const data = await read<{
        event: { title: string };
        narrative: { body: string };
        composite: unknown | null;
        composite_child_count: number;
      }>({ world_id: worldId, kind: "event", event_id: id });
      const children =
        data.composite_child_count > 0
          ? await read<{ child_event_ids: string[]; page_count: number }>({
              world_id: worldId,
              kind: "composite_children",
              event_id: id,
              page: 0
            })
          : null;
      setDetail({
        kind: "event",
        title: data.event.title,
        body: data.narrative.body,
        subtitle: data.composite
          ? "복합 사건 · World의 contains 관계"
          : "사건 · World의 사실",
        ...(children
          ? {
              childIds: children.child_event_ids,
              childPageCount: children.page_count,
              eventId: id
            }
          : {})
      });
      const url = new URL(window.location.href);
      url.searchParams.set("event", id);
      window.history.replaceState(null, "", url);
    } catch {
      setError("사건 본문을 불러오지 못했습니다.");
    }
  };
  useEffect(() => {
    if (initialEventId) void openEvent(initialEventId);
    // The deep link is consumed once; subsequent Event clicks use the same read.
  }, [initialEventId]);
  const openCollection = async (id: string) => {
    try {
      const data = await read<{
        collection: { title: string };
        narrative: { body: string };
        member_count: number;
        event_ids: string[];
        next_page: number | null;
      }>({ world_id: worldId, kind: "collection", collection_id: id, page: 0 });
      setDetail({
        kind: "collection",
        title: data.collection.title,
        body: data.narrative.body,
        subtitle: `컬렉션 · ${data.member_count}개 사건을 탐색용으로 선택`,
        memberIds: data.event_ids,
        memberNextPage: data.next_page,
        collectionId: id
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("event");
      window.history.replaceState(null, "", url);
    } catch {
      setError("컬렉션 본문을 불러오지 못했습니다.");
    }
  };
  const width = viewport.maxX - viewport.minX,
    height = viewport.maxY - viewport.minY;
  const radius = Math.max(Math.min(width, height) * 0.012, 0.01);
  const visibleComposites = shapes.filter((shape) => shape.kind === "region");
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Moirai · World Revision {revision}</p>
          <h1>{worldTitle}</h1>
        </div>
        <a href="/graph">탐색 홈</a>
      </header>
      <div className={styles.grid}>
        <aside className={styles.sidebar} aria-label="컬렉션과 시간 체계">
          <label className={styles.label} htmlFor="v5-time-system">
            시간 체계
          </label>
          <select
            id="v5-time-system"
            value={timeSystemId}
            onChange={(event) => void chooseSystem(event.target.value)}
          >
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.title}
              </option>
            ))}
          </select>
          {systemPage !== null && (
            <button
              type="button"
              onClick={() =>
                void read<{
                  time_systems: TimeSystem[];
                  next_page: number | null;
                }>({
                  world_id: worldId,
                  kind: "time_systems",
                  page: systemPage
                })
                  .then((page) => {
                    setSystems((old) => [...old, ...page.time_systems]);
                    setSystemPage(page.next_page);
                  })
                  .catch(() =>
                    setError("시간 체계 목록을 불러오지 못했습니다.")
                  )
              }
            >
              시간 체계 더 보기
            </button>
          )}
          <p className={styles.label}>컬렉션 · 최대 8개 동시 선택</p>
          <div className={styles.collections}>
            {collections.map((collection) => (
              <div className={styles.collection} key={collection.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={activeIds.includes(collection.id)}
                    disabled={
                      !activeIds.includes(collection.id) &&
                      activeIds.length >= 8
                    }
                    onChange={() => toggle(collection.id)}
                  />
                  {collection.title}
                </label>
                <button
                  type="button"
                  aria-label={`${collection.title} 설명`}
                  onClick={() => void openCollection(collection.id)}
                >
                  설명
                </button>
              </div>
            ))}
          </div>
          {collectionPage !== null && (
            <button
              type="button"
              onClick={() =>
                void read<{
                  collections: Collection[];
                  next_page: number | null;
                }>({
                  world_id: worldId,
                  kind: "collections",
                  page: collectionPage
                })
                  .then((page) => {
                    setCollections((old) => [...old, ...page.collections]);
                    setCollectionPage(page.next_page);
                  })
                  .catch(() => setError("컬렉션 목록을 불러오지 못했습니다."))
              }
            >
              컬렉션 더 보기
            </button>
          )}
          <p className={styles.hint}>
            컬렉션은 사건의 소유자가 아니라 탐색을 위한 선택입니다. 복합 사건은
            World의 contains 관계에서 파생됩니다.
          </p>
        </aside>
        <section className={styles.stage} aria-label="사건 공간 탐색">
          <div className={styles.toolbar}>
            <span>
              {spatial
                ? `배치 ${spatial.shape_count} · 미배치 ${spatial.unplaced_count}`
                : "시간 체계 없음"}
            </span>
            <div>
              <button
                type="button"
                onClick={() => pan(-width * 0.25, 0)}
                aria-label="왼쪽으로 이동"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => pan(width * 0.25, 0)}
                aria-label="오른쪽으로 이동"
              >
                →
              </button>
              <button
                type="button"
                onClick={() => pan(0, -height * 0.25)}
                aria-label="위로 이동"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => pan(0, height * 0.25)}
                aria-label="아래로 이동"
              >
                ↓
              </button>
              <button type="button" onClick={() => zoom(0.5)} aria-label="확대">
                ＋
              </button>
              <button type="button" onClick={() => zoom(2)} aria-label="축소">
                －
              </button>
              <button
                type="button"
                onClick={() => setViewport(padded(spatial?.bounds ?? null))}
              >
                전체
              </button>
            </div>
          </div>
          <div ref={previewLayer} className={styles.panLayer}>
            <svg
              className={styles.canvas}
              viewBox={`${viewport.minX} ${viewport.minY} ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerDown={(event) => {
                if ((event.target as Element).closest("[data-event-node]"))
                  return;
                drag.current = { x: event.clientX, y: event.clientY, viewport };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                if (previewLayer.current)
                  previewLayer.current.style.transform = `translate(${event.clientX - drag.current.x}px, ${event.clientY - drag.current.y}px)`;
              }}
              onPointerUp={(event) => {
                if (drag.current) {
                  const box = drag.current.viewport;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const dx =
                    ((drag.current.x - event.clientX) * (box.maxX - box.minX)) /
                    Math.max(1, rect.width);
                  const dy =
                    ((drag.current.y - event.clientY) * (box.maxY - box.minY)) /
                    Math.max(1, rect.height);
                  if (dx || dy)
                    setViewport({
                      minX: box.minX + dx,
                      maxX: box.maxX + dx,
                      minY: box.minY + dy,
                      maxY: box.maxY + dy
                    });
                }
                if (previewLayer.current)
                  previewLayer.current.style.transform = "";
                drag.current = null;
              }}
              onPointerCancel={() => {
                if (previewLayer.current)
                  previewLayer.current.style.transform = "";
                drag.current = null;
              }}
            >
              {shapes.map((shape) => {
                if (shape.kind === "point")
                  return (
                    <circle
                      data-event-node=""
                      key={shape.event_id}
                      cx={shape.position.x}
                      cy={shape.position.y}
                      r={radius}
                      className={styles.point}
                      onClick={() => void openEvent(shape.event_id)}
                    >
                      <title>{shape.event_id}</title>
                    </circle>
                  );
                if (shape.kind === "segment")
                  return (
                    <line
                      data-event-node=""
                      key={shape.event_id}
                      x1={shape.start.x}
                      y1={shape.start.y}
                      x2={shape.end.x}
                      y2={shape.end.y}
                      strokeWidth={radius * 1.5}
                      className={styles.segment}
                      onClick={() => void openEvent(shape.event_id)}
                    >
                      <title>{shape.event_id}</title>
                    </line>
                  );
                const box = displayRegion(shape.bounds, radius);
                return (
                  <rect
                    data-event-node=""
                    key={shape.event_id}
                    x={box.minX}
                    y={box.minY}
                    width={box.maxX - box.minX}
                    height={box.maxY - box.minY}
                    className={styles.region}
                    onClick={() => void openEvent(shape.event_id)}
                  >
                    <title>{shape.event_id}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
          <div className={styles.footer} role="status">
            <span>
              {loading
                ? "읽는 중…"
                : `${shapes.length}개 사건 표시${shapes.length >= MAX_VISIBLE_SHAPES ? " · 더 보려면 확대" : nextCursor ? " · 이어서 읽기 가능" : ""}`}
            </span>
            {nextCursor !== null &&
              shapes.length < MAX_VISIBLE_SHAPES &&
              !loading && (
                <button type="button" onClick={() => setCursor(nextCursor)}>
                  더 보기
                </button>
              )}
          </div>
          {visibleComposites.length > 0 && (
            <nav
              className={styles.compositeNavigation}
              aria-label="보이는 복합 사건"
            >
              {visibleComposites.slice(0, 16).map((shape, index) => (
                <button
                  type="button"
                  key={shape.event_id}
                  aria-label={`복합 사건 열기 ${shape.event_id}`}
                  onClick={() => void openEvent(shape.event_id)}
                >
                  복합 사건 {index + 1}
                </button>
              ))}
              {visibleComposites.length > 16 && <span>더 보려면 확대</span>}
            </nav>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {activeIds.length === 0 && (
            <p className={styles.empty}>
              컬렉션을 켜면 선택된 사건이 나타납니다.
            </p>
          )}
        </section>
        <aside className={styles.detail} aria-label="선택된 본문">
          {detail ? (
            <>
              <p className={styles.eyebrow}>{detail.subtitle}</p>
              <h2>{detail.title}</h2>
              <p className={styles.narrative}>{detail.body}</p>
              {detail.childIds && (
                <div className={styles.children}>
                  <p className={styles.label}>
                    구성 사건 · World의 contains 사실
                  </p>
                  {detail.childIds.map((id) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => void openEvent(id)}
                    >
                      {id}
                    </button>
                  ))}
                  {(detail.childPageCount ?? 0) >
                    Math.ceil(detail.childIds.length / 128) &&
                    detail.childIds.length < MAX_VISIBLE_SHAPES && (
                      <button
                        type="button"
                        onClick={() => {
                          const eventId = detail.eventId!;
                          const page = Math.ceil(detail.childIds!.length / 128);
                          void read<{ child_event_ids: string[] }>({
                            world_id: worldId,
                            kind: "composite_children",
                            event_id: eventId,
                            page
                          })
                            .then((next) =>
                              setDetail((old) =>
                                old?.eventId === eventId
                                  ? {
                                      ...old,
                                      childIds: [
                                        ...(old.childIds ?? []),
                                        ...next.child_event_ids
                                      ]
                                    }
                                  : old
                              )
                            )
                            .catch(() =>
                              setError("구성 사건을 더 읽지 못했습니다.")
                            );
                        }}
                      >
                        구성 사건 더 보기
                      </button>
                    )}
                </div>
              )}
              {detail.memberIds && (
                <div className={styles.children}>
                  <p className={styles.label}>
                    선택된 사건 · 시간축에 미배치된 사건도 열 수 있습니다
                  </p>
                  {detail.memberIds.map((id) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => void openEvent(id)}
                    >
                      {id}
                    </button>
                  ))}
                  {detail.memberNextPage !== null &&
                    detail.memberIds.length < MAX_VISIBLE_SHAPES && (
                      <button
                        type="button"
                        onClick={() => {
                          const collectionId = detail.collectionId!;
                          const page = detail.memberNextPage!;
                          void read<{
                            event_ids: string[];
                            next_page: number | null;
                          }>({
                            world_id: worldId,
                            kind: "collection",
                            collection_id: collectionId,
                            page
                          })
                            .then((next) =>
                              setDetail((old) =>
                                old?.collectionId === collectionId
                                  ? {
                                      ...old,
                                      memberIds: [
                                        ...(old.memberIds ?? []),
                                        ...next.event_ids
                                      ],
                                      memberNextPage: next.next_page
                                    }
                                  : old
                              )
                            )
                            .catch(() =>
                              setError("선택된 사건을 더 읽지 못했습니다.")
                            );
                        }}
                      >
                        선택된 사건 더 보기
                      </button>
                    )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  const url = new URL(window.location.href);
                  url.searchParams.delete("event");
                  window.history.replaceState(null, "", url);
                }}
              >
                닫기
              </button>
            </>
          ) : (
            <p>사건 또는 컬렉션의 설명을 선택하세요.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
