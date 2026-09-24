/** Revision-pinned, bounded evidence for deciding whether to reuse an Event.
 * This inactive v5 read never replays or materializes a whole World. */
import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { MoiraiDatabase } from "./index.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Cursor = {
  revision: number;
  signature: string;
  relation: string;
  membership: string;
};

export async function getV5EventEvidence(
  db: MoiraiDatabase,
  input: {
    world_id: string;
    event_id: string;
    at_revision: number;
    cursor?: string | null;
  }
) {
  if (
    !uuid.test(input.world_id) ||
    !uuid.test(input.event_id) ||
    !Number.isSafeInteger(input.at_revision) ||
    input.at_revision < 1 ||
    (input.cursor != null &&
      (typeof input.cursor !== "string" || input.cursor.length > 512))
  )
    throw Error("v5_detail_input_invalid");
  const signature = createHash("sha256")
    .update(JSON.stringify([input.world_id, input.event_id]))
    .digest("hex");
  const start = "00000000-0000-0000-0000-000000000000";
  let cursor: Cursor = {
    revision: input.at_revision,
    signature,
    relation: start,
    membership: start
  };
  if (input.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw Error();
      const bytes = Buffer.from(input.cursor, "base64url");
      if (bytes.toString("base64url") !== input.cursor) throw Error();
      cursor = JSON.parse(bytes.toString("utf8")) as Cursor;
      if (
        cursor.signature !== signature ||
        cursor.revision !== input.at_revision ||
        !uuid.test(cursor.relation) ||
        !uuid.test(cursor.membership)
      )
        throw Error();
    } catch {
      throw Error("v5_detail_cursor_invalid");
    }
  }
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      const world = (
        await sql<{
          current_revision: number;
        }>`select current_revision from worlds where id = ${input.world_id} and withdrawn_revision is null`.execute(
          tx
        )
      ).rows[0];
      if (!world) throw Error("v5_detail_world_missing");
      if (world.current_revision !== input.at_revision)
        throw Error("v5_detail_revision_changed");
      const event = (
        await sql<{
          id: string;
          title: string;
          summary: string | null;
          roles: unknown;
        }>`
      select id, title, left(summary, 4000) as summary, roles from events
      where id = ${input.event_id} and world_id = ${input.world_id} and withdrawn_revision is null`.execute(
          tx
        )
      ).rows[0];
      if (!event) throw Error("v5_detail_event_missing");
      const narrative = (
        await sql<{
          id: string;
          title: string | null;
          locale: string;
          body: string;
          body_truncated: boolean;
        }>`
      select id, title, locale, left(body, 12000) as body,
             length(body) > 12000 as body_truncated from narratives
      where world_id = ${input.world_id} and scope_type = 'event'
        and scope_id = ${input.event_id} and withdrawn_revision is null`.execute(
          tx
        )
      ).rows[0];
      if (!narrative) throw Error("v5_detail_narrative_missing");
      const memberships = (
        await sql<{ id: string; collection_id: string; title: string }>`
      select m.id, c.id as collection_id, c.title from collection_event_memberships m
      join collections c on c.id = m.collection_id and c.world_id = ${input.world_id} and c.withdrawn_revision is null
      where m.world_id = ${input.world_id} and m.event_id = ${input.event_id}
        and m.withdrawn_revision is null and m.id > ${cursor.membership}::uuid
      order by m.id limit 17`.execute(tx)
      ).rows;
      const relations = (
        await sql<{
          id: string;
          type: string;
          source_ref: unknown;
          target_ref: unknown;
          direction: string;
          attributes: unknown;
          attributes_truncated: boolean;
        }>`
      select id, type, source_ref, target_ref, direction,
        case when octet_length(attributes::text) <= 2048 then attributes else '{}'::jsonb end as attributes,
        octet_length(attributes::text) > 2048 as attributes_truncated
      from relations where world_id = ${input.world_id} and withdrawn_revision is null
        and id > ${cursor.relation}::uuid
        and (source_ref->>'event_id' = ${input.event_id} or target_ref->>'event_id' = ${input.event_id})
      order by id limit 17`.execute(tx)
      ).rows;
      const membershipPage = memberships.slice(0, 16);
      const relationPage = relations.slice(0, 16);
      const neighborIds = [
        ...new Set(
          relationPage.flatMap((relation) =>
            [relation.source_ref, relation.target_ref].flatMap((ref) => {
              if (!ref || typeof ref !== "object") return [];
              const id = (ref as { event_id?: unknown }).event_id;
              return typeof id === "string" &&
                uuid.test(id) &&
                id !== input.event_id
                ? [id]
                : [];
            })
          )
        )
      ];
      const neighbors = neighborIds.length
        ? (
            await sql<{
              id: string;
              title: string;
              summary: string | null;
            }>`select id, title, left(summary, 1000) as summary from events
        where world_id = ${input.world_id} and withdrawn_revision is null
          and id in (${sql.join(neighborIds.map((id) => sql`${id}::uuid`))})
        order by id limit 32`.execute(tx)
          ).rows
        : [];
      const moreMemberships = memberships.length > 16;
      const moreRelations = relations.length > 16;
      const next_cursor =
        moreMemberships || moreRelations
          ? Buffer.from(
              JSON.stringify({
                revision: input.at_revision,
                signature,
                membership: membershipPage.at(-1)?.id ?? cursor.membership,
                relation: relationPage.at(-1)?.id ?? cursor.relation
              } satisfies Cursor)
            ).toString("base64url")
          : null;
      return {
        source_revision: world.current_revision,
        event,
        narrative,
        memberships: membershipPage,
        relations: relationPage,
        neighbors,
        next_cursor
      };
    });
}
