import { getPublicStatus } from "../../lib/status";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(request: Request): Promise<Response> {
  const status = await getPublicStatus();
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") ?? false;

  if (!acceptsHtml) {
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  }

  const json = escapeHtml(JSON.stringify(status, null, 2));
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moirai status</title><style>body{font-family:ui-monospace,monospace;margin:0;background:#101218;color:#ecedf2}main{max-width:48rem;margin:auto;padding:2rem 1rem}a{color:#a6c8ff}pre{overflow:auto;padding:1rem;border:1px solid #343844;border-radius:.75rem;background:#171a22;white-space:pre-wrap}</style></head><body><main><h1>Moirai status</h1><p>Public allowlist metadata only.</p><pre>${json}</pre><p><a href="/">Atropos</a> · <a href="/health">Health</a></p></main></body></html>`,
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
}
