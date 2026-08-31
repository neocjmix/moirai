import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("worlds")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("slug", "varchar(160)", (column) => column.notNull().unique())
    .addColumn("title", "varchar(500)", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("current_revision", "integer", (column) => column.notNull())
    .addColumn("publication_target_revision", "integer", (column) =>
      column.notNull()
    )
    .addColumn("created_revision", "integer", (column) => column.notNull())
    .addColumn("updated_revision", "integer", (column) => column.notNull())
    .addColumn("withdrawn_revision", "integer")
    .execute();

  await db.schema
    .createTable("canons")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("world_id", "uuid", (column) =>
      column.notNull().references("worlds.id")
    )
    .addColumn("slug", "varchar(160)", (column) => column.notNull())
    .addColumn("title", "varchar(500)", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("created_revision", "integer", (column) => column.notNull())
    .addColumn("updated_revision", "integer", (column) => column.notNull())
    .addColumn("withdrawn_revision", "integer")
    .addUniqueConstraint("canons_world_slug_unique", ["world_id", "slug"])
    .execute();

  await db.schema
    .createTable("events")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("canon_id", "uuid", (column) =>
      column.notNull().references("canons.id")
    )
    .addColumn("slug", "varchar(160)")
    .addColumn("kind", "varchar(32)", (column) => column.notNull())
    .addColumn("title", "varchar(500)", (column) => column.notNull())
    .addColumn("summary", "text")
    .addColumn("roles", "jsonb", (column) => column.notNull())
    .addColumn("attributes", "jsonb", (column) => column.notNull())
    .addColumn("created_revision", "integer", (column) => column.notNull())
    .addColumn("updated_revision", "integer", (column) => column.notNull())
    .addColumn("withdrawn_revision", "integer")
    .addUniqueConstraint("events_canon_slug_unique", ["canon_id", "slug"])
    .execute();

  await db.schema
    .createTable("change_sets")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("world_id", "uuid", (column) =>
      column.notNull().references("worlds.id")
    )
    .addColumn("request_digest", "varchar(64)", (column) => column.notNull())
    .addColumn("actor", "varchar(255)", (column) => column.notNull())
    .addColumn("intent", "text", (column) => column.notNull())
    .addColumn("contract_version", "varchar(32)", (column) => column.notNull())
    .addColumn("origins", "jsonb", (column) => column.notNull())
    .addColumn("result", "jsonb", (column) => column.notNull())
    .addColumn("committed_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("world_revisions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("world_id", "uuid", (column) =>
      column.notNull().references("worlds.id")
    )
    .addColumn("revision", "integer", (column) => column.notNull())
    .addColumn("change_set_id", "uuid", (column) =>
      column.notNull().references("change_sets.id")
    )
    .addColumn("committed_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("world_revisions_world_revision_unique", [
      "world_id",
      "revision"
    ])
    .addUniqueConstraint("world_revisions_change_set_unique", ["change_set_id"])
    .execute();

  await db.schema
    .createTable("change_operations")
    .addColumn("change_set_id", "uuid", (column) =>
      column.notNull().references("change_sets.id")
    )
    .addColumn("world_id", "uuid", (column) =>
      column.notNull().references("worlds.id")
    )
    .addColumn("revision", "integer", (column) => column.notNull())
    .addColumn("operation_index", "integer", (column) => column.notNull())
    .addColumn("entity_type", "varchar(32)", (column) => column.notNull())
    .addColumn("entity_id", "uuid", (column) => column.notNull())
    .addColumn("operation_kind", "varchar(32)", (column) => column.notNull())
    .addColumn("before", "jsonb")
    .addColumn("after", "jsonb")
    .addPrimaryKeyConstraint("change_operations_primary", [
      "change_set_id",
      "operation_index"
    ])
    .execute();

  await db.schema
    .createIndex("change_operations_revision_read")
    .on("change_operations")
    .columns(["world_id", "revision", "operation_index"])
    .execute();

  await db.schema
    .createTable("world_publication_state")
    .addColumn("world_id", "uuid", (column) =>
      column.primaryKey().references("worlds.id")
    )
    .addColumn("served_revision", "integer", (column) =>
      column.notNull().defaultTo(0)
    )
    .addColumn("projection_status", "varchar(32)", (column) => column.notNull())
    .addColumn("last_error_code", "varchar(128)")
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("publication_outbox")
    .addColumn("id", "bigserial", (column) => column.primaryKey())
    .addColumn("world_id", "uuid", (column) =>
      column.notNull().references("worlds.id")
    )
    .addColumn("target_revision", "integer", (column) => column.notNull())
    .addColumn("change_set_id", "uuid", (column) =>
      column.notNull().references("change_sets.id")
    )
    .addColumn("status", "varchar(32)", (column) => column.notNull())
    .addColumn("attempt_count", "integer", (column) =>
      column.notNull().defaultTo(0)
    )
    .addColumn("available_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .addColumn("lease_expires_at", "timestamptz")
    .addColumn("last_error_code", "varchar(128)")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`)
    )
    .addColumn("completed_at", "timestamptz")
    .addUniqueConstraint("publication_outbox_world_revision_unique", [
      "world_id",
      "target_revision"
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "publication_outbox",
    "world_publication_state",
    "change_operations",
    "world_revisions",
    "change_sets",
    "events",
    "canons",
    "worlds"
  ]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
}
