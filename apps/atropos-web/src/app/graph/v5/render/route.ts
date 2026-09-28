import { z } from "zod";
import { createHash } from "node:crypto";
import { readV5ServedRoot, readV5StagedDocument } from "@moirai/publication/v5";
import { readV5RenderGeneration } from "@moirai/publication/v5";
import { readPublicationObject } from "../../../../lib/publication";

export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const identity = {
  world_id: uuid,
  revision: z.number().int().positive(),
  time_system_id: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/)
    .max(128)
};
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manifest"), ...identity }).strict(),
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
                level: z.number().int().min(0).max(16),
                x: z.number().int().nonnegative(),
                y: z.number().int().nonnegative()
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
        .max(16)
    })
    .strict()
]);
const noStore = { "cache-control": "no-store" };

/** Revision-pinned bridge until direct immutable asset delivery is verified. */
export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024)
    return Response.json(
      { error: "query_too_large" },
      { status: 413, headers: noStore }
    );
  let query: z.infer<typeof requestSchema>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 16 * 1024)
      return Response.json(
        { error: "query_too_large" },
        { status: 413, headers: noStore }
      );
    const parsed = requestSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        { error: "invalid_render_query" },
        { status: 400, headers: noStore }
      );
    query = parsed.data;
  } catch {
    return Response.json(
      { error: "invalid_render_query" },
      { status: 400, headers: noStore }
    );
  }
  try {
    const store = { get: readPublicationObject };
    const { pointer, rootBody } = await readV5ServedRoot(store, query.world_id);
    if (pointer.served_revision !== query.revision)
      return Response.json(
        { error: "revision_changed" },
        { status: 409, headers: noStore }
      );
    const generation = await readV5RenderGeneration(
      store,
      query.world_id
    ).catch((cause: unknown) => {
      if (
        cause instanceof Error &&
        (cause.message === "render_generation_unavailable" ||
          cause.message === "render_generation_source_changed")
      )
        // A canonical revision may advance before its next independent Render
        // generation is ready. Only the current revision's staged sidecar is
        // eligible; never draw the stale generation with newer Event detail.
        return null;
      throw cause;
    });
    const generationRef = generation?.manifests.find(
      (item) => item.timeSystemId === query.time_system_id
    );
    const prefix = generation
      ? `worlds/${query.world_id}/render-generations/${generation.generation}/${query.time_system_id}/`
      : `worlds/${query.world_id}/revisions/${query.revision}/v5/render/${query.time_system_id}/`;
    const get = async (key: string) => (await store.get(key)).body;
    const body = generation
      ? generationRef
        ? await generation.read(generationRef.key, generationRef.sha256)
        : null
      : await readV5StagedDocument(rootBody, `${prefix}manifest.json`, get);
    if (!body)
      return Response.json(
        { error: "render_unavailable" },
        { status: 404, headers: noStore }
      );
    const manifest = JSON.parse(body) as {
      format?: string;
      worldId?: string;
      revision?: number;
      timeSystemId?: string;
      tiles?: { key: string; sha256: string }[];
      geometry?: { key: string; sha256: string }[];
    };
    if (
      manifest.format !== "render-publication/1" ||
      manifest.worldId !== query.world_id ||
      manifest.revision !== query.revision ||
      manifest.timeSystemId !== query.time_system_id ||
      !Array.isArray(manifest.tiles) ||
      !Array.isArray(manifest.geometry)
    )
      throw Error("render_manifest_invalid");
    if (query.kind === "manifest")
      return Response.json(manifest, { headers: noStore });
    const allowed = new Map(
      [...manifest.tiles, ...manifest.geometry].map((ref) => [
        ref.key,
        ref.sha256
      ])
    );
    const assets = [];
    let bytes = 0;
    for (const asset of query.assets) {
      const key =
        asset.kind === "tile"
          ? `${prefix}${asset.level}/${asset.x}/${asset.y}.json`
          : `${prefix}geometry/${asset.sha256}.json`;
      if (
        asset.kind === "tile" &&
        (asset.x >= 2 ** asset.level || asset.y >= 2 ** asset.level)
      )
        return Response.json(
          { error: "invalid_render_query" },
          { status: 400, headers: noStore }
        );
      const digest = allowed.get(key);
      if (!digest)
        return Response.json(
          { error: "render_asset_not_found" },
          { status: 404, headers: noStore }
        );
      const value = generation
        ? await generation.read(key, digest)
        : await readV5StagedDocument(rootBody, key, get);
      if (!value) throw Error("render_asset_missing");
      if (createHash("sha256").update(value).digest("hex") !== digest)
        throw Error("render_manifest_digest_mismatch");
      bytes += Buffer.byteLength(value);
      if (bytes > 4 * 1024 * 1024)
        return Response.json(
          { error: "render_batch_too_large" },
          { status: 413, headers: noStore }
        );
      // The staged index validates content digest; the manifest restricts
      // public asset selection to this Time System and served revision.
      assets.push({ key, sha256: digest, body: JSON.parse(value) });
    }
    return Response.json(
      {
        world_id: query.world_id,
        revision: query.revision,
        time_system_id: query.time_system_id,
        assets
      },
      { headers: noStore }
    );
  } catch {
    return Response.json(
      { error: "render_publication_unavailable" },
      { status: 503, headers: noStore }
    );
  }
}
