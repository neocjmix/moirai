import { graphSpatialDetail } from "../../../lib/graph-spatial-detail";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return Response.json({ error: "query_too_large" }, { status: 413 });
  const stream = request.body?.getReader();
  if (!stream)
    return Response.json({ error: "invalid_detail_request" }, { status: 400 });
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await stream.cancel();
        return Response.json({ error: "query_too_large" }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const value = JSON.parse(body);
    if (typeof value.id !== "string" || value.id.length > 4096)
      throw Error("invalid_identity");
    const detail = await graphSpatialDetail(value.state, value.id);
    if (Buffer.byteLength(JSON.stringify(detail)) > 1024 * 1024)
      return Response.json(
        { error: "detail_budget_exceeded" },
        { status: 413 }
      );
    return Response.json(detail, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { error: "selected_detail_unavailable" },
      { status: 404 }
    );
  }
}
