import type { ClothoMethod } from "@moirai/contracts";

export class ClothoClientError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly recovery?: unknown,
    readonly details?: {
      readonly path?: string;
      readonly affected_ids: readonly string[];
    }
  ) {
    super(code);
  }
}
export interface ClientConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
}
export async function callClotho(
  config: ClientConfig,
  method: ClothoMethod,
  input: unknown
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new ClothoClientError("invalid_endpoint");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new ClothoClientError("invalid_endpoint");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(config.token))
    throw new ClothoClientError("credential_required");
  const body = JSON.stringify(input);
  if (
    !body ||
    Buffer.byteLength(body) > 1_048_576 ||
    body.includes(config.token)
  )
    throw new ClothoClientError("invalid_input");
  try {
    const response = await fetch(new URL(`/v1/clotho/${method}`, url), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json"
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(config.timeoutMs ?? 30_000)
    });
    if (!response.body) throw new ClothoClientError("invalid_response");
    let text = "",
      bytes = 0;
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 4_194_304)
          throw new ClothoClientError("response_budget_exceeded");
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    text += decoder.decode();
    if (text.includes(config.token))
      throw new ClothoClientError("unsafe_response");
    const result = JSON.parse(text) as {
      error?: {
        code?: unknown;
        retryable?: unknown;
        recovery?: unknown;
        path?: unknown;
        affected_ids?: unknown;
      };
      result?: unknown;
    };
    if (!response.ok) {
      const code =
        typeof result.error?.code === "string" &&
        /^[a-z_]{1,80}$/.test(result.error.code)
          ? result.error.code
          : "request_failed";
      // Do not reflect arbitrary server error text or data into CLI diagnostics.
      const raw = result.error?.recovery as
        { action?: unknown; current_revision?: unknown } | undefined;
      const recovery =
        raw?.action === "refresh_context" &&
        Number.isSafeInteger(raw.current_revision)
          ? {
              action: "refresh_context",
              current_revision: raw.current_revision
            }
          : undefined;
      throw new ClothoClientError(
        code,
        result.error?.retryable === true,
        recovery,
        {
          ...(typeof result.error?.path === "string" &&
          /^[a-zA-Z0-9_.[\]-]{1,200}$/.test(result.error.path)
            ? { path: result.error.path }
            : {}),
          affected_ids: Array.isArray(result.error?.affected_ids)
            ? result.error.affected_ids
                .filter(
                  (id): id is string =>
                    typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)
                )
                .slice(0, 500)
            : []
        }
      );
    }
    if (!("result" in result)) throw new ClothoClientError("invalid_response");
    return result;
  } catch (error) {
    if (error instanceof ClothoClientError) throw error;
    throw new ClothoClientError("transport_or_response_error", true);
  }
}
