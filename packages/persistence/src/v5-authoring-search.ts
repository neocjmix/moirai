/** Bounded target authoring read. Title matches are supported by the
 * A3-only trigram index, rather than reading a whole World into the app. */
import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { MoiraiDatabase } from "./index.js";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
interface Cursor {
  readonly revision: number;
  readonly signature: string;
  readonly after_id: string;
}
const signature = (worldId: string, text: string) =>
  createHash("sha256")
    .update(JSON.stringify([worldId, text]))
    .digest("hex");

export async function searchV5WorldEvents(
  db: MoiraiDatabase,
  input: {
    readonly world_id: string;
    readonly text: string;
    readonly limit?: number;
    readonly cursor?: string | null;
  }
): Promise<{
  readonly source_revision: number;
  readonly events: readonly {
    readonly id: string;
    readonly title: string;
    readonly summary: string | null;
  }[];
  readonly next_cursor: string | null;
}> {
  const text = input.text?.trim().replace(/\s+/g, " ");
  const limit = input.limit ?? 20;
  if (
    !uuid.test(input.world_id) ||
    !text ||
    [...text].length < 3 ||
    [...text].length > 80 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 25 ||
    (input.cursor != null &&
      (typeof input.cursor !== "string" || input.cursor.length > 512))
  )
    throw Error("v5_search_input_invalid");
  const expected = signature(input.world_id, text);
  let cursor: Cursor | null = null;
  if (input.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(input.cursor))
        throw Error("noncanonical cursor");
      const encoded = Buffer.from(input.cursor, "base64url");
      if (encoded.toString("base64url") !== input.cursor)
        throw Error("noncanonical cursor");
      cursor = JSON.parse(encoded.toString("utf8")) as Cursor;
    } catch {
      throw Error("v5_search_cursor_invalid");
    }
    if (
      cursor.signature !== expected ||
      !Number.isSafeInteger(cursor.revision) ||
      cursor.revision < 1 ||
      !uuid.test(cursor.after_id)
    )
      throw Error("v5_search_cursor_invalid");
  }
  // '!' avoids SQL wildcard interpretation of user-supplied '%' and '_'.
  const pattern = `%${text.replace(/[!%_]/g, (char) => `!${char}`)}%`;
  const afterId = cursor?.after_id ?? "00000000-0000-0000-0000-000000000000";
  // One repeatable-read snapshot binds the returned revision and rows. A
  // subsequent page rejects a changed revision instead of mixing snapshots.
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
      if (!world) throw Error("v5_search_world_missing");
      if (cursor && cursor.revision !== world.current_revision)
        throw Error("v5_search_revision_changed");
      const result = await sql<{
        id: string;
        title: string;
        summary: string | null;
      }>`select id, title, left(summary, 1000) as summary from events
         where world_id = ${input.world_id} and withdrawn_revision is null
           and title ilike ${pattern} escape '!'
           and id > ${afterId}::uuid
         order by id limit ${limit + 1}`.execute(tx);
      const events = result.rows.slice(0, limit);
      const last = events.at(-1);
      return {
        source_revision: world.current_revision,
        events,
        next_cursor:
          result.rows.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  revision: world.current_revision,
                  signature: expected,
                  after_id: last.id
                } satisfies Cursor)
              ).toString("base64url")
            : null
      };
    });
}
