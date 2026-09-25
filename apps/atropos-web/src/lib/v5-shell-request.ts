/** Bound the public adapter request before materializing JSON. */
export async function readV5ShellRequest(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("invalid_query");
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) {
      await reader.cancel();
      throw Error("query_too_large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

export function v5ShellResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 1024 * 1024) throw Error("response_too_large");
  return new Response(body, {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
