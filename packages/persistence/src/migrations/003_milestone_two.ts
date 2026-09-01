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

    create table event_temporal_placements (
      id uuid primary key,
      event_id uuid not null references events(id),
      time_system_id uuid not null references time_systems(id),
      kind varchar(32) not null,
      earliest_start jsonb not null,
      latest_start jsonb not null,
      earliest_end jsonb,
      latest_end jsonb,
      precision varchar(64) not null,
      certainty varchar(32) not null,
      display_label varchar(500),
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer
    );

    create table relations (
      id uuid primary key,
      canon_id uuid not null references canons(id),
      type varchar(64) not null,
      source_event_id uuid not null references events(id),
      target_event_id uuid not null references events(id),
      direction varchar(32) not null,
      attributes jsonb not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer
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
    "event_temporal_placements",
    "canon_time_systems",
    "time_systems"
  ]) {
    await db.schema.dropTable(table).ifExists().cascade().execute();
  }
}
