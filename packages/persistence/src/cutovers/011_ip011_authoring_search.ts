/** A3-only additive v5 index. Never register against the live v4 database.
 * A World title search must not materialize every Event in application memory. */
import { sql, type QueryExecutorProvider } from "kysely";

export const IP011_SEARCH_MIGRATION = "011_ip011_authoring_search";

export async function up(db: QueryExecutorProvider): Promise<void> {
  await sql`
    set local lock_timeout = '5s';
    set local statement_timeout = '30s';
    create extension if not exists pg_trgm;
    create index events_active_title_trgm on events using gin (title gin_trgm_ops)
      where withdrawn_revision is null;
  `.execute(db);
}
