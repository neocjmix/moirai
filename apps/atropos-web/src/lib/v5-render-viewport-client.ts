import {
  selectRenderDensity,
  resolveRenderCompositeSpans,
  hiddenRenderDensity,
  type ResolvedRenderPrimitive,
  type RenderDensity
} from "./v5-render-density";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
import { selectRenderPrimitiveClosure } from "@moirai/graph-presentation/render-primitive-admission";
import { COMPOSITE_COMPACT_THRESHOLD_PX } from "../urdr-port/src/components/composite-point-display";

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
type GeometryRef = { kind: "external"; key: string; sha256: string };
type Snapshot = {
  box: Box;
  metadata: RenderViewportMetadata;
  createdAt: number;
  bytes: number;
  level?: number;
};
const covers = (a: Box, b: Box) =>
  a.minX <= b.minX && a.maxX >= b.maxX && a.minY <= b.minY && a.maxY >= b.maxY;
const overlaps = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const bytesOf = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** ADR-012 normal reader. Metadata is selection independent; geometry is not.
 * Bounded coverage/level snapshots and an immutable geometry LRU survive
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
  const snapshots: Snapshot[] = [];
  let snapshot: Snapshot | null = null;
  let generation: string | null | undefined;
  let disposed = false;
  let epoch = 0;
  let prefetch: {
    controller: AbortController;
    refs: Map<string, GeometryRef>;
    promise: Promise<GeometryAsset[]>;
  } | null = null;
  let levelPrefetch: {
    controller: AbortController;
    box: Box;
    level: number;
    promise: Promise<RenderViewportMetadata>;
  } | null = null;
  let lastScene: ResolvedRenderPrimitive[] = [];
  const outgoingPoints = new Map<
    string,
    { primitive: ResolvedRenderPrimitive; expiresAt: number }
  >();
  let densityHistory = new Map<string, RenderDensity>();
  const cacheBytes = () =>
    snapshots.reduce((sum, item) => sum + item.bytes, 0) +
    [...geometry.values()].reduce((sum, item) => sum + item.bytes, 0);
  const trimCache = (pinned: ReadonlySet<string> = new Set()) => {
    let bytes = cacheBytes();
    while (bytes > maxBytes && snapshots.length > 1) {
      const index = snapshots.findIndex((item) => item !== snapshot);
      if (index < 0) break;
      bytes -= snapshots.splice(index, 1)[0]!.bytes;
    }
    for (const [key, item] of geometry) {
      if (bytes <= maxBytes) break;
      if (!pinned.has(key)) {
        geometry.delete(key);
        bytes -= item.bytes;
      }
    }
    return bytes;
  };
  const validateMetadata = (value: RenderViewportMetadata) => {
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
  };
  const validateAssets = (
    fetched: GeometryAsset[],
    refs: ReadonlyMap<string, GeometryRef>
  ) => {
    for (const [key, ref] of refs) {
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
  };
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
    const ticket = ++epoch;
    assertCurrent(ticket, signal);
    const now = Date.now();
    for (let i = snapshots.length - 1; i >= 0; i--)
      if (now - snapshots[i]!.createdAt >= 30_000) snapshots.splice(i, 1);
    const frame = snapshot?.metadata.spatialFrame;
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
    // The caller already requests four screen widths/heights. Refilling that
    // whole margin after each tiny pan defeats its purpose. Keep half a screen
    // ahead of the visible camera, then refill the full margin at its boundary.
    const view = camera?.visibleViewport;
    const required = view
      ? {
          minX: Math.max(
            viewport.minX,
            view.minX - (view.maxX - view.minX) / 2
          ),
          maxX: Math.min(
            viewport.maxX,
            view.maxX + (view.maxX - view.minX) / 2
          ),
          minY: Math.max(
            viewport.minY,
            view.minY - (view.maxY - view.minY) / 2
          ),
          maxY: Math.min(viewport.maxY, view.maxY + (view.maxY - view.minY) / 2)
        }
      : viewport;
    const compatible = snapshots.filter(
      (item) =>
        item.level === level &&
        (effectiveLevel === undefined ||
          item.metadata.level === effectiveLevel ||
          // Fixed-grid levels change candidate coverage, not representation.
          // A complete snapshot already contains every authored alternative.
          (level === undefined &&
            item.metadata.algorithmVersion === "render-compiler/4" &&
            item.metadata.completeness === true &&
            item.metadata.visibility?.hasOmitted === false &&
            covers(item.box, required)))
    );
    const previous =
      compatible.findLast((item) => covers(item.box, required)) ??
      compatible.findLast((item) => overlaps(item.box, viewport));
    let metadata: RenderViewportMetadata;
    if (previous && covers(previous.box, required)) {
      metadata = previous.metadata;
      snapshots.splice(snapshots.indexOf(previous), 1);
      snapshots.push(previous);
      snapshot = previous;
    } else {
      const delta = previous && overlaps(previous.box, viewport);
      const pending =
        levelPrefetch &&
        levelPrefetch.level === effectiveLevel &&
        covers(levelPrefetch.box, required)
          ? levelPrefetch
          : null;
      const value = pending
        ? await pending.promise
        : ((await call(
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
          )) as RenderViewportMetadata);
      assertCurrent(ticket, signal);
      validateMetadata(value);
      generation = value.generation;
      const readBox = pending?.box ?? viewport;
      const merged = new Map<string, RenderPrimitive>();
      for (const primitive of [
        ...(delta && !pending && value.level === previous.metadata.level
          ? previous.metadata.primitives
          : []),
        ...value.primitives
      ]) {
        const old = merged.get(primitive.id);
        if (old && JSON.stringify(old) !== JSON.stringify(primitive))
          throw Error("render_replica_mismatch");
        merged.set(primitive.id, primitive);
      }
      const available = [...merged.values()];
      metadata = {
        ...value,
        primitives: selectRenderPrimitiveClosure(
          available.filter((primitive) => overlaps(primitive.bounds, readBox)),
          available.length,
          { available }
        )
      };
      if (
        delta &&
        !pending &&
        value.level === previous.metadata.level &&
        previous.metadata.visibility?.hasOmitted
      ) {
        metadata.completeness = false;
        if (metadata.visibility)
          metadata.visibility = { ...metadata.visibility, hasOmitted: true };
      }
      const metadataBytes = bytesOf(metadata);
      if (metadataBytes > maxBytes)
        throw Error("render_working_set_budget_exceeded");
      snapshot = {
        box: readBox,
        metadata,
        createdAt: now,
        bytes: metadataBytes,
        ...(level === undefined ? {} : { level })
      };
      const prefetchedIndex = snapshots.findIndex(
        (item) => item.metadata === value
      );
      if (prefetchedIndex >= 0) snapshots.splice(prefetchedIndex, 1);
      snapshots.push(snapshot);
      while (snapshots.length > 6) snapshots.shift();
      trimCache();
    }
    const selected = new Set(collectionIds);
    const eligible = metadata.primitives.filter(
      (p) =>
        p.collectionIds.some((id) => selected.has(id)) &&
        (!p.endpointCollectionIds ||
          p.endpointCollectionIds.every((ids) =>
            ids.some((id) => selected.has(id))
          ))
    );
    const visible = selectRenderPrimitiveClosure(
      eligible.filter((p) => overlaps(p.bounds, viewport)),
      eligible.length,
      { available: eligible }
    );
    const buffered = new Map<string, GeometryRef>();
    const densityScene = camera?.visibleViewport
      ? selectRenderDensity(
          visible,
          camera.visibleViewport,
          densityHistory,
          camera.selectedId,
          camera
        )
      : visible;
    const compositeSpans = camera
      ? resolveRenderCompositeSpans(visible, camera)
      : new Map<string, number>();
    const scene = densityScene.map((p): ResolvedRenderPrimitive => {
      if (
        !camera ||
        p.entity.kind !== "composite" ||
        p.geometry.kind !== "external" ||
        !p.composite
      )
        return p;
      const b = p.composite.hullBounds ?? p.bounds;
      const span = compositeSpans.get(p.entity.id) ?? 0;
      // Immutable publications can carry the older, larger compact threshold.
      // Fetch support when the current painter needs an area, without rewriting
      // that publication or leaving a cold small Composite stuck as a point.
      const enter = Math.min(
        p.composite.transitions?.pointEnterMaxSizePx ??
          COMPOSITE_COMPACT_THRESHOLD_PX,
        COMPOSITE_COMPACT_THRESHOLD_PX
      );
      if (span > enter || geometry.has(p.geometry.key)) return p;
      // One scale doubling of lead time before the current hull transition.
      if (span >= enter * 0.5) buffered.set(p.geometry.key, p.geometry);
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
    if (
      prefetch &&
      ![...prefetch.refs.keys()].some(
        (key) => refs.has(key) || buffered.has(key)
      )
    ) {
      prefetch.controller.abort();
      prefetch = null;
    }
    if (missing.length) {
      // A hull crossing its scale threshold promotes its existing buffer read.
      // Camera updates must not cancel it and start the identical request again.
      const promoted = prefetch;
      const fresh = missing.filter(([key]) => !promoted?.refs.has(key));
      const batches = await Promise.all([
        ...(promoted && missing.some(([key]) => promoted.refs.has(key))
          ? [promoted.promise]
          : []),
        ...(fresh.length
          ? [
              assets(
                fresh.map(([, ref]) => ({
                  kind: "geometry",
                  sha256: ref.sha256
                })),
                signal
              )
            ]
          : [])
      ]);
      const fetched = batches.flat();
      assertCurrent(ticket, signal);
      // Validate the entire response before making any cache changes.
      validateAssets(fetched, new Map(missing));
      const incoming = new Map(
        fetched.map((asset) => [
          asset.key,
          { asset, bytes: bytesOf(asset.body) }
        ])
      );
      const incomingActiveBytes =
        snapshot!.bytes +
        [...refs.keys()].reduce(
          (sum, key) =>
            sum + (incoming.get(key)?.bytes ?? geometry.get(key)?.bytes ?? 0),
          0
        );
      if (incomingActiveBytes > maxBytes)
        throw Error("render_working_set_budget_exceeded");
      for (const [key, item] of incoming) geometry.set(key, item);
    }
    assertCurrent(ticket, signal);
    // Pin ALL active refs, including previously cached ones, before eviction.
    let activeBytes = snapshot!.bytes;
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
    const bytes = trimCache(new Set(refs.keys()));
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
    const transitionNow = Date.now();
    for (const p of lastScene)
      if (!nextIds.has(p.id) && p.geometry.kind === "point")
        outgoingPoints.set(p.id, {
          primitive: p,
          expiresAt: transitionNow + 220
        });
    for (const [id, outgoing] of outgoingPoints)
      if (
        nextIds.has(id) ||
        outgoing.expiresAt <= transitionNow ||
        !outgoing.primitive.collectionIds.some((collection) =>
          selected.has(collection)
        )
      )
        outgoingPoints.delete(id);
    while (outgoingPoints.size > 160)
      outgoingPoints.delete(outgoingPoints.keys().next().value!);
    densityHistory = new Map(
      primitives.flatMap((p) =>
        p.renderDensity ? [[p.id, p.renderDensity] as const] : []
      )
    );
    lastScene = primitives;
    // A time window survives several fast camera reads long enough for the
    // 180ms CSS fade. Reappearing identities reclaim their existing paint key.
    primitives = [
      ...primitives,
      ...[...outgoingPoints.values()].map(({ primitive }) => ({
        ...primitive,
        renderDensity: hiddenRenderDensity
      }))
    ];
    if (buffered.size && !prefetch) {
      const controller = new AbortController();
      // Optional nearby-scale hull fetch is deliberately outside the active await.
      const promise = assets(
        [...buffered.values()].map((ref) => ({
          kind: "geometry",
          sha256: ref.sha256
        })),
        controller.signal
      ).then((fetched) => {
        if (disposed || controller.signal.aborted)
          throw new DOMException("Superseded render buffer", "AbortError");
        validateAssets(fetched, buffered);
        let total = cacheBytes();
        for (const asset of fetched) {
          const size = bytesOf(asset.body);
          if (total + size <= maxBytes && !geometry.has(asset.key)) {
            geometry.set(asset.key, { asset, bytes: size });
            total += size;
          }
        }
        return fetched;
      });
      prefetch = { controller, refs: buffered, promise };
      void promise
        .catch(() => {
          // A cancelled/failed buffer never invalidates the current point paint.
        })
        .finally(() => {
          if (prefetch?.controller === controller) prefetch = null;
        });
    }
    if (
      levelPrefetch &&
      (!overlaps(levelPrefetch.box, required) ||
        Math.abs(levelPrefetch.level - metadata.level) > 1)
    ) {
      levelPrefetch.controller.abort();
      levelPrefetch = null;
    }
    const nextLevel = metadata.level + 1;
    // A fetched buffer must have an inner refill threshold. Requiring its
    // entire two-screen margin to cover the next camera's same-sized margin
    // refetches hundreds of kilobytes after every subpixel pan.
    const levelBufferRequired = view
      ? {
          minX: view.minX - (view.maxX - view.minX) / 4,
          maxX: view.maxX + (view.maxX - view.minX) / 4,
          minY: view.minY - (view.maxY - view.minY) / 4,
          maxY: view.maxY + (view.maxY - view.minY) / 4
        }
      : required;
    if (
      view &&
      level === undefined &&
      metadata.algorithmVersion === "render-compiler/4" &&
      metadata.spatialFrame &&
      metadata.visibility?.hasOmitted &&
      nextLevel <= metadata.spatialFrame.maxLevel &&
      !levelPrefetch &&
      !snapshots.some(
        (item) =>
          item.level === undefined &&
          item.metadata.level === nextLevel &&
          covers(item.box, levelBufferRequired)
      )
    ) {
      const controller = new AbortController();
      // Read the next finer spatial level over two screens, not the whole
      // four-screen current-level margin. The cell fanout stays bounded while
      // preparing candidates before the first inward scale boundary.
      const promise = call(
        { kind: "viewport", viewport: required, level: nextLevel },
        controller.signal
      ).then((value: RenderViewportMetadata) => {
        if (disposed || controller.signal.aborted)
          throw new DOMException(
            "Superseded render level buffer",
            "AbortError"
          );
        validateMetadata(value);
        if (value.level !== nextLevel) throw Error("render_level_mismatch");
        const size = bytesOf(value);
        while (
          snapshots.length > 1 &&
          (snapshots.length >= 6 || cacheBytes() + size > maxBytes)
        ) {
          const index = snapshots.findIndex((item) => item !== snapshot);
          if (index < 0) break;
          snapshots.splice(index, 1);
        }
        if (cacheBytes() + size <= maxBytes)
          snapshots.push({
            box: required,
            metadata: value,
            createdAt: Date.now(),
            bytes: size
          });
        return value;
      });
      levelPrefetch = { controller, box: required, level: nextLevel, promise };
      void promise
        .catch(() => {
          // A best-effort finer buffer cannot invalidate the current scene.
        })
        .finally(() => {
          if (levelPrefetch?.controller === controller) levelPrefetch = null;
        });
    }
    return {
      primitives,
      metadata,
      cache: { entries: geometry.size + snapshots.length, bytes }
    };
  };
  return {
    load,
    inspect: () => ({
      entries: geometry.size + snapshots.length,
      snapshots: snapshots.length,
      geometry: geometry.size,
      bytes: cacheBytes(),
      maxBytes,
      pendingGeometry: prefetch !== null,
      pendingLevel: levelPrefetch !== null
    }),
    dispose() {
      disposed = true;
      prefetch?.controller.abort();
      prefetch = null;
      levelPrefetch?.controller.abort();
      levelPrefetch = null;
      epoch++;
      snapshot = null;
      snapshots.length = 0;
      geometry.clear();
      lastScene = [];
      outgoingPoints.clear();
      densityHistory.clear();
    }
  };
}
