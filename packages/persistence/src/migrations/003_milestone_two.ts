import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table time_systems (
      id uuid primary key,
      world_id uuid not null references worlds(id),
      slug varchar(160) not null,
      title varchar(500) not null,
      kind varchar(32) not null,
      definition_version varchar(64) not null,
      definition jsonb not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer,
      constraint time_systems_world_slug_unique unique (world_id, slug)
    );

    create table canon_time_systems (
      id uuid primary key,
      canon_id uuid not null references canons(id),
      time_system_id uuid not null references time_systems(id),
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer,
      constraint canon_time_systems_pair_unique unique (canon_id, time_system_id)
    );

    create table relations (
      id uuid primary key,
      canon_id uuid not null references canons(id),
      type varchar(64) not null,
      source_ref jsonb not null,
      target_ref jsonb not null,
      direction varchar(32) not null,
      attributes jsonb not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer,
      constraint relations_source_ref_shape check (source_ref ? 'kind'),
      constraint relations_target_ref_shape check (target_ref ? 'kind')
    );

    create table narratives (
      id uuid primary key,
      canon_id uuid not null references canons(id),
      scope_type varchar(32) not null,
      scope_id uuid not null,
      locale varchar(64) not null,
      kind varchar(32) not null,
      title varchar(500),
      body text not null,
      public_references jsonb not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer
    );

    alter table change_sets
      add column warnings jsonb not null default '[]'::jsonb;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("change_sets").dropColumn("warnings").execute();
  for (const table of [
    "narratives",
    "relations",
    "canon_time_systems",
    "time_systems"
  ]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
}
