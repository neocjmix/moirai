import type { ClothoMethod, PublicEvent } from "@moirai/contracts";
import { ChangeSetError, stableStringify } from "@moirai/domain";
import { createHash } from "node:crypto";
import {
  getPublicationStatus,
  readWorldAtRevision,
  type MoiraiDatabase,
  type RevisionView
} from "./index.js";

type Input = Record<string, unknown>;
interface Cursor {
  signature: string;
  revision: number;
  events: number;
  relations: number;
  chars: number;
  times: number;
  placements: number;
}
function error(code: string, path: string): never {
  throw new ChangeSetError(
    code,
    path,
    "Requested context is unavailable or invalid"
  );
}
function cursorFor(
  method: string,
  input: Input,
  allowedWorlds: readonly string[] | null
): Cursor {
  const { cursor, at_revision, ...rest } = input;
  const signature = createHash("sha256")
    .update(stableStringify({ method, input: rest, allowedWorlds }))
    .digest("hex");
  if (!cursor)
    return {
      signature,
      revision: Number(at_revision ?? 0),
      events: 0,
      relations: 0,
      chars: 0,
      times: 0,
      placements: 0
    };
  try {
    const value = JSON.parse(
      Buffer.from(String(cursor), "base64url").toString("utf8")
    ) as Cursor;
    if (
      value.signature !== signature ||
      [
        value.revision,
        value.events,
        value.relations,
        value.chars,
        value.times,
        value.placements
      ].some((n) => !Number.isSafeInteger(n) || n < 0) ||
      (at_revision !== undefined && value.revision !== at_revision)
    )
      error("invalid_cursor", "cursor");
    return value;
  } catch {
    return error("invalid_cursor", "cursor");
  }
}
function encode(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function find<T extends { id: string }>(
  items: readonly T[],
  id: unknown,
  path: string
): T {
  const value = items.find((item) => item.id === id);
  if (!value) return error("not_found", path);
  return value;
}
function page<T>(items: readonly T[], cursor: Cursor, limit: number) {
  const result = items.slice(cursor.events, cursor.events + limit);
  const next = cursor.events + result.length;
  return {
    items: result,
    source_revision: cursor.revision,
    next_cursor:
      next < items.length ? encode({ ...cursor, events: next }) : null,
    truncated: next < items.length
  };
}
function graph(
  view: RevisionView,
  seeds: readonly string[],
  canons: readonly string[],
  input: Input,
  cursor: Cursor
) {
  const depth = Number(input.depth ?? 1);
  const types = input.relation_types as string[] | undefined;
  const direction = String(input.direction ?? "both");
  const events = view.events.filter((event) => canons.includes(event.canon_id));
  for (const seed of seeds) find(events, seed, "seed_ids");
  const relations = view.relations.filter(
    (relation) =>
      canons.includes(relation.canon_id) &&
      (!types || types.includes(relation.type))
  );
  const reached = new Set(seeds);
  let frontier = new Set(seeds);
  for (let hop = 0; hop < depth; hop++) {
    const next = new Set<string>();
    for (const relation of relations) {
      if (
        (direction !== "incoming" || relation.direction === "undirected") &&
        frontier.has(relation.source_event_id)
      )
        next.add(relation.target_event_id);
      if (
        (direction !== "outgoing" || relation.direction === "undirected") &&
        frontier.has(relation.target_event_id)
      )
        next.add(relation.source_event_id);
    }
    frontier = new Set([...next].filter((id) => !reached.has(id)));
    for (const id of frontier) reached.add(id);
  }
  const selectedEvents = events
    .filter((event) => reached.has(event.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const selectedRelations = relations
    .filter(
      (relation) =>
        reached.has(relation.source_event_id) &&
        reached.has(relation.target_event_id)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const selectedNarratives = view.narratives
    .filter(
      (n) =>
        canons.includes(n.canon_id) &&
        (n.scope_type === "canon" || reached.has(n.scope_id))
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const eventLimit = Number(input.max_events ?? 25),
    relationLimit = Number(input.max_relations ?? 50),
    charLimit = Number(input.max_narrative_chars ?? 8000);
  const eventPage = selectedEvents.slice(
    cursor.events,
    cursor.events + eventLimit
  );
  const relationPage = selectedRelations.slice(
    cursor.relations,
    cursor.relations + relationLimit
  );
  let position = 0,
    consumed = 0;
  const narrativePage: Array<{
    id: string;
    scope_id: string;
    scope_type: string;
    locale: string;
    body: string;
    offset: number;
    complete: boolean;
  }> = [];
  for (const narrative of selectedNarratives) {
    const start = Math.max(0, cursor.chars - position);
    const available = Math.max(0, charLimit - consumed);
    if (
      start < narrative.body.length &&
      available > 0 &&
      narrativePage.length < 100
    ) {
      const body = narrative.body.slice(start, start + available);
      narrativePage.push({
        id: narrative.id,
        scope_id: narrative.scope_id,
        scope_type: narrative.scope_type,
        locale: narrative.locale,
        body,
        offset: start,
        complete: start === 0 && body.length === narrative.body.length
      });
      consumed += body.length;
    }
    position += narrative.body.length;
  }
  const placements = view.temporalPlacements
    .filter((p) => reached.has(p.event_id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const timeIds = new Set([
    ...placements.map((p) => p.time_system_id),
    ...view.canonTimeSystems
      .filter((l) => canons.includes(l.canon_id))
      .map((l) => l.time_system_id)
  ]);
  const times = view.timeSystems
    .filter((t) => timeIds.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const timePage = times.slice(cursor.times, cursor.times + 20);
  const placementPage = placements.slice(
    cursor.placements,
    cursor.placements + 100
  );
  const next = {
    ...cursor,
    events: cursor.events + eventPage.length,
    relations: cursor.relations + relationPage.length,
    chars: cursor.chars + consumed,
    times: cursor.times + timePage.length,
    placements: cursor.placements + placementPage.length
  };
  const truncated =
    next.events < selectedEvents.length ||
    next.relations < selectedRelations.length ||
    next.chars < position ||
    next.times < times.length ||
    next.placements < placements.length;
  const boundary = relations.some(
    (r) => reached.has(r.source_event_id) !== reached.has(r.target_event_id)
  );
  return {
    source_revision: cursor.revision,
    world: view.world,
    canons: view.canons
      .filter((c) => canons.includes(c.id))
      .map((c) => ({ id: c.id, title: c.title })),
    seed_ids: seeds,
    events: eventPage,
    relations: relationPage,
    narratives: narrativePage,
    time_systems: timePage,
    temporal_placements: placementPage,
    containment_paths: relationPage
      .filter((r) => r.type === "contains")
      .map((r) => [r.source_event_id, r.target_event_id]),
    truncated,
    depth_boundary: boundary,
    next_cursor: truncated ? encode(next) : null,
    returned_scope: "bounded_neighborhood",
    warnings: [],
    totals: {
      events: selectedEvents.length,
      relations: selectedRelations.length,
      narrative_chars: position
    }
  };
}

export async function queryClotho(
  db: MoiraiDatabase,
  method: ClothoMethod,
  input: Input,
  allowedWorlds: readonly string[] | null
): Promise<unknown> {
  const cursor = cursorFor(method, input, allowedWorlds);
  const limit = Number(input.limit ?? 25);
  if (method === "world.list") {
    if (allowedWorlds?.length === 0)
      return { items: [], next_cursor: null, truncated: false };
    let query = db
      .selectFrom("worlds")
      .select(["id", "slug", "title", "description", "current_revision"])
      .where("withdrawn_revision", "is", null);
    if (allowedWorlds) query = query.where("id", "in", [...allowedWorlds]);
    if (input.query)
      query = query.where(
        "title",
        "ilike",
        `%${String(input.query).replace(/[\\%_]/g, "\\$&")}%`
      );
    const rows = await query
      .orderBy("id")
      .offset(cursor.events)
      .limit(limit + 1)
      .execute();
    return {
      items: rows.slice(0, limit),
      truncated: rows.length > limit,
      next_cursor:
        rows.length > limit
          ? encode({ ...cursor, events: cursor.events + limit })
          : null
    };
  }
  const worldId = String(input.world_id);
  if (allowedWorlds && !allowedWorlds.includes(worldId))
    return error("forbidden", "world_id");
  const status = await getPublicationStatus(db, worldId);
  if (!status) return error("not_found", "world_id");
  cursor.revision ||= status.currentRevision;
  if (cursor.revision > status.currentRevision)
    return error("invalid_revision", "at_revision");
  const view = await readWorldAtRevision(db, worldId, cursor.revision);
  if (method === "world.get") {
    const result = page(
      [...view.timeSystems].sort((a, b) => a.id.localeCompare(b.id)),
      cursor,
      limit
    );
    return {
      world: view.world,
      publication: status,
      canon_count: view.canons.length,
      ...result
    };
  }
  if (method === "canon.list")
    return page(
      [...view.canons].sort((a, b) => a.id.localeCompare(b.id)),
      cursor,
      limit
    );
  if (method === "canon.get") {
    const canon = find(view.canons, input.canon_id, "canon_id");
    return {
      canon,
      event_count: view.events.filter((e) => e.canon_id === canon.id).length,
      ...graph(view, [], [canon.id], input, cursor)
    };
  }
  if (method === "event.search") {
    find(view.canons, input.canon_id, "canon_id");
    const query = String(input.query).toLocaleLowerCase("en");
    const items = view.events
      .filter(
        (e) =>
          e.canon_id === input.canon_id &&
          [
            e.title,
            e.summary ?? "",
            ...view.narratives
              .filter((n) => n.scope_type === "event" && n.scope_id === e.id)
              .map((n) => `${n.title ?? ""} ${n.body}`)
          ]
            .join(" ")
            .toLocaleLowerCase("en")
            .includes(query)
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return page(items, cursor, limit);
  }
  if (method === "event.get" || method === "event.neighbors") {
    const event = find<PublicEvent>(view.events, input.event_id, "event_id");
    if (method === "event.get")
      return {
        event,
        ...graph(
          view,
          [event.id],
          [event.canon_id],
          { ...input, depth: 0 },
          cursor
        )
      };
    return graph(view, [event.id], [event.canon_id], input, cursor);
  }
  if (method === "context.slice") {
    const canons = input.canon_ids as string[];
    for (const canon of canons) find(view.canons, canon, "canon_ids");
    return graph(view, input.seed_ids as string[], canons, input, cursor);
  }
  return error("unsupported_method", "method");
}
