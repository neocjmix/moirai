/** Operator-only, read-only scenario audit on the named migrated clone.
 * Emits stable IDs and counts, never canonical prose or credentials. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { createDatabase } from "@moirai/persistence";
import {
  getV5EventEvidence,
  searchV5WorldEvents
} from "@moirai/persistence/v5";

const cases = [
  { name: "gyeyu", id: "019f5b00-0000-7000-8000-000000000115" },
  { name: "sejo", id: "019f5b00-0000-7000-8000-000000000116" },
  { name: "danjong", id: "01a0c40a-a761-7fc7-aef2-10211e0ecb0e" },
  { name: "imjin", id: "019f8c00-0000-7000-8000-000000001000" },
  { name: "onin", id: "01a0c8c3-544c-725e-a664-d7966e1e0748" },
  { name: "sekigahara", id: "01a0c8c3-544d-7058-8150-16d9ee2e0fc0" }
] as const;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let phase = "configuration";
  try {
    if (process.argv[2] !== "rehearse-scenarios")
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
    const db = createDatabase(url.toString());
    try {
      phase = "clone_identity";
      const identity = (
        await sql<{ name: string }>`select current_database() as name`.execute(
          db
        )
      ).rows[0];
      if (identity?.name !== name) throw Error("clone_mismatch");
      const revision = manifest.source_revision + 1;
      const world = (
        await sql<{ current_revision: number }>`
        select current_revision from worlds where id = ${manifest.world_id} and withdrawn_revision is null
      `.execute(db)
      ).rows[0];
      const migration = (
        await sql<{ name: string }>`
        select name from kysely_migration where name = '010_ip011_collections'
      `.execute(db)
      ).rows[0];
      if (world?.current_revision !== revision || !migration)
        throw Error("v5_revision_required");

      phase = "scenario_reads";
      const details = [];
      for (const item of cases) {
        phase = `detail_${item.name}`;
        let cursor: string | null = null;
        let pages = 0,
          memberships = 0,
          relations = 0;
        do {
          const result = await getV5EventEvidence(db, {
            world_id: manifest.world_id,
            event_id: item.id,
            at_revision: revision,
            cursor
          });
          if (result.source_revision !== revision || !result.narrative.body)
            throw Error("detail_invalid");
          memberships += result.memberships.length;
          relations += result.relations.length;
          pages++;
          cursor = result.next_cursor;
          if (pages > 100) throw Error("page_budget");
        } while (cursor);
        details.push({
          case: item.name,
          id: item.id,
          pages,
          memberships,
          relations
        });
      }
      const candidates = [];
      for (const query of [
        "계유정난",
        "단종 폐위",
        "임진왜란",
        "전국시대",
        "세키가하라"
      ]) {
        phase = `search_${candidates.length}`;
        let cursor: string | null = null;
        const ids: string[] = [];
        do {
          const page = await searchV5WorldEvents(db, {
            world_id: manifest.world_id,
            text: query,
            limit: 25,
            cursor
          });
          if (page.source_revision !== revision)
            throw Error("search_revision_invalid");
          ids.push(...page.events.map((event) => event.id));
          cursor = page.next_cursor;
          if (ids.length > 150) throw Error("search_budget");
        } while (cursor);
        if (new Set(ids).size !== ids.length) throw Error("search_duplicates");
        candidates.push({ query, ids });
      }
      phase = "shared_sample";
      const shared = (
        await sql<{ event_id: string; collection_count: string }>`
        select event_id, count(distinct collection_id)::text as collection_count
        from collection_event_memberships
        where world_id = ${manifest.world_id} and withdrawn_revision is null
        group by event_id having count(distinct collection_id) > 1
        order by event_id limit 20
      `.execute(db)
      ).rows;
      phase = "shared_total";
      const sharedTotal = (
        await sql<{ count: string }>`
        select count(*)::text as count from (
          select event_id from collection_event_memberships
          where world_id = ${manifest.world_id} and withdrawn_revision is null
          group by event_id having count(distinct collection_id) > 1
        ) s
      `.execute(db)
      ).rows[0];
      phase = "composite_overlap";
      const overlap = (
        await sql<{ count: string }>`
        select count(distinct r.id)::text as count from relations r
        join collection_event_memberships parent on parent.event_id = (r.source_ref->>'event_id')::uuid
          and parent.world_id = r.world_id and parent.withdrawn_revision is null
        join collection_event_memberships child on child.event_id = (r.target_ref->>'event_id')::uuid
          and child.world_id = r.world_id and child.withdrawn_revision is null
        where r.world_id = ${manifest.world_id} and r.withdrawn_revision is null
          and r.type = 'contains' and parent.collection_id = child.collection_id
      `.execute(db)
      ).rows[0];
      phase = "world_count";
      const worlds = (
        await sql<{ count: string }>`
        select count(*)::text as count from worlds where withdrawn_revision is null
      `.execute(db)
      ).rows[0];
      console.info(
        JSON.stringify({
          operation: "ip011_a2_scenario_rehearsal",
          clone: name,
          revision,
          source_written: false,
          pointer_written: false,
          details,
          candidates,
          shared_total: Number(sharedTotal?.count),
          shared_first_twenty: shared.map((row) => ({
            id: row.event_id,
            collections: Number(row.collection_count)
          })),
          collection_composite_overlap_relations: Number(overlap?.count),
          installed_worlds: Number(worlds?.count),
          distinct_world_actual_data_coverage: Number(worlds?.count) > 1
        })
      );
    } finally {
      await db.destroy();
    }
  } catch {
    console.error(
      JSON.stringify({
        operation: "ip011_a2_scenario_rehearsal",
        error_code: "rehearsal_failed",
        phase
      })
    );
    process.exitCode = 1;
  }
}
