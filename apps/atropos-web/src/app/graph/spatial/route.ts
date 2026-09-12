import { graphSpatialQueryContext } from "../../../lib/graph-spatial-query";
import {
  moiraiSpatialReader,
  spatialRequestSchema
} from "../../../lib/moirai-spatial";
const MAX_BODY_BYTES = 64 * 1024;
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return Response.json({ error: "query_too_large" }, { status: 413 });
  // Bound chunked requests as well as declared Content-Length.
  const stream = request.body?.getReader();
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  if (!stream)
    return Response.json({ error: "invalid_spatial_request" }, { status: 400 });
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await stream.cancel();
        return Response.json({ error: "query_too_large" }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const parsed = spatialRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        { error: "invalid_spatial_request" },
        { status: 400 }
      );
    const context = parsed.data.state
      ? await graphSpatialQueryContext(parsed.data.state)
      : null;
    if (
      context &&
      JSON.stringify(
        context.state.query.sources.map((s) => [
          s.world_id,
          s.served_revision,
          s.canon_ids
        ])
      ) !==
        JSON.stringify(
          parsed.data.sources.map((s) => [
            s.world_id,
            s.served_revision,
            s.canon_ids
          ])
        )
    )
      throw Error("spatial_query_source_mismatch");
    const result = await moiraiSpatialReader.viewport({
      ...parsed.data,
      ...(context
        ? { accept: (entity: { id: string }) => context.ids.has(entity.id) }
        : {})
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { error: "invalid_or_unavailable_spatial_query" },
      { status: 400 }
    );
  }
}
