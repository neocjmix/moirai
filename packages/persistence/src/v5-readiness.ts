import { sql } from "kysely";
import type { MoiraiDatabase } from "./index.js";

/** Refuse v5 ingress until the atomic 010 cutover and the title index exist. */
export async function assertV5SchemaReady(db: MoiraiDatabase): Promise<void> {
  const result = await sql<{
    migration: string | null;
    title_index: string | null;
    collections: string | null;
    canons: string | null;
  }>`select
    (select name from kysely_migration where name = '010_ip011_collections') as migration,
    to_regclass('public.events_active_title_trgm')::text as title_index,
    to_regclass('public.collections')::text as collections,
    to_regclass('public.canons')::text as canons`.execute(db);
  const row = result.rows[0];
  if (
    row?.migration !== "010_ip011_collections" ||
    row.title_index !== "events_active_title_trgm" ||
    row.collections !== "collections" ||
    row.canons !== null
  )
    throw Error("v5_schema_not_ready");
}
