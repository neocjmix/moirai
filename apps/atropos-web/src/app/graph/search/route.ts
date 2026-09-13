import { searchGraphReader } from "../../../lib/graph-reader-search";

export async function POST(request: Request) {
  const stream = request.body?.getReader();
  if (!stream)
    return Response.json({ error: "invalid_search" }, { status: 400 });
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await stream.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        await stream.cancel();
        return Response.json({ error: "search_too_large" }, { status: 413 });
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const result = await searchGraphReader(JSON.parse(body));
    if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024)
      return Response.json(
        { error: "search_result_too_large" },
        { status: 413 }
      );
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "search_unavailable" }, { status: 400 });
  }
}
