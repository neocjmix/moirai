import { v5ViewportCursorSchema } from "./v5-viewport-cursor";

export const V5_SHELL_QUERY_MAX_BYTES = 16 * 1024;
export const V5_SHELL_RESPONSE_MAX_BYTES = 1024 * 1024;

/** Bound the public adapter request before materializing JSON. */
export async function readV5ShellRequest(
  request: Request,
  options: { allowViewportContinuation?: boolean } = {}
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("invalid_query");
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  // A server-issued continuation fits in the existing response budget. Allow
  // that cursor to return without expanding the query or page-work budgets.
  const maximum =
    V5_SHELL_QUERY_MAX_BYTES +
    (options.allowViewportContinuation ? V5_SHELL_RESPONSE_MAX_BYTES : 0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel();
      throw Error("query_too_large");
    }
    body += decoder.decode(value, { stream: true });
  }
  const query: unknown = JSON.parse(body + decoder.decode());
  if (bytes > V5_SHELL_QUERY_MAX_BYTES) {
    if (
      !query ||
      typeof query !== "object" ||
      !("kind" in query) ||
      query.kind !== "viewport" ||
      !("cursor" in query) ||
      !v5ViewportCursorSchema.safeParse(query.cursor).success ||
      Buffer.byteLength(JSON.stringify(query.cursor)) >
        V5_SHELL_RESPONSE_MAX_BYTES ||
      Buffer.byteLength(JSON.stringify({ ...query, cursor: null })) >
        V5_SHELL_QUERY_MAX_BYTES
    )
      throw Error("query_too_large");
  }
  return query;
}

export function v5ShellResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > V5_SHELL_RESPONSE_MAX_BYTES)
    throw Error("response_too_large");
  return new Response(body, {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
