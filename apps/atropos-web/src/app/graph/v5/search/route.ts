import {
  readV5ShellRequest,
  v5ShellResponse
} from "../../../../lib/v5-shell-request";
import { z } from "zod";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
import type { GraphSearchMatch } from "../../../../lib/moirai-graph-source-query";

export const dynamic = "force-dynamic";
const input = z.object({
  term: z.string().max(512),
  cursor: z.number().int().min(0).max(4096),
  state: z.object({
    query: z.object({
      entity_filter: z
        .object({
          event_kinds: z.array(z.enum(["atomic", "composite"])),
          roles: z.array(z.string()),
          include_narratives: z.boolean()
        })
        .optional(),
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
    const query = input.parse(await readV5ShellRequest(request));
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
      const filter = query.state.query.entity_filter;
      if (
        filter &&
        (!filter.event_kinds.includes(
          item.composite ? "composite" : "atomic"
        ) ||
          (filter.roles.length &&
            !filter.roles.some((role) => item.event.roles.includes(role))))
      )
        continue;
      if (
        term &&
        !`${item.event.title} ${item.event.summary ?? ""} ${filter?.include_narratives === false ? "" : item.narrative.body}`
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
    return v5ShellResponse({
      matches,
      nextCursor: hasMore ? query.cursor + ids.length : null
    });
  } catch {
    return Response.json({ error: "v5_search_unavailable" }, { status: 400 });
  }
}
