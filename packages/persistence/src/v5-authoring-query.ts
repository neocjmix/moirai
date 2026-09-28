/** Bounded current-revision authoring reads. Never replay an entire World for
 * discovery. Cursors pin the revision and complete query, and reject drift. */
import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { PublicTimeSystem } from "@moirai/contracts";
import type { V5ReadMethod } from "@moirai/contracts/v5-wire";
import {
  ChangeSetError,
  resolveTimeEvent,
  temporalAdapterRegistry,
  stableStringify
} from "@moirai/domain";
import type { MoiraiDatabase } from "./index.js";
import { readActiveV5State } from "./v5-read.js";

const zero = "00000000-0000-0000-0000-000000000000";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (code: string, path: string): never => {
  throw new ChangeSetError(code, path, code);
};
export async function queryV5Authoring(
  db: MoiraiDatabase,
  method: V5ReadMethod,
  input: Record<string, unknown>,
  allowedWorlds: readonly string[]
) {
  const worldId = String(input.world_id ?? "");
  if (method !== "world.list" && !allowedWorlds.includes(worldId))
    fail("forbidden", "world_id");
  const signature = createHash("sha256")
    .update(
      stableStringify({
        method,
        input: { ...input, cursor: undefined },
        worlds: [...allowedWorlds].sort()
      })
    )
    .digest("hex");
  let after = zero,
    pinned = Number(input.at_revision ?? 0);
  if (input.cursor) {
    try {
      const cursor = JSON.parse(
        Buffer.from(String(input.cursor), "base64url").toString("utf8")
      );
      if (
        cursor.signature !== signature ||
        !uuid.test(cursor.after) ||
        !Number.isSafeInteger(cursor.revision) ||
        cursor.revision < 0
      )
        throw Error();
      after = cursor.after;
      pinned = cursor.revision;
    } catch {
      fail("invalid_cursor", "cursor");
    }
  }
  const limit = Number(input.limit ?? 25);
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`set local statement_timeout = '10s'`.execute(tx);
      const page = <T extends { id: string }>(rows: T[], revision: number) => {
        const items = rows.slice(0, limit);
        return {
          items,
          source_revision: revision,
          budget: { limit },
          truncated: rows.length > limit,
          continuation:
            rows.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    signature,
                    revision,
                    after: items.at(-1)!.id
                  })
                ).toString("base64url")
              : null
        };
      };
      if (method === "world.list") {
        if (!allowedWorlds.length) return page([], 0);
        const pattern = `%${String(input.query ?? "").replace(/[\\%_]/g, "\\$&")}%`;
        const rows = (
          await sql<{
            id: string;
            current_revision: number;
          }>`select id,slug,title,description,current_revision,publication_target_revision from worlds where id in (${sql.join(allowedWorlds)}) and withdrawn_revision is null and id > ${after} and title ilike ${pattern} order by id limit ${limit + 1}`.execute(
            tx
          )
        ).rows;
        // World discovery is a catalogue; each returned World carries its own revision.
        return { ...page(rows, 0), revision_scope: "per_world" };
      }
      const world = (
        await sql<{
          id: string;
          current_revision: number;
        }>`select w.id,w.slug,w.title,w.description,w.current_revision,w.publication_target_revision,coalesce(p.served_revision,0) as served_revision from worlds w left join world_publication_state p on p.world_id=w.id where w.id=${worldId} and w.withdrawn_revision is null`.execute(
          tx
        )
      ).rows[0];
      if (!world) return fail("world_missing", "world_id");
      if (pinned && pinned !== world.current_revision)
        throw new ChangeSetError(
          "revision_conflict",
          "at_revision",
          "Restart context at the current revision",
          [worldId],
          true,
          {
            action: "refresh_context",
            current_revision: world.current_revision
          }
        );
      const revision = world.current_revision;
      if (method === "world.get") return { source_revision: revision, world };
      if (method === "collection.list")
        return page(
          (
            await sql<{
              id: string;
            }>`select id,world_id,slug,title,description from collections where world_id=${worldId} and withdrawn_revision is null and id>${after} order by id limit ${limit + 1}`.execute(
              tx
            )
          ).rows,
          revision
        );
      if (method === "collection.get") {
        const collection = (
          await sql<{
            id: string;
          }>`select id,world_id,slug,title,description from collections where id=${String(input.collection_id)} and world_id=${worldId} and withdrawn_revision is null`.execute(
            tx
          )
        ).rows[0];
        if (!collection) return fail("not_found", "collection_id");
        const narrative = (
          await sql`select id,scope_type,scope_id,locale,title,body,public_references,notes from narratives where world_id=${worldId} and scope_type='collection' and scope_id=${collection.id} and withdrawn_revision is null limit 1`.execute(
            tx
          )
        ).rows[0];
        const rows = (
          await sql<{
            id: string;
          }>`select e.id,e.title,e.summary from collection_event_memberships m join events e on e.id=m.event_id and e.world_id=m.world_id where m.world_id=${worldId} and m.collection_id=${collection.id} and m.withdrawn_revision is null and e.withdrawn_revision is null and e.id>${after} order by e.id limit ${limit + 1}`.execute(
            tx
          )
        ).rows;
        return {
          ...page(rows, revision),
          collection,
          narrative,
          matched_membership: collection.id
        };
      }
      if (method === "time-event.resolve") {
        const system = (
          await sql<PublicTimeSystem>`select id,world_id,slug,title,kind,definition_version,definition from time_systems where id=${String(input.time_system_id)} and world_id=${worldId} and withdrawn_revision is null`.execute(
            tx
          )
        ).rows[0];
        if (!system) return fail("not_found", "time_system_id");
        if (system.definition_version !== input.definition_version)
          return fail("time_system_version_mismatch", "definition_version");
        try {
          return {
            source_revision: revision,
            time_event: resolveTimeEvent(
              {
                kind: "time_event",
                time_system_ref: { time_system_id: system.id },
                definition_version: system.definition_version,
                coordinate: String(input.coordinate)
              },
              temporalAdapterRegistry([system])
            )
          };
        } catch {
          return fail("invalid_time_coordinate", "coordinate");
        }
      }
      if (method === "world.export") {
        // Complete bounded content only. Reject before materializing an oversized World.
        const counts = await Promise.all(
          [
            "collections",
            "events",
            "relations",
            "narratives",
            "time_systems",
            "collection_event_memberships"
          ].map(async (table) =>
            Number(
              (
                await sql<{
                  n: string;
                }>`select count(*) as n from (select 1 from ${sql.table(table)} where world_id=${worldId} and withdrawn_revision is null limit 10001) bounded`.execute(
                  tx
                )
              ).rows[0]!.n
            )
          )
        );
        if (counts.some((n) => n > 10000))
          return fail("export_budget_exceeded", "world_id");
        let bytes = 0;
        for (const table of [
          "worlds",
          "collections",
          "events",
          "relations",
          "narratives",
          "time_systems",
          "collection_event_memberships"
        ]) {
          const scope =
            table === "worlds" ? sql`id=${worldId}` : sql`world_id=${worldId}`;
          bytes += Number(
            (
              await sql<{
                bytes: string;
              }>`select coalesce(sum(octet_length(row_to_json(t)::text)),0) as bytes from ${sql.table(table)} t where ${scope} and withdrawn_revision is null`.execute(
                tx
              )
            ).rows[0]!.bytes
          );
          if (bytes > 3_000_000)
            return fail("export_budget_exceeded", "world_id");
        }
        const links = (
          await sql<{
            n: string;
          }>`select count(*) as n from (select 1 from collection_time_systems l join collections c on c.id=l.collection_id where c.world_id=${worldId} and l.withdrawn_revision is null limit 10001) bounded`.execute(
            tx
          )
        ).rows[0]!;
        if (Number(links.n) > 10000)
          return fail("export_budget_exceeded", "world_id");
        const snapshot = await readActiveV5State(tx, worldId);
        const result = {
          source_revision: revision,
          completeness: "complete",
          format_version: 5,
          snapshot
        };
        if (Buffer.byteLength(JSON.stringify(result)) > 3_900_000)
          return fail("export_budget_exceeded", "world_id");
        return result;
      }
      if (method === "event.neighbors") {
        const eventId = String(input.event_id);
        if (
          !(
            await sql`select id from events where id=${eventId} and world_id=${worldId} and withdrawn_revision is null`.execute(
              tx
            )
          ).rows.length
        )
          return fail("not_found", "event_id");
        const outgoing = sql`source_ref->>'event_id'=${eventId}`;
        const incoming = sql`target_ref->>'event_id'=${eventId}`;
        const direction =
          input.direction === "outgoing"
            ? outgoing
            : input.direction === "incoming"
              ? incoming
              : sql`(${outgoing} or ${incoming})`;
        const types = input.relation_types as string[] | undefined;
        const filter = types?.length
          ? sql`and type in (${sql.join(types)})`
          : sql``;
        const rows = (
          await sql<{
            id: string;
          }>`select id,type,source_ref,target_ref,direction,attributes from relations where world_id=${worldId} and withdrawn_revision is null and ${direction} ${filter} and id>${after} order by id limit ${limit + 1}`.execute(
            tx
          )
        ).rows;
        return {
          ...page(rows, revision),
          event_id: eventId,
          item_type: "relation",
          depth: 1
        };
      }
      const seeds = input.seed_ids as string[],
        collections = input.collection_ids as string[];
      if (!seeds.length && !collections.length)
        return fail("invalid_request", "seed_ids");
      const selected = seeds.length
        ? sql`e.id in (${sql.join(seeds)})`
        : sql`false`;
      const member = collections.length
        ? sql`exists(select 1 from collection_event_memberships m where m.world_id=${worldId} and m.event_id=e.id and m.collection_id in (${sql.join(collections)}) and m.withdrawn_revision is null)`
        : sql`false`;
      const rows = (
        await sql<{
          id: string;
        }>`select e.id,e.title,e.summary from events e where e.world_id=${worldId} and e.withdrawn_revision is null and e.id>${after} and (${selected} or ${member}) order by e.id limit ${limit + 1}`.execute(
          tx
        )
      ).rows;
      const result = page(rows, revision);
      // Explicit induced slice; adjacent facts are separately paged by event.neighbors.
      const ids = result.items.map((e) => e.id);
      const relations = ids.length
        ? (
            await sql<{
              id: string;
            }>`select id,type,source_ref,target_ref,direction,attributes from relations where world_id=${worldId} and withdrawn_revision is null and source_ref->>'event_id' in (${sql.join(ids)}) and target_ref->>'event_id' in (${sql.join(ids)}) order by id limit 101`.execute(
              tx
            )
          ).rows
        : [];
      const memberships =
        ids.length && collections.length
          ? (
              await sql`select event_id,collection_id from collection_event_memberships where world_id=${worldId} and event_id in (${sql.join(ids)}) and collection_id in (${sql.join(collections)}) and withdrawn_revision is null order by collection_id,event_id`.execute(
                tx
              )
            ).rows
          : [];
      return {
        ...result,
        relations: relations.slice(0, 100),
        matched_memberships: memberships,
        relations_truncated: relations.length > 100,
        boundary: {
          type: "induced_page",
          adjacent_facts: "event.neighbors",
          narrative: "event.get"
        }
      };
    });
}
