import { sql, type Kysely } from "kysely";

/**
 * TS-010 keeps legacy Event ID columns as nullable traversal indexes while a
 * tagged JSON reference becomes authoritative for new canonical Relations.
 * Existing rows are deliberately neither rewritten nor backfilled.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table relations
      alter column source_event_id drop not null,
      alter column target_event_id drop not null,
      add column source_ref jsonb,
      add column target_ref jsonb,
      add constraint relations_endpoint_representation_check check (
        (source_ref is null and target_ref is null and source_event_id is not null and target_event_id is not null)
        or (source_ref is not null and target_ref is not null)
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const result = await sql<{ has_virtual_endpoint: boolean }>`
    select exists (
      select 1
      from relations
      where source_event_id is null or target_event_id is null
    ) as has_virtual_endpoint
  `.execute(db);
  if (result.rows[0]?.has_virtual_endpoint) {
    throw new Error(
      "Cannot roll back event relation time migration while virtual Time Event Relations exist"
    );
  }
  await sql`
    alter table relations
      drop constraint relations_endpoint_representation_check,
      drop column source_ref,
      drop column target_ref,
      alter column source_event_id set not null,
      alter column target_event_id set not null
  `.execute(db);
}
