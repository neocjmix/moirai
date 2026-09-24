/** Bounded v5 detail/navigation seam. The current v4 pointer cannot enter it. */
import { z } from "zod";
import { readV5ServedRoot } from "@moirai/publication/v5";
import { readPublicationObject } from "../../../../lib/publication";
import { createV5StagedAtroposReader } from "../../../../lib/v5-staged-reader";

export const dynamic = "force-dynamic";
const id = z.string().uuid();
const page = z.number().int().min(0).max(1_000_000);
const common = { world_id: id };
const input = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("event"), event_id: id }).strict(),
  z
    .object({
      ...common,
      kind: z.literal("collection"),
      collection_id: id,
      page
    })
    .strict(),
  z.object({ ...common, kind: z.literal("collections"), page }).strict(),
  z
    .object({ ...common, kind: z.literal("adjacency"), event_id: id, page })
    .strict(),
  z
    .object({ ...common, kind: z.literal("relation"), relation_id: id })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("composite_children"),
      event_id: id,
      page
    })
    .strict()
]);

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024)
    return Response.json({ error: "query_too_large" }, { status: 413 });
  const stream = request.body?.getReader();
  if (!stream)
    return Response.json({ error: "invalid_v5_read" }, { status: 400 });
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024) {
        await stream.cancel();
        return Response.json({ error: "query_too_large" }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return Response.json({ error: "invalid_v5_read" }, { status: 400 });
    }
    const parsed = input.safeParse(raw);
    if (!parsed.success)
      return Response.json({ error: "invalid_v5_read" }, { status: 400 });
    const query = parsed.data;
    let reads = 0;
    const store = {
      get: async (key: string) => {
        if (++reads > 80) throw Error("v5_read_budget_exceeded");
        return readPublicationObject(key);
      }
    };
    const { pointer, rootBody } = await readV5ServedRoot(store, query.world_id);
    const reader = createV5StagedAtroposReader(
      store,
      rootBody,
      query.world_id,
      pointer.served_revision
    );
    const data =
      query.kind === "event"
        ? await reader.event(query.event_id)
        : query.kind === "collection"
          ? await reader.collection(query.collection_id, query.page)
          : query.kind === "collections"
            ? await reader.collections(query.page)
            : query.kind === "adjacency"
              ? await reader.adjacency(query.event_id, query.page)
              : query.kind === "relation"
                ? await reader.relation(query.relation_id)
                : await reader.compositeChildren(query.event_id, query.page);
    if (data === null)
      return Response.json({ error: "not_found" }, { status: 404 });
    const response = JSON.stringify({
      world_id: query.world_id,
      served_revision: pointer.served_revision,
      data
    });
    if (Buffer.byteLength(response) > 256 * 1024)
      throw Error("v5_read_response_budget_exceeded");
    return new Response(response, {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store"
      }
    });
  } catch {
    return Response.json(
      { error: "v5_publication_unavailable" },
      { status: 503 }
    );
  }
}
