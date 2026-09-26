/** Isolated PG17 v5 authoring search scale profile; never touches production data. */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { sql } from "kysely";
import { createDatabase } from "../packages/persistence/src/index.js";
import { migrateToVersion } from "../packages/persistence/src/migrate.js";
import {
  finalize,
  prepare
} from "../packages/persistence/src/cutovers/010_ip011_collections.js";
import { up } from "../packages/persistence/src/cutovers/011_ip011_authoring_search.js";
import { searchV5WorldEvents } from "../packages/persistence/src/v5-authoring-search.js";
import { profileCanonicalRead } from "../packages/persistence/src/read-profile.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const localCount = 21;
const pageSize = 20;
const input = { world_id: worldId, text: "DanJong", limit: pageSize };
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;

async function sample() {
  const source = process.env.DATABASE_URL;
  if (!source) throw Error("a4_pg17_database_required");
  const db = createDatabase(source);
  try {
    const repetitions = process.argv[3] === "warm" ? 50 : 1;
    const readings = [];
    for (let i = 0; i < repetitions; i++) {
      const { value, metrics } = await profileCanonicalRead(() =>
        searchV5WorldEvents(db, input)
      );
      const ids = value.events.map((event) => event.id);
      if (
        value.source_revision !== 31 ||
        ids.length !== pageSize ||
        !value.next_cursor ||
        ids.some(
          (id, index) =>
            !id.endsWith((index + 1).toString(16).padStart(12, "0"))
        )
      )
        throw Error("a4_pg17_search_identity_or_cursor_changed");
      readings.push({
        ...metrics,
        response_bytes: Buffer.byteLength(JSON.stringify(value))
      });
    }
    process.stdout.write(JSON.stringify(readings) + "\n");
  } finally {
    await db.destroy();
  }
}

async function explain(source: string) {
  const db = createDatabase(source);
  try {
    const result = await sql<{ "QUERY PLAN": Array<Record<string, unknown>> }>`
      explain (analyze, buffers, format json)
      select id, title, left(summary, 1000) as summary from events
      where world_id = ${worldId} and withdrawn_revision is null
        and title ilike ${"%DanJong%"} escape '!'
        and id > '00000000-0000-0000-0000-000000000000'::uuid
      order by id limit ${pageSize + 1}
    `.execute(db);
    const root = result.rows[0]?.["QUERY PLAN"]?.[0];
    if (!root) throw Error("a4_pg17_explain_missing");
    const nodes: Array<Record<string, unknown>> = [];
    const walk = (node: Record<string, unknown>) => {
      nodes.push({
        type: node["Node Type"],
        index: node["Index Name"],
        actual_rows: node["Actual Rows"],
        actual_loops: node["Actual Loops"],
        rows_removed_by_filter: node["Rows Removed by Filter"],
        shared_hit_blocks: node["Shared Hit Blocks"],
        shared_read_blocks: node["Shared Read Blocks"]
      });
      for (const child of (node.Plans ?? []) as Array<Record<string, unknown>>)
        walk(child);
    };
    walk(root.Plan as Record<string, unknown>);
    return { nodes, execution_ms: root["Execution Time"] };
  } finally {
    await db.destroy();
  }
}

async function benchmark() {
  const source = process.env.DATABASE_URL;
  if (!source) throw Error("a4_pg17_database_required");
  const admin = createDatabase(source);
  const results = [];
  try {
    for (const eventCount of [1000, 10000, 100000]) {
      const name = `ip011_a4_authoring_${randomBytes(6).toString("hex")}`;
      const target = new URL(source);
      target.pathname = `/${name}`;
      const targetUrl = target.toString();
      await sql`create database ${sql.id(name)}`.execute(admin);
      try {
        await migrateToVersion(targetUrl, "009_ip003_relation_memberships");
        const db = createDatabase(targetUrl);
        try {
          await db.transaction().execute(async (tx) => {
            await prepare(tx);
            await finalize(tx);
            await up(tx);
          });
          await sql`insert into worlds
            (id,slug,title,current_revision,publication_target_revision,created_revision,updated_revision)
            values (${worldId},'history','History',31,31,1,31)`.execute(db);
          await db.transaction().execute(async (tx) => {
            await sql`insert into events
              (id,world_id,slug,title,summary,roles,attributes,created_revision,updated_revision)
              select ('019f5000-1100-7000-8000-' || lpad(to_hex(i),12,'0'))::uuid,
                ${worldId}::uuid, null,
                case when i <= ${localCount} then 'DanJong local event ' || i
                     else 'Remote event ' || i end,
                null, '[]'::jsonb, '{}'::jsonb, 31, 31
              from generate_series(1,${eventCount}) as i`.execute(tx);
            await sql`insert into narratives
              (id,world_id,scope_type,scope_id,locale,body,public_references,notes,created_revision,updated_revision)
              select id, world_id, 'event', id, 'ko',
                'Synthetic authoring profile', '[]'::jsonb, '[]'::jsonb, 31, 31
              from events where world_id = ${worldId}`.execute(tx);
          });
          await sql`analyze events`.execute(db);
        } finally {
          await db.destroy();
        }
        const cold = [];
        for (let i = 0; i < 20; i++) cold.push(...child(targetUrl, "cold"));
        const warm = child(targetUrl, "warm");
        const plan = await explain(targetUrl);
        results.push({
          event_count: eventCount,
          local_matches: localCount,
          query: input.text,
          page_size: pageSize,
          cache:
            "new application process per cold sample; PG buffer/OS cache not flushed",
          cold,
          warm,
          cold_p95_ms: p95(cold.map((s) => s.app_ms)),
          warm_p95_ms: p95(warm.map((s) => s.app_ms)),
          explain: plan
        });
      } finally {
        await sql`drop database if exists ${sql.id(name)} with (force)`.execute(
          admin
        );
      }
    }
  } finally {
    await admin.destroy();
  }
  process.stdout.write(
    JSON.stringify({
      host: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      postgres: "17-alpine",
      world_revision: 31,
      fixture: "21 identical local title matches; only remote Events added",
      results
    }) + "\n"
  );
}

interface Sample {
  app_ms: number;
  query_ms: number;
  queries: number;
  history_rows: number;
  fold_ms: number;
  response_bytes: number;
}
function child(url: string, mode: "cold" | "warm"): Sample[] {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", process.argv[1]!, "sample", mode],
    {
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      timeout: 60_000
    }
  );
  if (result.status !== 0)
    throw Error(`a4_pg17_sample_failed:${result.stderr}`);
  return JSON.parse(result.stdout) as Sample[];
}

if (process.argv[2] === "sample") await sample();
else await benchmark();
