import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  const worlds = await sql<{
    world_id: string;
    current_revision: number;
    publication_target_revision: number;
    served_revision: number;
  }>`
    select
      world.id as world_id,
      world.current_revision,
      world.publication_target_revision,
      coalesce(publication.served_revision, 0) as served_revision
    from worlds as world
    left join world_publication_state as publication
      on publication.world_id = world.id
    order by world.id
  `.execute(db);

  const preflight = await sql<{
    worlds: string;
    active_worlds: string;
    canons: string;
    active_canons: string;
    events: string;
    active_events: string;
    relations: string;
    active_relations: string;
    narratives: string;
    active_narratives: string;
    publication_states: string;
    publication_outbox_rows: string;
    events_without_resolvable_canon: string;
    world_local_slug_collision_groups: string;
  }>`
    select
      (select count(*) from worlds)::text as worlds,
      (select count(*) from worlds where withdrawn_revision is null)::text as active_worlds,
      (select count(*) from canons)::text as canons,
      (select count(*) from canons where withdrawn_revision is null)::text as active_canons,
      (select count(*) from events)::text as events,
      (select count(*) from events where withdrawn_revision is null)::text as active_events,
      (select count(*) from relations)::text as relations,
      (select count(*) from relations where withdrawn_revision is null)::text as active_relations,
      (select count(*) from narratives)::text as narratives,
      (select count(*) from narratives where withdrawn_revision is null)::text as active_narratives,
      (select count(*) from world_publication_state)::text as publication_states,
      (select count(*) from publication_outbox)::text as publication_outbox_rows,
      (
        select count(*)
        from events as event
        left join canons as canon on canon.id = event.canon_id
        where canon.id is null
      )::text as events_without_resolvable_canon,
      (
        select count(*)
        from (
          select canon.world_id, event.slug
          from events as event
          join canons as canon on canon.id = event.canon_id
          where event.slug is not null
          group by canon.world_id, event.slug
          having count(*) > 1
        ) as collision
      )::text as world_local_slug_collision_groups
  `.execute(db);

  const snapshot = preflight.rows[0];
  if (!snapshot || snapshot.events_without_resolvable_canon !== "0") {
    throw new Error(
      `IP-003 pre-migration invariant failed: ${JSON.stringify(snapshot)}`
    );
  }
  process.stdout.write(
    `IP-003 pre-migration snapshot: ${JSON.stringify({
      worlds: worlds.rows,
      counts: snapshot,
      expected: {
        event_world_backfill_rows: Number(snapshot.events),
        canon_event_membership_backfill_rows: Number(snapshot.events),
        active_events_without_active_membership: 0,
        cross_world_memberships: 0,
        duplicate_active_memberships: 0,
        event_identity_changes: 0,
        deleted_rows: 0,
        publication_regeneration_required_by_slice_2: false
      },
      rollback:
        "transaction rollback before commit; migration down removes only additive IP-003 structures"
    })}\n`
  );

  await sql`
    alter table events add column world_id uuid;

    update events as event
    set world_id = canon.world_id
    from canons as canon
    where canon.id = event.canon_id;

    alter table canons
      add constraint canons_world_id_id_unique unique (world_id, id);

    alter table events
      add constraint events_world_id_id_unique unique (world_id, id),
      add constraint events_world_id_foreign
        foreign key (world_id) references worlds(id);

    create table canon_event_memberships (
      id uuid primary key,
      world_id uuid not null,
      canon_id uuid not null,
      event_id uuid not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer,
      constraint canon_event_memberships_world_canon_foreign
        foreign key (world_id, canon_id) references canons(world_id, id),
      constraint canon_event_memberships_world_event_foreign
        foreign key (world_id, event_id) references events(world_id, id)
    );

    create unique index canon_event_memberships_active_pair_unique
      on canon_event_memberships(canon_id, event_id)
      where withdrawn_revision is null;

    create index canon_event_memberships_event_active
      on canon_event_memberships(event_id, canon_id)
      where withdrawn_revision is null;

    insert into canon_event_memberships (
      id,
      world_id,
      canon_id,
      event_id,
      created_revision,
      updated_revision,
      withdrawn_revision
    )
    select
      (
        substr(md5(event.canon_id::text || ':' || event.id::text), 1, 8) || '-' ||
        substr(md5(event.canon_id::text || ':' || event.id::text), 9, 4) || '-' ||
        '5' || substr(md5(event.canon_id::text || ':' || event.id::text), 14, 3) || '-' ||
        '8' || substr(md5(event.canon_id::text || ':' || event.id::text), 18, 3) || '-' ||
        substr(md5(event.canon_id::text || ':' || event.id::text), 21, 12)
      )::uuid,
      event.world_id,
      event.canon_id,
      event.id,
      event.created_revision,
      event.updated_revision,
      event.withdrawn_revision
    from events as event;

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
        id,
        world_id,
        canon_id,
        event_id,
        created_revision,
        updated_revision,
        withdrawn_revision
      ) values (
        (
          substr(md5(new.canon_id::text || ':' || new.id::text), 1, 8) || '-' ||
          substr(md5(new.canon_id::text || ':' || new.id::text), 9, 4) || '-' ||
          '5' || substr(md5(new.canon_id::text || ':' || new.id::text), 14, 3) || '-' ||
          '8' || substr(md5(new.canon_id::text || ':' || new.id::text), 18, 3) || '-' ||
          substr(md5(new.canon_id::text || ':' || new.id::text), 21, 12)
        )::uuid,
        new.world_id,
        new.canon_id,
        new.id,
        new.created_revision,
        new.updated_revision,
        new.withdrawn_revision
      ) on conflict (id) do nothing;
      return new;
    end
    $function$;

    create trigger ip003_legacy_event_membership_bridge
      after insert or update of canon_id on events
      for each row execute function ip003_legacy_event_membership_bridge();
  `.execute(db);

  const invariant = await sql<{
    missing_world: string;
    missing_membership: string;
    cross_world_membership: string;
  }>`
    select
      count(*) filter (where event.world_id is null)::text as missing_world,
      count(*) filter (
        where event.withdrawn_revision is null
          and not exists (
            select 1
            from canon_event_memberships as membership
            where membership.event_id = event.id
              and membership.withdrawn_revision is null
          )
      )::text as missing_membership,
      (
        select count(*)::text
        from canon_event_memberships as membership
        join events as member_event on member_event.id = membership.event_id
        join canons as member_canon on member_canon.id = membership.canon_id
        where membership.world_id <> member_event.world_id
           or membership.world_id <> member_canon.world_id
      ) as cross_world_membership
    from events as event
  `.execute(db);

  const result = invariant.rows[0];
  if (
    !result ||
    result.missing_world !== "0" ||
    result.missing_membership !== "0" ||
    result.cross_world_membership !== "0"
  ) {
    throw new Error(
      `IP-003 Event backfill invariant failed: ${JSON.stringify(result)}`
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop trigger if exists ip003_legacy_event_membership_bridge on events;
    drop function if exists ip003_legacy_event_membership_bridge();
    drop trigger if exists ip003_legacy_event_world_bridge on events;
    drop function if exists ip003_legacy_event_world_bridge();
    drop table if exists canon_event_memberships;
    alter table events drop constraint if exists events_world_id_foreign;
    alter table events drop constraint if exists events_world_id_id_unique;
    alter table events drop column if exists world_id;
    alter table canons drop constraint if exists canons_world_id_id_unique;
  `.execute(db);
}
