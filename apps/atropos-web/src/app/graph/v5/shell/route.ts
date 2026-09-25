import { z } from "zod";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
import { graphShellViewportQuerySchema } from "../../../../urdr-port/shared/contracts";

export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("collection"),
      world_id: z.string().uuid(),
      revision: z.number().int(),
      collection_id: z.string().uuid()
    })
    .strict(),
  z
    .object({
      kind: z.literal("detail"),
      world_id: z.string().uuid(),
      revision: z.number().int(),
      event_id: z.string().uuid()
    })
    .strict(),
  z
    .object({
      kind: z.literal("viewport"),
      world_id: z.string().uuid(),
      revision: z.number().int(),
      time_system_id: z.string().uuid(),
      collection_ids: z.array(z.string().uuid()).max(8),
      viewport: graphShellViewportQuerySchema
    })
    .strict()
]);

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 16384)
    return Response.json({ error: "query_too_large" }, { status: 413 });
  let parsed;
  try {
    parsed = input.safeParse(JSON.parse(body));
  } catch {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  if (!parsed.success)
    return Response.json({ error: "invalid_query" }, { status: 400 });
  try {
    const query = parsed.data;
    const shell = await v5ShellReader(query.world_id);
    if (shell.pointer.served_revision !== query.revision)
      return Response.json({ error: "revision_changed" }, { status: 409 });
    if (query.kind === "collection")
      return Response.json(await shell.collectionDetail(query.collection_id), {
        headers: { "cache-control": "no-store" }
      });
    if (query.kind === "detail")
      return Response.json(await shell.detail(query.event_id), {
        headers: { "cache-control": "no-store" }
      });
    const shapes: Awaited<
      ReturnType<typeof shell.reader.viewport>
    >["shapes"][number][] = [];
    let cursor: Parameters<typeof shell.reader.selectedViewport>[3] = null;
    if (query.collection_ids.length) {
      for (let page = 0; page < 16; page++) {
        const result = await shell.reader.selectedViewport(
          query.time_system_id,
          query.viewport.bbox,
          [...new Set(query.collection_ids)].sort(),
          cursor
        );
        shapes.push(...result.shapes);
        cursor = result.next_cursor;
        if (!cursor) break;
      }
    }
    const mapped = await Promise.all(shapes.map(shell.shape));
    return Response.json(
      {
        revision: `v5:${query.world_id}:${query.revision}`,
        canonicalRevision: query.revision,
        lodLevel: 0,
        entities: mapped.filter((item) => item.geometryKind !== "region"),
        regions: mapped.filter((item) => item.geometryKind === "region"),
        edges: [],
        diagnostics: [],
        truncated: cursor !== null,
        cache: { stale: false }
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "v5_publication_unavailable" },
      { status: 503 }
    );
  }
}
