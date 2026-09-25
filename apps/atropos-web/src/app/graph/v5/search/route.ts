import { z } from "zod";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
import type { GraphSearchMatch } from "../../../../lib/moirai-graph-source-query";

export const dynamic = "force-dynamic";
const input = z.object({
  term: z.string().max(512),
  cursor: z.number().int().min(0).max(4096),
  state: z.object({
    query: z.object({
      sources: z
        .array(
          z.object({
            world_id: z.string().uuid(),
            served_revision: z.number().int(),
            canon_ids: z.array(z.string().uuid()).max(8)
          })
        )
        .max(1)
    })
  })
});

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 16384)
      return Response.json({ error: "query_too_large" }, { status: 413 });
    const query = input.parse(JSON.parse(body));
    const source = query.state.query.sources[0];
    if (!source?.canon_ids.length)
      return Response.json({ matches: [], nextCursor: null });
    const shell = await v5ShellReader(source.world_id);
    if (shell.pointer.served_revision !== source.served_revision)
      throw Error("revision_changed");
    const collections = [...new Set(source.canon_ids)].sort();
    let cursor: Parameters<typeof shell.reader.selectedEvents>[1] = null;
    let skipped = 0;
    let ids: readonly string[] = [];
    let hasMore = false;
    do {
      const page = await shell.reader.selectedEvents(collections, cursor);
      cursor = page.next_cursor;
      if (skipped + page.event_ids.length > query.cursor) {
        const offset = query.cursor - skipped;
        ids = page.event_ids.slice(offset, offset + 20);
        hasMore =
          offset + ids.length < page.event_ids.length || cursor !== null;
        break;
      }
      skipped += page.event_ids.length;
    } while (cursor);
    if (ids.length > 0 && ids.length < 20 && cursor) {
      const following = await shell.reader.selectedEvents(collections, cursor);
      const take = 20 - ids.length;
      ids = [...ids, ...following.event_ids.slice(0, take)];
      hasMore =
        following.event_ids.length > take || following.next_cursor !== null;
    }
    const catalog = await shell.reader.collections(0);
    const allCollections = catalog.collections.map(
      (collection) => collection.id
    );
    const term = query.term.trim().toLocaleLowerCase();
    const matches: GraphSearchMatch[] = [];
    for (const id of ids) {
      const item = await shell.event(id);
      if (!item) throw Error("event_missing");
      if (
        term &&
        !`${item.event.title} ${item.event.summary ?? ""} ${item.narrative.body}`
          .toLocaleLowerCase()
          .includes(term)
      )
        continue;
      const memberships = await shell.memberships(id, allCollections);
      matches.push({
        identity: id,
        kind: "event",
        worldId: source.world_id,
        title: { ko: item.event.title, en: item.event.title },
        description: {
          ko: item.event.summary ?? "",
          en: item.event.summary ?? ""
        },
        canonMemberships: memberships,
        matchedCanonIds: memberships.filter((id) => collections.includes(id)),
        persisted: true,
        eventKind: item.composite ? "composite" : "atomic",
        roles: item.event.roles,
        reference: {
          kind: "event",
          world_id: source.world_id,
          served_revision: source.served_revision,
          canon_id: memberships.find((id) => collections.includes(id))!,
          event_ref: { kind: "event", event_id: id }
        }
      });
    }
    return Response.json(
      { matches, nextCursor: hasMore ? query.cursor + ids.length : null },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "v5_search_unavailable" }, { status: 400 });
  }
}
