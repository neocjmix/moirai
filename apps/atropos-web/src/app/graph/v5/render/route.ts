import { z } from "zod";
import { createHash } from "node:crypto";
import {
  readV5ServedRoot,
  readV5StagedDocument,
  readV5RenderGeneration,
  renderReadSummary,
  isRenderBox,
  type RenderBox,
  type RenderReadSummary
} from "@moirai/publication/v5";
import {
  renderTileAddresses,
  renderTileBounds
} from "@moirai/graph-presentation/server";
import { readPublicationObject } from "../../../../lib/publication";

export const dynamic = "force-dynamic";
const identity = {
  world_id: z.string().uuid(),
  revision: z.number().int().positive(),
  time_system_id: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/)
    .max(128),
  generation: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .optional()
};
const box = z
  .object({
    minX: z.number().finite(),
    maxX: z.number().finite(),
    minY: z.number().finite(),
    maxY: z.number().finite()
  })
  .strict()
  .refine((value) => value.minX <= value.maxX && value.minY <= value.maxY);
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manifest"), ...identity }).strict(),
  z
    .object({
      kind: z.literal("viewport"),
      ...identity,
      viewport: box,
      level: z.number().int().min(-32).max(32).optional(),
      exclude: z.array(box).max(8).optional(),
      exclude_level: z.number().int().min(-32).max(32).optional(),
      scale: z.number().finite().positive().optional(),
      width: z.number().finite().positive().optional(),
      height: z.number().finite().positive().optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal("assets"),
      ...identity,
      assets: z
        .array(
          z.discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("tile"),
                bucket_kind: z.literal("overflow").optional(),
                level: z.number().int().min(-32).max(32),
                x: z.number().int().safe(),
                y: z.number().int().safe()
              })
              .strict(),
            z
              .object({
                kind: z.literal("geometry"),
                sha256: z.string().regex(/^[0-9a-f]{64}$/)
              })
              .strict()
          ])
        )
        .min(1)
        .max(256)
    })
    .strict()
]);
const noStore = { "cache-control": "no-store" };
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const intersects = (a: RenderBox, b: RenderBox) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
const contains = (a: RenderBox, b: RenderBox) =>
  a.minX <= b.minX && a.maxX >= b.maxX && a.minY <= b.minY && a.maxY >= b.maxY;
type Ref = {
  key: string;
  sha256: string;
  bounds: RenderBox;
  level: number;
  x: number;
  y: number;
  bucketKind?: "overflow";
};
type Manifest = {
  format: string;
  worldId: string;
  revision: number;
  timeSystemId: string;
  algorithmVersion: string;
  maxLevel: number;
  bounds: RenderBox | null;
  tiles: Ref[];
  geometry: { key: string; sha256: string }[];
};
type Primitive = {
  id: string;
  bounds: RenderBox;
  geometry: { kind: string; key?: string; sha256?: string };
};
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: noStore });

/** Deterministic fixed-frame selection, independent of occupied World bounds. */
function fixedTiles(
  summary: RenderReadSummary,
  viewport: RenderBox,
  level: number,
  prefix: string,
  maxTiles = 256,
  bucketKind?: "overflow"
) {
  try {
    return renderTileAddresses(
      summary.spatialFrame,
      viewport,
      level,
      maxTiles
    ).map((address) => ({
      ...address,
      ...(bucketKind ? { bucketKind } : {}),
      key: `${prefix}${bucketKind === "overflow" ? "overflow/" : ""}${address.level}/${address.x}/${address.y}.json`,
      bounds: renderTileBounds(summary.spatialFrame, address)
    }));
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message === "render_tile_budget_exceeded"
    )
      throw Error("render_viewport_too_large", { cause });
    throw Error("invalid_render_query", { cause });
  }
}

/** Thin immutable spatial resolver. Collection selection and LOD remain local. */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024)
    return error("query_too_large", 413);
  let query: z.infer<typeof requestSchema>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 128 * 1024)
      return error("query_too_large", 413);
    const parsed = requestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return error("invalid_render_query", 400);
    query = parsed.data;
  } catch {
    return error("invalid_render_query", 400);
  }
  try {
    // Deduplicate both index and asset reads inside the request, never across a
    // mutable pointer. The generation reader uses this same canonical snapshot.
    const objects = new Map<string, ReturnType<typeof readPublicationObject>>();
    const store = {
      get: (key: string) => {
        let pending = objects.get(key);
        if (!pending) {
          if (objects.size >= 256) throw Error("render_viewport_too_large");
          pending = readPublicationObject(key);
          objects.set(key, pending);
        }
        return pending;
      }
    };
    const served = await readV5ServedRoot(store, query.world_id);
    if (served.pointer.served_revision !== query.revision)
      return error("revision_changed", 409);
    const generation = await readV5RenderGeneration(
      store,
      query.world_id,
      served
    ).catch((cause: unknown) => {
      if (
        cause instanceof Error &&
        [
          "render_generation_unavailable",
          "render_generation_source_changed"
        ].includes(cause.message)
      )
        return null;
      throw cause;
    });
    if (generation && generation.revision !== query.revision)
      return error("revision_changed", 409);
    const generationId = generation?.generation ?? null;
    if (query.generation !== undefined && query.generation !== generationId)
      return error("render_generation_changed", 409);
    const generationRef = generation?.manifests.find(
      (item) => item.timeSystemId === query.time_system_id
    );
    const prefix = generation
      ? `worlds/${query.world_id}/render-generations/${generation.generation}/${query.time_system_id}/`
      : `worlds/${query.world_id}/revisions/${query.revision}/v5/render/${query.time_system_id}/`;
    const get = async (key: string) => (await store.get(key)).body;
    const staged = (key: string) =>
      readV5StagedDocument(served.rootBody, key, get);
    let summary = generationRef?.summary
      ? renderReadSummary(generationRef.summary)
      : null;
    if (!generation) {
      const body = await staged(`${prefix}viewport.json`);
      if (body) {
        const parsed = JSON.parse(body) as Manifest;
        if (
          parsed.worldId !== query.world_id ||
          parsed.revision !== query.revision ||
          parsed.timeSystemId !== query.time_system_id
        )
          throw Error("render_summary_invalid");
        summary = renderReadSummary(parsed);
      }
    }
    let manifest: Manifest | null = null;
    // Explicit v1 compatibility adapter. v2 normal reads use compact summary +
    // exact Merkle-index lookup; the operational manifest is never downloaded.
    if (!summary || query.kind === "manifest") {
      const body = generation
        ? generationRef
          ? await generation.read(generationRef.key, generationRef.sha256)
          : null
        : await staged(`${prefix}manifest.json`);
      if (!body) return error("render_unavailable", 404);
      manifest = JSON.parse(body) as Manifest;
      if (
        !["render-publication/1", "render-publication/2"].includes(
          manifest.format
        ) ||
        manifest.worldId !== query.world_id ||
        manifest.revision !== query.revision ||
        manifest.timeSystemId !== query.time_system_id ||
        !Array.isArray(manifest.tiles) ||
        !Array.isArray(manifest.geometry)
      )
        throw Error("render_manifest_invalid");
      if (query.kind === "manifest")
        return Response.json(manifest, { headers: noStore });
      if (manifest.format !== "render-publication/1")
        throw Error("render_summary_unavailable");
    }
    const allowed = manifest
      ? new Map(
          [...manifest.tiles, ...manifest.geometry].map((ref) => [
            ref.key,
            ref.sha256
          ])
        )
      : null;
    const readAsset = async (key: string) => {
      if (summary && generation) {
        if (!generation.resolve) throw Error("render_asset_index_unavailable");
        return generation.resolve(query.time_system_id, key);
      }
      const digest = allowed?.get(key);
      if (allowed && !digest) return null;
      const body = generation
        ? await generation.read(key, digest!)
        : await staged(key);
      if (!body) return null;
      if (digest && hash(body) !== digest)
        throw Error("render_manifest_digest_mismatch");
      return { body, sha256: digest ?? hash(body) };
    };
    if (query.kind === "assets") {
      const assets = [];
      let bytes = 0;
      for (const asset of query.assets) {
        if (
          asset.kind === "tile" &&
          asset.bucket_kind === "overflow" &&
          !summary
        )
          return error("invalid_render_query", 400);
        if (
          asset.kind === "tile" &&
          !summary &&
          (asset.level < 0 ||
            asset.level > 16 ||
            asset.x < 0 ||
            asset.y < 0 ||
            asset.x >= 2 ** asset.level ||
            asset.y >= 2 ** asset.level)
        )
          return error("invalid_render_query", 400);
        const key =
          asset.kind === "tile"
            ? `${prefix}${asset.bucket_kind === "overflow" ? "overflow/" : ""}${asset.level}/${asset.x}/${asset.y}.json`
            : `${prefix}geometry/${asset.sha256}.json`;
        const value = await readAsset(key);
        if (!value) return error("render_asset_not_found", 404);
        if (asset.kind === "geometry" && value.sha256 !== asset.sha256)
          throw Error("render_manifest_digest_mismatch");
        bytes += Buffer.byteLength(value.body);
        if (bytes > 4 * 1024 * 1024)
          return error("render_batch_too_large", 413);
        assets.push({
          key,
          sha256: value.sha256,
          body: JSON.parse(value.body)
        });
      }
      return Response.json(
        {
          world_id: query.world_id,
          revision: query.revision,
          time_system_id: query.time_system_id,
          generation: generationId,
          assets
        },
        { headers: noStore }
      );
    }
    const info = summary ?? manifest!;
    let level = query.level ?? info.maxLevel;
    if (summary && query.level === undefined) {
      // Spatial level controls request fanout, never semantic visibility. The
      // compiler preserves authored alternatives in every fixed-grid level.
      while (level > summary.spatialFrame.minLevel) {
        try {
          renderTileAddresses(summary.spatialFrame, query.viewport, level, 16);
          break;
        } catch (cause) {
          if (
            !(cause instanceof Error) ||
            cause.message !== "render_tile_budget_exceeded"
          )
            throw Error("invalid_render_query", { cause });
          level--;
        }
      }
    }
    if (
      !Number.isInteger(level) ||
      (!summary && (level < 0 || level > info.maxLevel))
    )
      return error("invalid_render_query", 400);
    const exclusions =
      query.exclude_level === level ? (query.exclude ?? []) : [];
    const refs = (
      summary
        ? [
            ...fixedTiles(
              summary,
              query.viewport,
              level,
              prefix,
              query.level === undefined ? 16 : 256
            ),
            ...summary.overflowLevels
              .filter((ancestor) => ancestor < level)
              .flatMap((ancestor) =>
                fixedTiles(
                  summary,
                  query.viewport,
                  ancestor,
                  prefix,
                  16,
                  "overflow"
                )
              )
          ]
        : manifest!.tiles.filter(
            (ref) =>
              ref.level === level && intersects(ref.bounds, query.viewport)
          )
    ).filter((ref) => !exclusions.some((box) => contains(box, ref.bounds)));
    if (refs.length > 256) return error("render_viewport_too_large", 413);
    const primitives = new Map<string, Primitive>();
    let bytes = 0;
    let tileCandidateCount = 0,
      tileOmittedCount = 0;
    for (let offset = 0; offset < refs.length; offset += 8) {
      const batch = refs.slice(offset, offset + 8);
      const values = await Promise.all(batch.map((ref) => readAsset(ref.key)));
      for (let i = 0; i < batch.length; i++) {
        const ref = batch[i]!,
          value = values[i];
        if (!value) continue; // Authenticated index proves an empty sparse bucket.
        bytes += Buffer.byteLength(value.body);
        if (bytes > 4 * 1024 * 1024)
          return error("render_viewport_too_large", 413);
        const tile = JSON.parse(value.body) as {
          format: string;
          worldId: string;
          revision: number;
          timeSystemId: string;
          level: number;
          x: number;
          y: number;
          bucketKind?: "overflow";
          primitives: Primitive[];
          visibility?: {
            policy: string;
            candidateCount: number;
            omittedCount: number;
            normalBudget: number;
            smallBudget: number;
            bufferBudget: number;
          };
        };
        if (
          tile.format !== (summary ? "render-tile/2" : "render-tile/1") ||
          tile.worldId !== query.world_id ||
          tile.revision !== query.revision ||
          tile.timeSystemId !== query.time_system_id ||
          tile.level !== ref.level ||
          tile.bucketKind !== ref.bucketKind ||
          tile.x !== ref.x ||
          tile.y !== ref.y ||
          !Array.isArray(tile.primitives) ||
          (summary && tile.primitives.length > 128)
        )
          throw Error("render_tile_identity_invalid");
        if (tile.visibility) {
          const visibility = tile.visibility;
          if (
            visibility.policy !== "render-visibility/1" ||
            !Number.isSafeInteger(visibility.candidateCount) ||
            !Number.isSafeInteger(visibility.omittedCount) ||
            visibility.omittedCount < 0 ||
            visibility.candidateCount < visibility.omittedCount
          )
            throw Error("render_visibility_invalid");
          if (
            visibility.normalBudget !== 64 ||
            visibility.smallBudget !== 32 ||
            visibility.bufferBudget !== 32
          )
            throw Error("render_visibility_invalid");
          tileCandidateCount += visibility.candidateCount;
          tileOmittedCount += visibility.omittedCount;
        } else tileCandidateCount += tile.primitives.length;
        for (const primitive of tile.primitives) {
          if (
            typeof primitive.id !== "string" ||
            !isRenderBox(primitive.bounds)
          )
            throw Error("render_primitive_invalid");
          if (!intersects(primitive.bounds, query.viewport)) continue;
          if (
            primitive.geometry.kind === "external" &&
            (!primitive.geometry.key?.startsWith(`${prefix}geometry/`) ||
              !/^[0-9a-f]{64}$/.test(primitive.geometry.sha256 ?? ""))
          )
            throw Error("render_geometry_reference_invalid");
          const previous = primitives.get(primitive.id);
          if (
            previous &&
            JSON.stringify(previous) !== JSON.stringify(primitive)
          )
            throw Error("render_replica_mismatch");
          primitives.set(primitive.id, primitive);
        }
      }
    }
    const result = {
      format: "render-viewport/1",
      world_id: query.world_id,
      revision: query.revision,
      time_system_id: query.time_system_id,
      generation: generationId,
      algorithmVersion: info.algorithmVersion,
      maxLevel: info.maxLevel,
      bounds: info.bounds,
      level,
      coverage: [query.viewport],
      visibility: {
        policy: "render-visibility/1",
        hasOmitted: tileOmittedCount > 0,
        // Counts are bucket occurrences, not unique Events across replicas.
        counting: "tile-occurrences",
        readCoverage: exclusions.length ? "delta" : "full",
        candidateCount: tileCandidateCount,
        omittedCount: tileOmittedCount,
        budgets: { normal: 64, small: 32, buffer: 32 }
      },
      completeness: tileOmittedCount === 0,
      ...(summary
        ? {
            minLevel: summary.spatialFrame.minLevel,
            spatialFrame: summary.spatialFrame
          }
        : { minLevel: 0, compatibility: "legacy-manifest/1" }),
      primitives: [...primitives.values()].sort((a, b) =>
        a.id.localeCompare(b.id)
      )
    };
    if (Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024)
      return error("render_viewport_too_large", 413);
    return Response.json(result, { headers: noStore });
  } catch (cause) {
    if (cause instanceof Error && cause.message === "invalid_render_query")
      return error(cause.message, 400);
    if (cause instanceof Error && cause.message === "render_viewport_too_large")
      return error(cause.message, 413);
    return error("render_publication_unavailable", 503);
  }
}
