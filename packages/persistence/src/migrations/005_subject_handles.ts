import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table subject_handles (
      id uuid primary key,
      canon_id uuid not null references canons(id),
      anchor_event_id uuid not null references events(id),
      status varchar(32) not null,
      redirect_to uuid references subject_handles(id),
      created_revision integer not null,
      projection_revision integer not null,
      constraint subject_handles_redirect check (
        (status = 'redirected' and redirect_to is not null) or
        (status <> 'redirected' and redirect_to is null)
      )
    );

    create index subject_handles_canon on subject_handles(canon_id);

    create table subject_handle_members (
      handle_id uuid not null references subject_handles(id) on delete cascade,
      event_id uuid not null references events(id),
      projection_revision integer not null,
      primary key (handle_id, event_id)
    );

    create index subject_handle_members_event on subject_handle_members(event_id);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("subject_handle_members").ifExists().execute();
  await db.schema.dropTable("subject_handles").ifExists().execute();
}
