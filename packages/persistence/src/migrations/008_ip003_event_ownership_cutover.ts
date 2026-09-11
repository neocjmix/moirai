import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  const preflight = await sql<{
    events: string;
    active_events: string;
    memberships: string;
    events_without_world: string;
    orphan_active_events: string;
    cross_world_memberships: string;
    duplicate_active_memberships: string;
  }>`
    select
      (select count(*) from events)::text as events,
      (select count(*) from events where withdrawn_revision is null)::text as active_events,
      (select count(*) from canon_event_memberships)::text as memberships,
      (select count(*) from events where world_id is null)::text as events_without_world,
      (
        select count(*) from events as event
        where event.withdrawn_revision is null and not exists (
          select 1 from canon_event_memberships as membership
          where membership.event_id = event.id
            and membership.withdrawn_revision is null
        )
      )::text as orphan_active_events,
      (
        select count(*) from canon_event_memberships as membership
        join events as event on event.id = membership.event_id
        join canons as canon on canon.id = membership.canon_id
        where membership.world_id <> event.world_id
           or membership.world_id <> canon.world_id
      )::text as cross_world_memberships,
      (
        select count(*) from (
          select event_id, canon_id
          from canon_event_memberships
          where withdrawn_revision is null
          group by event_id, canon_id
          having count(*) > 1
        ) as duplicate
      )::text as duplicate_active_memberships
  `.execute(db);
  const snapshot = preflight.rows[0];
  if (
    !snapshot ||
    snapshot.events_without_world !== "0" ||
    snapshot.orphan_active_events !== "0" ||
    snapshot.cross_world_memberships !== "0" ||
    snapshot.duplicate_active_memberships !== "0"
  )
    throw new Error(
      `IP-003 Event ownership cutover invariant failed: ${JSON.stringify(snapshot)}`
    );
  process.stdout.write(
    `IP-003 Event ownership cutover snapshot: ${JSON.stringify({
      ...snapshot,
      expected: {
        changed_rows: 0,
        deleted_rows: 0,
        event_identity_changes: 0,
        orphan_active_events: 0
      },
      rollback:
        "migration down deterministically repairs nullable legacy canon_id from preserved membership history before restoring the v2 bridge"
    })}\n`
  );
  await sql`
    drop trigger if exists ip003_legacy_event_membership_bridge on events;
    drop function if exists ip003_legacy_event_membership_bridge();
    drop trigger if exists ip003_legacy_event_world_bridge on events;
    drop function if exists ip003_legacy_event_world_bridge();

    alter table events alter column canon_id drop not null;

    comment on column events.canon_id is
      'Frozen pre-IP-003 compatibility data. Not written by contract v3 and never an Event ownership or membership source.';
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    update events as event
    set canon_id = membership.canon_id
    from (
      select event_id, min(canon_id) as canon_id
      from canon_event_memberships
      group by event_id
    ) as membership
    where membership.event_id = event.id
      and event.canon_id is null;

    alter table events alter column canon_id set not null;

    create function ip003_legacy_event_world_bridge()
    returns trigger
    language plpgsql
    as $function$
    begin
      if new.world_id is null then
        select world_id into new.world_id from canons where id = new.canon_id;
      end if;
      return new;
    end
    $function$;

    create trigger ip003_legacy_event_world_bridge
      before insert or update of canon_id on events
      for each row execute function ip003_legacy_event_world_bridge();

    create function ip003_legacy_event_membership_bridge()
    returns trigger
    language plpgsql
    as $function$
    begin
      insert into canon_event_memberships (
        id, world_id, canon_id, event_id,
        created_revision, updated_revision, withdrawn_revision
      ) values (
        (
          substr(md5(new.canon_id::text || ':' || new.id::text), 1, 8) || '-' ||
          substr(md5(new.canon_id::text || ':' || new.id::text), 9, 4) || '-' ||
          '5' || substr(md5(new.canon_id::text || ':' || new.id::text), 14, 3) || '-' ||
          '8' || substr(md5(new.canon_id::text || ':' || new.id::text), 18, 3) || '-' ||
          substr(md5(new.canon_id::text || ':' || new.id::text), 21, 12)
        )::uuid,
        new.world_id, new.canon_id, new.id,
        new.created_revision, new.updated_revision, new.withdrawn_revision
      ) on conflict (id) do nothing;
      return new;
    end
    $function$;

    create trigger ip003_legacy_event_membership_bridge
      after insert or update of canon_id on events
      for each row execute function ip003_legacy_event_membership_bridge();
  `.execute(db);
}
