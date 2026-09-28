import { sql } from "kysely";
import type { MoiraiDatabase } from "@moirai/persistence";
import { readV5WorldAtRevision } from "@moirai/persistence/v5";
import type { ObjectStore } from "@moirai/publication";
import {
  readV5RenderGeneration,
  readV5ServedRoot
} from "@moirai/publication/v5";
import { backfillV5RenderGeneration } from "./render-backfill.js";
import { renderReadyAt } from "./render-coalescing.js";

// Session advisory lock: one global Render compile across worker replicas.
// The connection closes and releases the lock when the process dies.
const lockId = 12012;
const retries = new Map<string, { attempts: number; eligibleAt: number }>();

export async function processNextRenderGeneration(
  database: MoiraiDatabase,
  store: ObjectStore
): Promise<boolean> {
  return database.connection().execute(async (connection) => {
    const acquired = await sql<{
      locked: boolean;
    }>`select pg_try_advisory_lock(${lockId}) as locked`.execute(connection);
    if (!acquired.rows[0]?.locked) return false;
    try {
      const worlds = await sql<{
        world_id: string;
        served_revision: number;
      }>`
        select world_id::text, served_revision
        from world_publication_state
        where served_revision > 0 order by world_id
      `.execute(connection);
      for (const world of worlds.rows) {
        const retry = retries.get(world.world_id);
        if (retry && Date.now() < retry.eligibleAt) continue;
        const root = await readV5ServedRoot(store, world.world_id);
        const revision = root.pointer.served_revision;
        if (revision !== world.served_revision) continue;
        try {
          const rendered = await readV5RenderGeneration(store, world.world_id);
          if (rendered.revision === revision) {
            retries.delete(world.world_id);
            continue;
          }
        } catch (error) {
          // Missing, stale or damaged generations all require a new complete
          // proof. A temporary store failure is retried below with backoff.
          if (!(error instanceof Error)) throw error;
        }
        // The outbox timestamps survive restarts; no in-memory timer carries
        // pending work. Include every completed revision since the generation.
        const pointer = await store.get(
          `worlds/${world.world_id}/render-current.json`
        );
        let lastRendered = 0;
        if (pointer.status === 200 && pointer.body) {
          let value: unknown;
          try {
            value = JSON.parse(pointer.body);
          } catch {
            value = null;
          }
          if (
            value !== null &&
            typeof value === "object" &&
            "revision" in value &&
            typeof value.revision === "number" &&
            Number.isSafeInteger(value.revision) &&
            value.revision >= 0
          )
            lastRendered = value.revision;
        }
        if (lastRendered >= revision) lastRendered = 0; // broken or mismatched generation needs repair
        const dirty = await sql<{
          first_dirty_at: Date | null;
          last_dirty_at: Date | null;
          latest_revision: number | null;
          changed_revisions: number;
        }>`
          select min(completed_at) as first_dirty_at,
            max(completed_at) as last_dirty_at,
            max(target_revision) as latest_revision,
            count(*)::int as changed_revisions
          from publication_outbox
          where world_id = ${world.world_id}::uuid
            and status = 'completed'
            and target_revision > ${lastRendered}
            and target_revision <= ${revision}
        `.execute(connection);
        const candidate = dirty.rows[0];
        if (
          !candidate?.first_dirty_at ||
          !candidate.last_dirty_at ||
          candidate.latest_revision !== revision
        )
          continue;
        if (
          Date.now() <
          renderReadyAt({
            firstDirtyAt: candidate.first_dirty_at,
            lastDirtyAt: candidate.last_dirty_at
          })
        )
          continue;
        try {
          const result = await backfillV5RenderGeneration({
            state: await readV5WorldAtRevision(
              connection,
              world.world_id,
              revision
            ),
            revision,
            store
          });
          retries.delete(world.world_id);
          process.stdout.write(
            JSON.stringify({
              level: "info",
              service: "lachesis-worker",
              operation: "render_coalesced",
              world_id: world.world_id,
              revision,
              generation: result.generation,
              coalesced_revisions: candidate.changed_revisions,
              bytes: result.bytes,
              result_code: "served"
            }) + "\n"
          );
        } catch (cause) {
          const attempts = (retry?.attempts ?? 0) + 1;
          retries.set(world.world_id, {
            attempts,
            eligibleAt:
              Date.now() + Math.min(300_000, 2 ** Math.min(attempts, 8) * 1_000)
          });
          process.stderr.write(
            JSON.stringify({
              level: "error",
              service: "lachesis-worker",
              operation: "render_coalesced",
              world_id: world.world_id,
              revision,
              result_code:
                cause instanceof Error ? cause.message.slice(0, 128) : "failed"
            }) + "\n"
          );
        }
        return true;
      }
      return false;
    } finally {
      await sql`select pg_advisory_unlock(${lockId})`.execute(connection);
    }
  });
}
