import {
  readV5ShellRequest,
  v5ShellResponse
} from "../../../../lib/v5-shell-request";
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
      collection_id: z.string().uuid(),
      page: z.number().int().min(0).max(1000000).default(0)
    })
    .strict(),
  z
    .object({
      kind: z.literal("detail"),
      world_id: z.string().uuid(),
      revision: z.number().int(),
      event_id: z.string().uuid(),
      page: z.number().int().min(0).max(1000000).default(0)
    })
    .strict(),
  z
    .object({
      kind: z.literal("viewport"),
      world_id: z.string().uuid(),
      revision: z.number().int(),
      time_system_id: z.string().uuid(),
      collection_ids: z.array(z.string().uuid()).max(8),
      relation_types: z.array(z.string().max(64)).max(32).optional(),
      viewport: graphShellViewportQuerySchema
    })
    .strict()
]);

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = input.safeParse(await readV5ShellRequest(request));
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
      return Response.json(
        await shell.collectionDetail(query.collection_id, query.page),
        {
          headers: { "cache-control": "no-store" }
        }
      );
    if (query.kind === "detail")
      return v5ShellResponse(await shell.detail(query.event_id, query.page));
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
    const connections = await shell.edges(mapped);
    return v5ShellResponse({
      revision: query.revision,
      canonicalRevision: query.revision,
      lodLevel: 0,
      entities: mapped.filter((item) => item.geometryKind !== "region"),
      regions: mapped.filter((item) => item.geometryKind === "region"),
      edges: query.relation_types
        ? connections.edges.filter((edge) =>
            query.relation_types!.includes(edge.label)
          )
        : connections.edges,
      diagnostics: [],
      truncated: cursor !== null || connections.truncated,
      cache: { stale: false }
    });
  } catch {
    return Response.json(
      { error: "v5_publication_unavailable" },
      { status: 503 }
    );
  }
}
