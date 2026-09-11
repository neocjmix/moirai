import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table events alter column world_id set not null;

    create function ip003_assert_event_membership_state()
    returns trigger
    language plpgsql
    as $function$
    declare
      checked_event_id uuid;
      event_withdrawn_revision integer;
      active_membership_count integer;
    begin
      if tg_table_name = 'events' then
        checked_event_id := coalesce(new.id, old.id);
      else
        checked_event_id := coalesce(new.event_id, old.event_id);
      end if;

      select withdrawn_revision into event_withdrawn_revision
      from events
      where id = checked_event_id;

      if not found then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;

      select count(*) into active_membership_count
      from canon_event_memberships
      where event_id = checked_event_id
        and withdrawn_revision is null;

      if event_withdrawn_revision is null and active_membership_count = 0 then
        raise exception using
          errcode = '23514',
          message = 'active Event must have at least one active Canon membership';
      end if;

      if event_withdrawn_revision is not null and active_membership_count > 0 then
        raise exception using
          errcode = '23514',
          message = 'withdrawn Event cannot retain an active Canon membership';
      end if;

      if tg_op = 'DELETE' then return old; end if;
      return new;
    end
    $function$;

    create constraint trigger ip003_event_membership_state_from_event
      after insert or update of withdrawn_revision on events
      deferrable initially deferred
      for each row execute function ip003_assert_event_membership_state();

    create constraint trigger ip003_event_membership_state_from_membership
      after insert or update or delete on canon_event_memberships
      deferrable initially deferred
      for each row execute function ip003_assert_event_membership_state();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop trigger if exists ip003_event_membership_state_from_membership
      on canon_event_memberships;
    drop trigger if exists ip003_event_membership_state_from_event on events;
    drop function if exists ip003_assert_event_membership_state();
    alter table events alter column world_id drop not null;
  `.execute(db);
}
