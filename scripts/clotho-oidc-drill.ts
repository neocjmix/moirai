import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const endpoint =
  "https://desirable-vitality-production-eb95.up.railway.app/mcp";
const metadata = new URL("/.well-known/oauth-protected-resource/mcp", endpoint);
const worldId = "01995c2a-7b00-7000-8000-000000000101";
type Phase = "baseline" | "blocked" | "restored";
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

// The server authenticates the JWT. This local check only prevents an expired
// token from being mistaken for evidence of emergency revocation.
function expiration(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) throw new Error();
    const exp = object(
      JSON.parse(Buffer.from(parts[1], "base64url").toString())
    ).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) throw new Error();
    return exp;
  } catch {
    throw new Error("An injected OAuth JWT with an expiry is required");
  }
}

export function createDrill(
  token: string,
  request: typeof fetch = fetch,
  now: () => number = Date.now
) {
  const expires = expiration(token);
  let next: Phase | "complete" = "baseline";
  let busy = false;
  const ensureLifetime = () => {
    if (expires * 1000 - now() < 120_000)
      throw new Error(
        "Token lifetime is insufficient; restore OIDC before restarting"
      );
  };
  async function json(url: string | URL, init: RequestInit = {}) {
    try {
      const response = await request(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(10_000)
      });
      const text = await response.text();
      if (text.length > 1_048_576) throw new Error();
      return { status: response.status, body: object(JSON.parse(text)) };
    } catch {
      // Never expose response bodies, request headers, tokens or provider errors.
      throw new Error("Probe transport failed; no evidence recorded");
    }
  }
  return {
    async probe(phase: Phase) {
      if (busy || phase !== next)
        throw new Error("Probe phase is out of order");
      busy = true;
      try {
        ensureLifetime();
        const discovery = await json(metadata);
        const disabled =
          discovery.status === 503 &&
          discovery.body.error === "oauth_not_configured";
        const enabled =
          discovery.status === 200 && discovery.body.resource === endpoint;
        if (phase === "blocked" ? !disabled : !enabled)
          throw new Error("OIDC metadata does not match the requested phase");
        const result = await json(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "world_get", arguments: { world_id: worldId } }
          })
        });
        ensureLifetime();
        if (phase === "blocked") {
          if (result.status !== 401)
            throw new Error("Expected HTTP 401 was not observed");
          next = "restored";
          return {
            phase,
            http_status: 401,
            complete: false,
            restoration_required: true
          };
        }
        const envelope = object(result.body.result);
        const content = object(object(envelope.structuredContent).result);
        const publication = object(content.publication);
        const revision = publication.currentRevision;
        if (
          result.status !== 200 ||
          result.body.error ||
          envelope.isError ||
          object(content.world).id !== worldId ||
          !Number.isInteger(revision)
        )
          throw new Error(
            "Authenticated synthetic World read was not confirmed"
          );
        next = phase === "baseline" ? "blocked" : "complete";
        return {
          phase,
          http_status: 200,
          revision,
          complete: next === "complete",
          same_token: true,
          restoration_required: false
        };
      } finally {
        busy = false;
      }
    }
  };
}

async function main() {
  const token = process.env.CLOTHO_OAUTH_TOKEN ?? "";
  delete process.env.CLOTHO_OAUTH_TOKEN;
  const drill = createDrill(token);
  const input = createInterface({ input: process.stdin, terminal: false });
  console.log(
    JSON.stringify({
      ready: true,
      commands: ["baseline", "blocked", "restored", "quit"]
    })
  );
  for await (const line of input) {
    if (line === "quit") break;
    if (line !== "baseline" && line !== "blocked" && line !== "restored") {
      console.log(JSON.stringify({ error: "Unknown phase" }));
      continue;
    }
    try {
      const result = await drill.probe(line);
      console.log(JSON.stringify(result));
      if (result.complete) break;
    } catch (error) {
      console.log(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Probe failed"
        })
      );
    }
  }
  input.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error("OAuth drill could not start; check secure token injection");
    process.exitCode = 1;
  });
