/** Target v5 route. A v4 pointer or an incomplete v5 tree fails closed. */
import { z } from "zod";
import { readV5ServedRoot } from "@moirai/publication/v5";
import { readPublicationObject } from "../../../../lib/publication";
import { createV5StagedAtroposReader } from "../../../../lib/v5-staged-reader";

export const dynamic = "force-dynamic";
const box = z
  .object({
    minX: z.number().finite(),
    maxX: z.number().finite(),
    minY: z.number().finite(),
    maxY: z.number().finite()
  })
  .strict();
const cursor = z
  .object({
    selection_digest: z.string().regex(/^[0-9a-f]{64}$/),
    spatial: z
      .object({
        query_digest: z.string().regex(/^[0-9a-f]{64}$/),
        pending: z
          .array(
            z
              .object({
                key: z.string().max(256),
                level: z.number().int().min(0).max(8),
                offset: z.number().int().min(0).max(127),
                bounds: box
              })
              .strict()
          )
          .min(1)
          .max(2048)
      })
      .strict()
  })
  .strict();
const v5ViewportRequest = z
  .object({
    world_id: z.string().uuid(),
    time_system_id: z
      .string()
      .regex(/^[a-zA-Z0-9-]+$/)
      .max(128),
    viewport: box,
    collection_ids: z.array(z.string().regex(/^[a-zA-Z0-9-]+$/)).max(8),
    cursor: cursor.nullable().optional()
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 64 * 1024)
    return Response.json({ error: "query_too_large" }, { status: 413 });
  const stream = request.body?.getReader();
  if (!stream)
    return Response.json({ error: "invalid_v5_viewport" }, { status: 400 });
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) {
        await stream.cancel();
        return Response.json({ error: "query_too_large" }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let input: unknown;
    try {
      input = JSON.parse(body);
    } catch {
      return Response.json({ error: "invalid_v5_viewport" }, { status: 400 });
    }
    const result = v5ViewportRequest.safeParse(input);
    if (
      !result.success ||
      result.data.viewport.minX > result.data.viewport.maxX ||
      result.data.viewport.minY > result.data.viewport.maxY
    )
      return Response.json({ error: "invalid_v5_viewport" }, { status: 400 });
    const { world_id, time_system_id, viewport, collection_ids, cursor } =
      result.data;
    if (
      collection_ids.some(
        (id, index) => index > 0 && collection_ids[index - 1]! >= id
      )
    )
      return Response.json({ error: "invalid_v5_viewport" }, { status: 400 });
    const store = { get: readPublicationObject };
    const { pointer, rootBody } = await readV5ServedRoot(store, world_id);
    const selected = await createV5StagedAtroposReader(
      store,
      rootBody,
      world_id,
      pointer.served_revision
    ).selectedViewport(
      time_system_id,
      viewport,
      collection_ids,
      cursor ?? null
    );
    return Response.json(
      { world_id, served_revision: pointer.served_revision, ...selected },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (cause) {
    if (
      cause instanceof Error &&
      [
        "v5_viewport_selection_cursor_invalid",
        "v5_viewport_cursor_invalid",
        "v5_viewport_query_invalid",
        "v5_viewport_selection_invalid"
      ].includes(cause.message)
    )
      return Response.json({ error: "invalid_v5_viewport" }, { status: 400 });
    return Response.json(
      { error: "v5_publication_unavailable" },
      { status: 503 }
    );
  }
}
