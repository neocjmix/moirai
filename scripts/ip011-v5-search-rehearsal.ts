/** Operator-only search index/read rehearsal on the named migrated DB clone.
 * No source DB query, public route, object-store or pointer write. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { sql } from "kysely";
import { createDatabase } from "@moirai/persistence";
import {
  searchV5WorldEvents,
  getV5EventEvidence
} from "@moirai/persistence/v5";
import { up } from "../packages/persistence/src/cutovers/011_ip011_authoring_search.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let phase = "configuration";
  try {
    const mode = process.argv[2];
    if (mode !== "rehearse-search" && mode !== "rehearse-detail")
      throw Error("explicit_mode_required");
    const sourceUrl = process.env.DATABASE_URL;
    const name = process.env.IP011_REHEARSAL_DB;
    if (!sourceUrl || !name || !/^ip011_rehearsal_[0-9a-f]{16}$/.test(name))
      throw Error("isolated_rehearsal_required");
    const url = new URL(sourceUrl);
    if (decodeURIComponent(url.pathname.slice(1)) === name)
      throw Error("source_target_collision");
    url.pathname = `/${name}`;
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as { world_id: string; source_revision: number };
    const clone = createDatabase(url.toString());
    try {
      phase = "clone_identity";
      const identity = (
        await sql<{ name: string }>`select current_database() as name`.execute(
          clone
        )
      ).rows[0];
      if (identity?.name !== name) throw Error("rehearsal_database_mismatch");
      const revision = manifest.source_revision + 1;
      const world = (
        await sql<{
          current_revision: number;
        }>`select current_revision from worlds where id = ${manifest.world_id} and withdrawn_revision is null`.execute(
          clone
        )
      ).rows[0];
      const migration = (
        await sql<{
          name: string;
        }>`select name from kysely_migration where name = '010_ip011_collections'`.execute(
          clone
        )
      ).rows[0];
      if (world?.current_revision !== revision || !migration)
        throw Error("rehearsal_v5_revision_required");
      phase = "clone_index";
      const priorIndex = (
        await sql<{
          definition: string;
        }>`select indexdef as definition from pg_indexes where schemaname = current_schema() and indexname = 'events_active_title_trgm'`.execute(
          clone
        )
      ).rows[0];
      if (!priorIndex) await clone.transaction().execute(async (tx) => up(tx));
      const index = (
        await sql<{
          definition: string;
        }>`select indexdef as definition from pg_indexes where schemaname = current_schema() and indexname = 'events_active_title_trgm'`.execute(
          clone
        )
      ).rows[0];
      if (
        !index?.definition.includes("gin_trgm_ops") ||
        !index.definition.includes("withdrawn_revision IS NULL")
      )
        throw Error("rehearsal_index_invalid");
      phase = "clone_search";
      const results = [];
      for (const text of ["단종 폐위", "임진왜란", "일본사"]) {
        const start = performance.now();
        const first = await searchV5WorldEvents(clone, {
          world_id: manifest.world_id,
          text,
          limit: 10
        });
        const next = first.next_cursor
          ? await searchV5WorldEvents(clone, {
              world_id: manifest.world_id,
              text,
              limit: 10,
              cursor: first.next_cursor
            })
          : null;
        if (
          first.source_revision !== revision ||
          (next && next.source_revision !== revision)
        )
          throw Error("rehearsal_search_revision_invalid");
        const ids = [...first.events, ...(next?.events ?? [])].map(
          (event) => event.id
        );
        if (new Set(ids).size !== ids.length)
          throw Error("rehearsal_search_duplicate");
        results.push({
          query: text,
          examined: ids.length,
          has_more: next?.next_cursor != null,
          elapsed_ms: Math.round(performance.now() - start)
        });
      }
      if (results.every((result) => result.examined === 0))
        throw Error("rehearsal_search_empty");
      const details = [];
      if (mode === "rehearse-detail") {
        phase = "clone_detail";
        for (const text of ["단종 폐위", "임진왜란"]) {
          const candidate = await searchV5WorldEvents(clone, {
            world_id: manifest.world_id,
            text,
            limit: 1
          });
          const eventId = candidate.events[0]?.id;
          if (!eventId) throw Error("rehearsal_detail_candidate_missing");
          let cursor: string | null = null;
          let pages = 0,
            memberships = 0,
            relations = 0;
          do {
            const detail = await getV5EventEvidence(clone, {
              world_id: manifest.world_id,
              event_id: eventId,
              at_revision: candidate.source_revision,
              cursor
            });
            if (
              detail.source_revision !== revision ||
              detail.narrative.body.length === 0
            )
              throw Error("rehearsal_detail_invalid");
            pages++;
            memberships += detail.memberships.length;
            relations += detail.relations.length;
            cursor = detail.next_cursor;
            if (pages > 100) throw Error("rehearsal_detail_page_budget");
          } while (cursor);
          details.push({ query: text, pages, memberships, relations });
        }
      }
      console.info(
        JSON.stringify({
          operation:
            mode === "rehearse-detail"
              ? "ip011_v5_detail_rehearsal"
              : "ip011_v5_search_rehearsal",
          clone: name,
          revision,
          index_present: true,
          source_written: false,
          pointer_written: false,
          results,
          ...(mode === "rehearse-detail" ? { details } : {})
        })
      );
    } finally {
      await clone.destroy();
    }
  } catch {
    // Never print private candidate titles, SQL errors, credentials or origins.
    console.error(
      JSON.stringify({
        operation: "ip011_v5_search_rehearsal",
        error_code: "rehearsal_failed",
        phase
      })
    );
    process.exitCode = 1;
  }
}
