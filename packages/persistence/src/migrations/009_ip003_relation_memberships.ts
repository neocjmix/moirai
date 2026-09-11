import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  const preflight = await sql<{
    relations: string;
    active_relations: string;
    unresolved_canons: string;
  }>`
    select
      count(*)::text as relations,
      count(*) filter (where relation.withdrawn_revision is null)::text as active_relations,
      count(*) filter (where canon.id is null)::text as unresolved_canons
    from relations as relation
    left join canons as canon on canon.id = relation.canon_id
  `.execute(db);
  const snapshot = preflight.rows[0];
  if (!snapshot || snapshot.unresolved_canons !== "0")
    throw new Error(
      `IP-003 Relation pre-migration invariant failed: ${JSON.stringify(snapshot)}`
    );

  process.stdout.write(
    `IP-003 Relation migration snapshot: ${JSON.stringify({
      counts: snapshot,
      expected: {
        relation_world_backfill_rows: Number(snapshot.relations),
        canon_relation_membership_backfill_rows: Number(snapshot.relations),
        orphan_active_relations: 0,
        cross_world_memberships: 0,
        relation_identity_changes: 0,
        deleted_rows: 0
      },
      rollback:
        "migration down is guarded against multi-Canon Relation loss; repair is forward reapply from the preserved table/history"
    })}\n`
  );

  await sql`
    alter table relations add column world_id uuid;

    update relations as relation
    set world_id = canon.world_id
    from canons as canon
    where canon.id = relation.canon_id;

    alter table relations
      add constraint relations_world_id_id_unique unique (world_id, id),
      add constraint relations_world_id_foreign
        foreign key (world_id) references worlds(id);

    create table canon_relation_memberships (
      id uuid primary key,
      world_id uuid not null,
      canon_id uuid not null,
      relation_id uuid not null,
      created_revision integer not null,
      updated_revision integer not null,
      withdrawn_revision integer,
      constraint canon_relation_memberships_world_canon_foreign
        foreign key (world_id, canon_id) references canons(world_id, id),
      constraint canon_relation_memberships_world_relation_foreign
        foreign key (world_id, relation_id) references relations(world_id, id)
    );

    create unique index canon_relation_memberships_active_pair_unique
      on canon_relation_memberships(canon_id, relation_id)
      where withdrawn_revision is null;

    create index canon_relation_memberships_relation_active
      on canon_relation_memberships(relation_id, canon_id)
      where withdrawn_revision is null;

    insert into canon_relation_memberships (
      id, world_id, canon_id, relation_id,
      created_revision, updated_revision, withdrawn_revision
    )
    select
      (
        substr(md5(relation.canon_id::text || ':' || relation.id::text), 1, 8) || '-' ||
        substr(md5(relation.canon_id::text || ':' || relation.id::text), 9, 4) || '-' ||
        '5' || substr(md5(relation.canon_id::text || ':' || relation.id::text), 14, 3) || '-' ||
        '8' || substr(md5(relation.canon_id::text || ':' || relation.id::text), 18, 3) || '-' ||
        substr(md5(relation.canon_id::text || ':' || relation.id::text), 21, 12)
      )::uuid,
      relation.world_id, relation.canon_id, relation.id,
      relation.created_revision, relation.updated_revision,
      relation.withdrawn_revision
    from relations as relation;

    alter table relations alter column world_id set not null;

    create function ip003_legacy_relation_world_bridge()
    returns trigger
    language plpgsql
    as $function$
    begin
      if new.world_id is null and new.canon_id is not null then
        select world_id into new.world_id from canons where id = new.canon_id;
      end if;
      return new;
    end
    $function$;

    create trigger ip003_legacy_relation_world_bridge
      before insert or update of canon_id on relations
      for each row execute function ip003_legacy_relation_world_bridge();

    create function ip003_legacy_relation_membership_bridge()
    returns trigger
    language plpgsql
    as $function$
    begin
      if new.canon_id is not null then
        insert into canon_relation_memberships (
          id, world_id, canon_id, relation_id,
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
        ) on conflict (id) do update set
          updated_revision = excluded.updated_revision,
          withdrawn_revision = excluded.withdrawn_revision;
      end if;
      return new;
    end
    $function$;

    create trigger ip003_legacy_relation_membership_bridge
      after insert or update of canon_id on relations
      for each row execute function ip003_legacy_relation_membership_bridge();

    alter table relations alter column canon_id drop not null;
    comment on column relations.canon_id is
      'Frozen pre-IP-003 compatibility data. Not written by contract v4 and never a Relation ownership or membership source.';

    create function ip003_assert_relation_membership_state()
    returns trigger
    language plpgsql
    as $function$
    declare
      checked_relation_id uuid;
      relation_withdrawn_revision integer;
      active_membership_count integer;
    begin
      if tg_table_name = 'relations' then
        checked_relation_id := coalesce(new.id, old.id);
      else
        checked_relation_id := coalesce(new.relation_id, old.relation_id);
      end if;
      select withdrawn_revision into relation_withdrawn_revision
      from relations where id = checked_relation_id;
      if not found then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;
      select count(*) into active_membership_count
      from canon_relation_memberships
      where relation_id = checked_relation_id and withdrawn_revision is null;
      if relation_withdrawn_revision is null and active_membership_count = 0 then
        raise exception using errcode = '23514',
          message = 'active Relation must have at least one active Canon membership';
      end if;
      if relation_withdrawn_revision is not null and active_membership_count > 0 then
        raise exception using errcode = '23514',
          message = 'withdrawn Relation cannot retain an active Canon membership';
      end if;
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end
    $function$;

    create constraint trigger ip003_relation_membership_state_from_relation
      after insert or update of withdrawn_revision on relations
      deferrable initially deferred
      for each row execute function ip003_assert_relation_membership_state();

    create constraint trigger ip003_relation_membership_state_from_membership
      after insert or update or delete on canon_relation_memberships
      deferrable initially deferred
      for each row execute function ip003_assert_relation_membership_state();
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const shared = await sql<{ count: string }>`
    select count(*)::text as count from (
      select relation_id from canon_relation_memberships
      where withdrawn_revision is null
      group by relation_id having count(*) > 1
    ) as shared
  `.execute(db);
  if (shared.rows[0]?.count !== "0")
    throw new Error(
      "IP-003 Relation rollback refused: multi-Canon Relation memberships cannot be represented by the legacy schema"
    );
  await sql`
    drop trigger if exists ip003_relation_membership_state_from_membership
      on canon_relation_memberships;
    drop trigger if exists ip003_relation_membership_state_from_relation
      on relations;
    drop function if exists ip003_assert_relation_membership_state();
    drop trigger if exists ip003_legacy_relation_membership_bridge on relations;
    drop function if exists ip003_legacy_relation_membership_bridge();
    drop trigger if exists ip003_legacy_relation_world_bridge on relations;
    drop function if exists ip003_legacy_relation_world_bridge();

    update relations as relation set canon_id = membership.canon_id
    from canon_relation_memberships as membership
    where membership.relation_id = relation.id
      and membership.withdrawn_revision is null
      and relation.canon_id is null;

    alter table relations alter column canon_id set not null;
    drop table canon_relation_memberships;
    alter table relations drop constraint relations_world_id_foreign;
    alter table relations drop constraint relations_world_id_id_unique;
    alter table relations drop column world_id;
  `.execute(db);
}
