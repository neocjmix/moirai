import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("moirai_system_metadata")
    .ifNotExists()
    .addColumn("key", "varchar(128)", (column) => column.primaryKey())
    .addColumn("value", "varchar(1024)", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("moirai_system_metadata").ifExists().execute();
}
