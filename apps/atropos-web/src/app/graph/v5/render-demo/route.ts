import { z } from "zod";
import demo from "../../../../lib/v5-render-demo.json";

export const dynamic = "force-dynamic";
const manifest = demo.manifest;
const identity = {
  world_id: z.literal(manifest.worldId),
  revision: z.literal(manifest.revision),
  time_system_id: z.literal(manifest.timeSystemId)
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
                level: z.number().int(),
                x: z.number().int(),
                y: z.number().int(),
                bucket_kind: z.literal("overflow").optional()
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

/** Checked-in, synthetic compiler output; independent of the live World. */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 16 * 1024)
      return Response.json(
        { error: "query_too_large" },
        { status: 413, headers: noStore }
      );
    const parsed = requestSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return Response.json(
        { error: "invalid_query" },
        { status: 400, headers: noStore }
      );
    if (parsed.data.kind === "manifest")
      return Response.json(manifest, { headers: noStore });
    const prefix = `worlds/${manifest.worldId}/revisions/${manifest.revision}/v5/render/${manifest.timeSystemId}/`;
    const assets = parsed.data.assets.map((item) => {
      const key =
        item.kind === "tile"
          ? `${prefix}${item.bucket_kind ? "overflow/" : ""}${item.level}/${item.x}/${item.y}.json`
          : `${prefix}geometry/${item.sha256}.json`;
      const asset = (
        demo.assets as Record<string, { sha256: string; body: unknown }>
      )[key];
      return asset ? { key, ...asset } : null;
    });
    if (assets.some((asset) => !asset))
      return Response.json(
        { error: "asset_not_found" },
        { status: 404, headers: noStore }
      );
    return Response.json(
      { revision: manifest.revision, assets },
      { headers: noStore }
    );
  } catch {
    return Response.json(
      { error: "invalid_query" },
      { status: 400, headers: noStore }
    );
  }
}
