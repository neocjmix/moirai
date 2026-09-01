import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("change_operations")
    .addColumn("origin_refs", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'[]'::jsonb`)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("change_operations")
    .dropColumn("origin_refs")
    .execute();
}
