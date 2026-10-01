import type {
  RenderPrimitive,
  RenderPublication,
  RenderTile
} from "@moirai/graph-presentation/server";
import { createV5RenderViewportClient } from "./v5-render-viewport-client";
import { interpolateRenderLevels, levelForCamera } from "./v5-render-level";

type Box = { minX: number; maxX: number; minY: number; maxY: number };
type Manifest = Omit<RenderPublication, "documents" | "geometryDocuments">;
type Asset = {
  key: string;
  sha256: string;
  body:
    | RenderTile
    | {
        format: "render-geometry/1";
        worldId: string;
        revision: number;
        timeSystemId: string;
        geometry: RenderPrimitive["geometry"];
      };
};
const overlaps = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const expand = (b: Box) => ({
  minX: b.minX - (b.maxX - b.minX) / 2,
  maxX: b.maxX + (b.maxX - b.minX) / 2,
  minY: b.minY - (b.maxY - b.minY) / 2,
  maxY: b.maxY + (b.maxY - b.minY) / 2
});

/** Renderer-neutral read working set. Selection never causes semantic reads. */
export function createV5RenderTileClient(input: {
  worldId: string;
  revision: number;
  timeSystemId: string;
  fetcher?: typeof fetch;
  endpoint?: string;
  maxBytes?: number;
}) {
  const viewportClient = createV5RenderViewportClient(input);
  const fetcher = input.fetcher ?? fetch;
  const maxBytes = input.maxBytes ?? 16 * 1024 * 1024;
  const cache = new Map<string, { asset: Asset; bytes: number }>();
  const touch = (key: string) => {
    const item = cache.get(key);
    if (item) {
      cache.delete(key);
      cache.set(key, item);
    }
    return item;
  };
  let manifestPromise: Promise<Manifest> | null = null;
  let disposed = false;
  const call = async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const response = await fetcher(input.endpoint ?? "/graph/v5/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        world_id: input.worldId,
        revision: input.revision,
        time_system_id: input.timeSystemId,
        ...body
      }),
      signal: signal ?? null
    });
    if (response.status === 409) throw Error("render_revision_changed");
    if (response.status === 413) throw Error("render_batch_too_large");
    if (response.status === 404)
      throw Error(
        body.kind === "manifest"
          ? "render_manifest_unavailable"
          : "render_asset_unlisted"
      );
    if (!response.ok) throw Error("render_read_unavailable");
    return response.json() as Promise<unknown>;
  };
  const callAssets = async (
    assets: readonly (
      | {
          kind: "tile";
          level: number;
          x: number;
          y: number;
          bucket_kind?: "overflow";
        }
      | { kind: "geometry"; sha256: string }
    )[],
    signal?: AbortSignal
  ): Promise<{ assets: Asset[]; revision: number }> => {
    try {
      return (await call({ kind: "assets", assets }, signal)) as {
        assets: Asset[];
        revision: number;
      };
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        cause.message !== "render_batch_too_large" ||
        assets.length <= 1 ||
        signal?.aborted
      )
        throw cause;
      const half = Math.floor(assets.length / 2);
      const left = await callAssets(assets.slice(0, half), signal);
      const right = await callAssets(assets.slice(half), signal);
      if (left.revision !== right.revision)
        throw Error("render_asset_batch_invalid", { cause });
      return {
        revision: left.revision,
        assets: [...left.assets, ...right.assets]
      };
    }
  };
  const manifest = () =>
    (manifestPromise ??= call({ kind: "manifest" })
      .then((value) => {
        const item = value as Manifest;
        if (
          !["render-publication/1", "render-publication/2"].includes(
            item.format
          ) ||
          item.worldId !== input.worldId ||
          item.revision !== input.revision ||
          item.timeSystemId !== input.timeSystemId ||
          !Array.isArray(item.tiles) ||
          !Array.isArray(item.geometry) ||
          !Number.isInteger(item.maxLevel)
        )
          throw Error("render_manifest_invalid");
        return item;
      })
      .catch((cause) => {
        manifestPromise = null;
        throw cause;
      }));
  const load = async (
    viewport: Box,
    level: number,
    collectionIds: readonly string[],
    signal?: AbortSignal,
    includeNeighborLevels = true
  ) => {
    if (disposed) throw Error("render_client_disposed");
    const publication = await manifest();
    if (
      !Number.isInteger(level) ||
      level < (publication.minLevel ?? 0) ||
      level > publication.maxLevel
    )
      throw Error("render_level_invalid");
    const coverage = expand(viewport);
    const required = publication.tiles.filter(
      (ref) =>
        (ref.bucketKind === "overflow"
          ? ref.level < level
          : includeNeighborLevels
            ? Math.abs(ref.level - level) <= 1
            : ref.level === level) && overlaps(ref.bounds, coverage)
    );
    const needed = required.filter((ref) => !cache.has(ref.key));
    for (let offset = 0; offset < needed.length; offset += 16) {
      const batch = needed.slice(offset, offset + 16);
      const response = await callAssets(
        batch.map((ref) => ({
          kind: "tile" as const,
          level: ref.level,
          x: ref.x,
          y: ref.y,
          ...(ref.bucketKind ? { bucket_kind: ref.bucketKind } : {})
        })),
        signal
      );
      if (
        response.revision !== input.revision ||
        response.assets.length !== batch.length
      )
        throw Error("render_asset_batch_invalid");
      for (const ref of batch) {
        const asset = response.assets.find((item) => item.key === ref.key);
        if (
          !asset ||
          asset.sha256 !== ref.sha256 ||
          (asset.body.format !== "render-tile/1" &&
            asset.body.format !== "render-tile/2") ||
          asset.body.revision !== input.revision ||
          asset.body.worldId !== input.worldId ||
          asset.body.timeSystemId !== input.timeSystemId ||
          asset.body.level !== ref.level ||
          asset.body.x !== ref.x ||
          asset.body.y !== ref.y
        )
          throw Error("render_asset_invalid");
        cache.set(ref.key, {
          asset,
          bytes: new TextEncoder().encode(JSON.stringify(asset.body)).byteLength
        });
      }
    }
    if (signal?.aborted || disposed) throw Error("render_read_aborted");
    for (const ref of required) touch(ref.key);
    const scene = new Map<string, RenderPrimitive>();
    const selected = new Set(collectionIds);
    for (const ref of required) {
      if (
        ref.level !== level &&
        !(ref.bucketKind === "overflow" && ref.level < level)
      )
        continue;
      const tile = touch(ref.key)?.asset.body as RenderTile | undefined;
      if (!tile) throw Error("render_tile_missing");
      for (const primitive of tile.primitives) {
        if (
          !overlaps(primitive.bounds, viewport) ||
          !primitive.collectionIds.some((id) => selected.has(id)) ||
          (primitive.endpointCollectionIds &&
            !primitive.endpointCollectionIds.every((ids) =>
              ids.some((id) => selected.has(id))
            ))
        )
          continue;
        const previous = scene.get(primitive.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(primitive))
          throw Error("render_replica_mismatch");
        scene.set(primitive.id, primitive);
      }
    }
    const geometryRefs = new Map(
      publication.geometry.map((ref) => [ref.key, ref])
    );
    const missing = [
      ...new Set(
        [...scene.values()].flatMap((primitive) =>
          primitive.geometry.kind === "external" ? [primitive.geometry.key] : []
        )
      )
    ].filter((key) => !cache.has(key));
    if (missing.some((key) => !geometryRefs.has(key)))
      throw Error("render_geometry_unlisted");
    for (let offset = 0; offset < missing.length; offset += 16) {
      const batch = missing.slice(offset, offset + 16);
      const response = await callAssets(
        batch.map((key) => ({
          kind: "geometry" as const,
          sha256: geometryRefs.get(key)!.sha256
        })),
        signal
      );
      if (
        response.revision !== input.revision ||
        response.assets.length !== batch.length
      )
        throw Error("render_geometry_batch_invalid");
      for (const key of batch) {
        const asset = response.assets.find((item) => item.key === key);
        if (
          !asset ||
          asset.sha256 !== geometryRefs.get(key)?.sha256 ||
          asset.body.format !== "render-geometry/1" ||
          asset.body.revision !== input.revision ||
          asset.body.worldId !== input.worldId ||
          asset.body.timeSystemId !== input.timeSystemId
        )
          throw Error("render_geometry_invalid");
        cache.set(key, {
          asset,
          bytes: new TextEncoder().encode(JSON.stringify(asset.body)).byteLength
        });
      }
    }
    const primitives = [...scene.values()]
      .map((primitive): RenderPrimitive => {
        if (primitive.geometry.kind !== "external") return primitive;
        const asset = touch(primitive.geometry.key)?.asset;
        if (
          !asset ||
          asset.sha256 !== primitive.geometry.sha256 ||
          asset.body.format !== "render-geometry/1" ||
          asset.body.geometry.kind === "external"
        )
          throw Error("render_geometry_missing");
        return { ...primitive, geometry: asset.body.geometry };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    const pinned = new Set([
      ...required.map((ref) => ref.key),
      ...[...scene.values()].flatMap((primitive) =>
        primitive.geometry.kind === "external" ? [primitive.geometry.key] : []
      )
    ]);
    let bytes = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
    if (
      [...pinned].reduce((sum, key) => sum + (cache.get(key)?.bytes ?? 0), 0) >
      maxBytes
    )
      throw Error("render_working_set_budget_exceeded");
    for (const [key, item] of cache) {
      if (bytes <= maxBytes) break;
      if (!pinned.has(key)) {
        cache.delete(key);
        bytes -= item.bytes;
      }
    }
    return {
      primitives,
      manifest: publication,
      cache: { entries: cache.size, bytes }
    };
  };
  const loadFrame = async (
    input: {
      viewport: Box;
      scaleX: number;
      scaleY: number;
      width: number;
      height: number;
      collectionIds: readonly string[];
    },
    signal?: AbortSignal
  ) => {
    const publication = await manifest();
    if (!publication.bounds)
      return { level: 0, representations: [], manifest: publication };
    const level = levelForCamera({
      ...input,
      world: publication.bounds,
      maxLevel: publication.maxLevel
    });
    const lower = await load(
      input.viewport,
      Math.floor(level),
      input.collectionIds,
      signal
    );
    const upper =
      Math.ceil(level) > Math.floor(level)
        ? await load(
            input.viewport,
            Math.ceil(level),
            input.collectionIds,
            signal
          )
        : lower;
    return {
      level,
      representations: interpolateRenderLevels(
        lower.primitives,
        upper.primitives,
        level
      ),
      cache: upper.cache,
      manifest: publication
    };
  };
  return {
    loadViewport: viewportClient.load,
    load,
    loadExact: (
      viewport: Box,
      level: number,
      collectionIds: readonly string[],
      signal?: AbortSignal
    ) => load(viewport, level, collectionIds, signal, false),
    loadFrame,
    manifest,
    dispose() {
      viewportClient.dispose();
      disposed = true;
      cache.clear();
      manifestPromise = null;
    }
  };
}
