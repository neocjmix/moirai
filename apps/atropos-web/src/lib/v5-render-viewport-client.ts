import {
  selectRenderDensity,
  hiddenRenderDensity,
  type ResolvedRenderPrimitive,
  type RenderDensity
} from "./v5-render-density";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";

type Box = { minX: number; maxX: number; minY: number; maxY: number };
export type RenderViewportMetadata = {
  format: "render-viewport/1";
  world_id: string;
  revision: number;
  time_system_id: string;
  generation: string | null;
  algorithmVersion: string;
  level: number;
  maxLevel: number;
  spatialFrame?: {
    originX: number;
    originY: number;
    baseSpanX: number;
    baseSpanY: number;
    minLevel: number;
    maxLevel: number;
  };
  bounds: Box | null;
  coverage: Box[];
  primitives: RenderPrimitive[];
  completeness?: boolean;
  visibility?: {
    policy: string;
    candidateCount: number;
    omittedCount: number;
    hasOmitted: boolean;
    counting: string;
    readCoverage: string;
    budgets: { normal: number; small: number; buffer: number };
  };
};
type GeometryAsset = {
  key: string;
  sha256: string;
  body: {
    format: "render-geometry/1";
    worldId: string;
    revision: number;
    timeSystemId: string;
    geometry: RenderPrimitive["geometry"];
  };
};
const covers = (a: Box, b: Box) =>
  a.minX <= b.minX && a.maxX >= b.maxX && a.minY <= b.minY && a.maxY >= b.maxY;
const overlaps = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const bytesOf = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** ADR-012 normal reader. Metadata is selection independent; geometry is not.
 * One coverage snapshot and a byte-bounded immutable geometry LRU survive
 * Collection-only loader changes, without a global descriptor manifest. */
export function createV5RenderViewportClient(input: {
  worldId: string;
  revision: number;
  timeSystemId: string;
  fetcher?: typeof fetch;
  endpoint?: string;
  maxBytes?: number;
}) {
  const fetcher = input.fetcher ?? fetch;
  const maxBytes = input.maxBytes ?? 16 * 1024 * 1024;
  const geometry = new Map<string, { asset: GeometryAsset; bytes: number }>();
  let snapshot: {
    box: Box;
    metadata: RenderViewportMetadata;
    createdAt: number;
    level?: number;
  } | null = null;
  let generation: string | null | undefined;
  let disposed = false;
  let epoch = 0;
  let prefetch: AbortController | null = null;
  let lastScene: ResolvedRenderPrimitive[] = [];
  let densityHistory = new Map<string, RenderDensity>();
  const assertCurrent = (ticket: number, signal?: AbortSignal) => {
    if (disposed || signal?.aborted || ticket !== epoch)
      throw new DOMException("Superseded render viewport", "AbortError");
  };
  const call = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const response = await fetcher(input.endpoint ?? "/graph/v5/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: signal ?? null,
      body: JSON.stringify({
        world_id: input.worldId,
        revision: input.revision,
        time_system_id: input.timeSystemId,
        ...(generation === undefined ? {} : { generation }),
        ...body
      })
    });
    if (response.status === 409) throw Error("render_revision_changed");
    if (response.status === 413) throw Error("render_batch_too_large");
    if (response.status === 404) throw Error("render_publication_unavailable");
    if (!response.ok) throw Error("render_read_unavailable");
    return response.json();
  };
  const assets = async (
    refs: { kind: "geometry"; sha256: string }[],
    signal?: AbortSignal
  ): Promise<GeometryAsset[]> => {
    try {
      const value = await call({ kind: "assets", assets: refs }, signal);
      if (
        value.revision !== input.revision ||
        value.generation !== generation ||
        !Array.isArray(value.assets) ||
        value.assets.length !== refs.length
      )
        throw Error("render_geometry_batch_invalid");
      return value.assets;
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        cause.message !== "render_batch_too_large" ||
        refs.length <= 1 ||
        signal?.aborted
      )
        throw cause;
      const half = Math.floor(refs.length / 2);
      // Byte-budget fallback is exceptional, never fixed 16-object sequencing.
      const parts = await Promise.all([
        assets(refs.slice(0, half), signal),
        assets(refs.slice(half), signal)
      ]);
      return parts.flat();
    }
  };
  const load = async (
    viewport: Box,
    collectionIds: readonly string[],
    signal?: AbortSignal,
    level?: number,
    camera?: {
      scaleX: number;
      scaleY: number;
      visibleViewport?: Box;
      selectedId?: string;
    }
  ) => {
    prefetch?.abort();
    prefetch = null;
    const ticket = ++epoch;
    assertCurrent(ticket, signal);
    const previous = snapshot;
    const frame = previous?.metadata.spatialFrame;
    let effectiveLevel = level;
    if (level === undefined && frame) {
      effectiveLevel = frame.maxLevel;
      while (effectiveLevel > frame.minLevel) {
        const sx = frame.baseSpanX * 2 ** -effectiveLevel,
          sy = frame.baseSpanY * 2 ** -effectiveLevel;
        const nx = Math.max(
          1,
          Math.ceil((viewport.maxX - frame.originX) / sx) -
            Math.floor((viewport.minX - frame.originX) / sx)
        );
        const ny = Math.max(
          1,
          Math.ceil((viewport.maxY - frame.originY) / sy) -
            Math.floor((viewport.minY - frame.originY) / sy)
        );
        if (nx * ny <= 16) break;
        effectiveLevel--;
      }
    }
    const reusable =
      previous &&
      previous.level === level &&
      (effectiveLevel === undefined ||
        previous.metadata.level === effectiveLevel) &&
      Date.now() - previous.createdAt < 30_000;
    let metadata: RenderViewportMetadata;
    if (reusable && covers(previous.box, viewport))
      metadata = previous.metadata;
    else {
      const delta = reusable && overlaps(previous.box, viewport);
      const value = (await call(
        {
          kind: "viewport",
          viewport,
          ...(level === undefined ? {} : { level }),
          ...(delta
            ? {
                exclude: [previous.box],
                exclude_level: previous.metadata.level
              }
            : {})
        },
        signal
      )) as RenderViewportMetadata;
      assertCurrent(ticket, signal);
      if (
        value.format !== "render-viewport/1" ||
        value.world_id !== input.worldId ||
        value.revision !== input.revision ||
        value.time_system_id !== input.timeSystemId ||
        !Array.isArray(value.primitives) ||
        !Number.isInteger(value.level) ||
        !Number.isInteger(value.maxLevel) ||
        !(value.generation === null || typeof value.generation === "string")
      )
        throw Error("render_viewport_invalid");
      if (generation !== undefined && generation !== value.generation)
        throw Error("render_generation_changed");
      generation = value.generation;
      const merged = new Map<string, RenderPrimitive>();
      for (const primitive of [
        ...(delta && value.level === previous.metadata.level
          ? previous.metadata.primitives
          : []),
        ...value.primitives
      ]) {
        if (!overlaps(primitive.bounds, viewport)) continue;
        const old = merged.get(primitive.id);
        if (old && JSON.stringify(old) !== JSON.stringify(primitive))
          throw Error("render_replica_mismatch");
        merged.set(primitive.id, primitive);
      }
      metadata = { ...value, primitives: [...merged.values()] };
      if (
        delta &&
        value.level === previous.metadata.level &&
        previous.metadata.visibility?.hasOmitted
      ) {
        metadata.completeness = false;
        if (metadata.visibility)
          metadata.visibility = { ...metadata.visibility, hasOmitted: true };
      }
      if (bytesOf(metadata) > maxBytes)
        throw Error("render_working_set_budget_exceeded");
      snapshot = {
        box: viewport,
        metadata,
        createdAt: Date.now(),
        ...(level === undefined ? {} : { level })
      };
    }
    const selected = new Set(collectionIds);
    const visible = metadata.primitives.filter(
      (p) =>
        overlaps(p.bounds, viewport) &&
        p.collectionIds.some((id) => selected.has(id)) &&
        (!p.endpointCollectionIds ||
          p.endpointCollectionIds.every((ids) =>
            ids.some((id) => selected.has(id))
          ))
    );
    const buffered = new Map<
      string,
      { kind: "external"; key: string; sha256: string }
    >();
    const densityScene = camera?.visibleViewport
      ? selectRenderDensity(
          visible,
          camera.visibleViewport,
          densityHistory,
          camera.selectedId
        )
      : visible;
    const scene = densityScene.map((p): ResolvedRenderPrimitive => {
      if (
        !camera ||
        p.entity.kind !== "composite" ||
        p.geometry.kind !== "external" ||
        !p.composite
      )
        return p;
      const b = p.composite.hullBounds ?? p.bounds;
      const span = Math.max(
        (b.maxX - b.minX) * camera.scaleX,
        (b.maxY - b.minY) * camera.scaleY
      );
      const enter = p.composite.transitions?.pointEnterMaxSizePx ?? 32;
      const density = (p as ResolvedRenderPrimitive).renderDensity;
      if (
        (span > enter && (density?.opacity ?? 1) > 0) ||
        geometry.has(p.geometry.key)
      )
        return p;
      if (span >= enter * 0.75) buffered.set(p.geometry.key, p.geometry);
      // This is the published Composite's point state, never a spatial cluster.
      // Its metadata retains true hull bounds; the adapter marks the hull pending.
      return {
        ...p,
        composite: { ...p.composite, hullBounds: b },
        geometry: {
          kind: "point",
          xy: p.composite.anchor ?? {
            x: (b.minX + b.maxX) / 2,
            y: (b.minY + b.maxY) / 2
          }
        }
      };
    });
    const refs = new Map(
      scene.flatMap((p) =>
        p.geometry.kind === "external"
          ? [[p.geometry.key, p.geometry] as const]
          : []
      )
    );
    const missing = [...refs].filter(([key]) => !geometry.has(key));
    if (missing.length) {
      const fetched = await assets(
        missing.map(([, ref]) => ({ kind: "geometry", sha256: ref.sha256 })),
        signal
      );
      assertCurrent(ticket, signal);
      // Validate the entire response before making any cache changes.
      for (const [key, ref] of missing) {
        const asset = fetched.find((a) => a.key === key);
        if (
          !asset ||
          asset.sha256 !== ref.sha256 ||
          asset.body.format !== "render-geometry/1" ||
          asset.body.worldId !== input.worldId ||
          asset.body.revision !== input.revision ||
          asset.body.timeSystemId !== input.timeSystemId ||
          asset.body.geometry.kind === "external"
        )
          throw Error("render_geometry_invalid");
      }
      for (const asset of fetched)
        geometry.set(asset.key, { asset, bytes: bytesOf(asset.body) });
    }
    assertCurrent(ticket, signal);
    // Pin ALL active refs, including previously cached ones, before eviction.
    let activeBytes = bytesOf(metadata);
    for (const [key, ref] of refs) {
      const cached = geometry.get(key);
      if (!cached || cached.asset.sha256 !== ref.sha256)
        throw Error("render_geometry_missing");
      activeBytes += cached.bytes;
      geometry.delete(key);
      geometry.set(key, cached);
    }
    if (activeBytes > maxBytes)
      throw Error("render_working_set_budget_exceeded");
    let bytes =
      bytesOf(metadata) +
      [...geometry.values()].reduce((sum, item) => sum + item.bytes, 0);
    for (const [key, item] of geometry) {
      if (bytes <= maxBytes) break;
      if (!refs.has(key)) {
        geometry.delete(key);
        bytes -= item.bytes;
      }
    }
    let primitives: ResolvedRenderPrimitive[] = scene
      .map((p) =>
        p.geometry.kind === "external"
          ? {
              ...p,
              geometry: geometry.get(p.geometry.key)!.asset.body.geometry
            }
          : p
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const nextIds = new Set(primitives.map((p) => p.id));
    const outgoing = lastScene
      .filter((p) => !nextIds.has(p.id) && p.geometry.kind === "point")
      .map((p) => ({ ...p, renderDensity: hiddenRenderDensity }));
    densityHistory = new Map(
      primitives.flatMap((p) =>
        p.renderDensity ? [[p.id, p.renderDensity] as const] : []
      )
    );
    lastScene = primitives;
    // Keep exactly one outgoing frame so CSS can animate disappearance. This
    // never accumulates navigation history or fetches geometry for removed dots.
    primitives = [...primitives, ...outgoing];
    if (buffered.size) {
      const controller = new AbortController();
      prefetch = controller;
      // Optional nearby-scale hull fetch is deliberately outside the active await.
      void assets(
        [...buffered.values()].map((ref) => ({
          kind: "geometry",
          sha256: ref.sha256
        })),
        controller.signal
      )
        .then((fetched) => {
          assertCurrent(ticket, controller.signal);
          let total = bytes;
          for (const asset of fetched) {
            const ref = buffered.get(asset.key);
            if (
              !ref ||
              asset.sha256 !== ref.sha256 ||
              asset.body.format !== "render-geometry/1" ||
              asset.body.worldId !== input.worldId ||
              asset.body.revision !== input.revision ||
              asset.body.timeSystemId !== input.timeSystemId ||
              asset.body.geometry.kind === "external"
            )
              return;
          }
          for (const asset of fetched) {
            const size = bytesOf(asset.body);
            if (total + size <= maxBytes && !geometry.has(asset.key)) {
              geometry.set(asset.key, { asset, bytes: size });
              total += size;
            }
          }
        })
        .catch(() => {
          /* A cancelled/failed buffer never invalidates active paint. */
        });
    }
    return {
      primitives,
      metadata,
      cache: { entries: geometry.size + 1, bytes }
    };
  };
  return {
    load,
    dispose() {
      disposed = true;
      prefetch?.abort();
      epoch++;
      snapshot = null;
      geometry.clear();
      lastScene = [];
      densityHistory.clear();
    }
  };
}
