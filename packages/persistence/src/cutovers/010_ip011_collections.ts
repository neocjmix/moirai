/** Versioned cutover, invoked only by the isolated rehearsal provider until A3.
 * Preparation, reviewed content application and finalization share one migration
 * transaction. Never register preparation alone with the default migrator. */
import { sql, type QueryExecutorProvider } from "kysely";

export const IP011_MIGRATION = "010_ip011_collections";

export async function prepare(db: QueryExecutorProvider): Promise<void> {
  const handles = await sql<{
    count: string;
  }>`select count(*)::text as count from subject_handles`.execute(db);
  if (handles.rows[0]?.count !== "0")
    throw Error("ip011_handle_mapping_required");
  await sql`
    set local lock_timeout = '5s';
    set local statement_timeout = '30s';
    drop trigger ip003_event_membership_state_from_event on events;
    drop trigger ip003_event_membership_state_from_membership on canon_event_memberships;
    drop function ip003_assert_event_membership_state();
    drop trigger ip003_relation_membership_state_from_relation on relations;
    drop trigger ip003_relation_membership_state_from_membership on canon_relation_memberships;
    drop function ip003_assert_relation_membership_state();
    drop trigger ip003_legacy_relation_membership_bridge on relations;
    drop function ip003_legacy_relation_membership_bridge();
    drop trigger ip003_legacy_relation_world_bridge on relations;
    drop function ip003_legacy_relation_world_bridge();

    alter table narratives add column world_id uuid references worlds(id);
    update narratives n set world_id = c.world_id from canons c where c.id = n.canon_id;
    alter table narratives alter column world_id set not null;
    alter table narratives add column notes jsonb not null default '[]'::jsonb;
    alter table narratives drop column canon_id, drop column kind;
    update narratives set scope_type = 'collection' where scope_type = 'canon';
    alter table narratives add constraint narratives_owner_kind check (scope_type in ('event', 'collection'));
    alter table narratives add constraint narratives_notes_array check (jsonb_typeof(notes) = 'array');
    alter table events drop column canon_id, drop column kind;
    alter table relations drop column canon_id;
    alter table canons rename to collections;
    alter table canon_event_memberships rename to collection_event_memberships;
    alter table collection_event_memberships rename column canon_id to collection_id;
    alter table canon_time_systems rename to collection_time_systems;
    alter table collection_time_systems rename column canon_id to collection_id;
    alter table subject_handles drop column canon_id;
    alter table subject_handles add column world_id uuid not null references worlds(id);
    create index subject_handles_world on subject_handles(world_id);
    alter table change_sets add column policy_version varchar(128);
    alter table change_sets add column policy_digest varchar(64);
    alter table change_sets add constraint change_sets_v5_policy_required check (
      contract_version <> '5' or (policy_version is not null and length(policy_version) > 0 and policy_digest is not null and policy_digest ~ '^[0-9a-f]{64}$')
    );
  `.execute(db);
}

export async function finalize(db: QueryExecutorProvider): Promise<void> {
  const missing = await sql<{
    count: string;
  }>`select count(*)::text as count from canon_relation_memberships m where not exists (select 1 from change_operations o where o.entity_type = 'relation_canon_membership' and o.entity_id = m.id and o.operation_kind = 'retire_applicability' and o."after" = to_jsonb(m))`.execute(
    db
  );
  if (missing.rows[0]?.count !== "0")
    throw Error("ip011_relation_provenance_required");
  await sql`
    drop table canon_relation_memberships;
    create unique index narratives_active_owner_unique on narratives(world_id, scope_type, scope_id) where withdrawn_revision is null;
    create index events_world_active on events(world_id, id) where withdrawn_revision is null;
    create index relations_world_active on relations(world_id, id) where withdrawn_revision is null;
    create index narratives_world_active on narratives(world_id, id) where withdrawn_revision is null;

    create function ip011_assert_owner_narrative() returns trigger language plpgsql as $fn$
    declare owner_kind text; owner_id uuid; owner_world uuid; owner_withdrawn integer; active_count integer;
    begin
      if tg_table_name = 'narratives' then
        owner_kind := coalesce(new.scope_type, old.scope_type);
        owner_id := coalesce(new.scope_id, old.scope_id);
        if tg_op = 'UPDATE' and (new.scope_id, new.scope_type, new.world_id) is distinct from (old.scope_id, old.scope_type, old.world_id) then
          raise exception using errcode = '23514', message = 'Narrative owner is immutable';
        end if;
      else
        owner_kind := case when tg_table_name = 'events' then 'event' else 'collection' end;
        owner_id := coalesce(new.id, old.id);
      end if;
      if owner_kind = 'event' then
        select world_id, withdrawn_revision into owner_world, owner_withdrawn from events where id = owner_id;
      else
        select world_id, withdrawn_revision into owner_world, owner_withdrawn from collections where id = owner_id;
      end if;
      if owner_world is null then
        if exists (select 1 from narratives where scope_type = owner_kind and scope_id = owner_id) then
          raise exception using errcode = '23514', message = 'Narrative owner does not exist';
        end if;
      else
        if exists (select 1 from narratives where scope_type = owner_kind and scope_id = owner_id and world_id <> owner_world) then
          raise exception using errcode = '23514', message = 'Narrative owner World mismatch';
        end if;
        select count(*) into active_count from narratives where scope_type = owner_kind and scope_id = owner_id and withdrawn_revision is null;
        if (owner_withdrawn is null and active_count <> 1) or (owner_withdrawn is not null and active_count <> 0) then
          raise exception using errcode = '23514', message = 'Active owner requires exactly one active Narrative';
        end if;
      end if;
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end $fn$;
    create constraint trigger ip011_owner_narrative_from_event after insert or update or delete on events deferrable initially deferred for each row execute function ip011_assert_owner_narrative();
    create constraint trigger ip011_owner_narrative_from_collection after insert or update or delete on collections deferrable initially deferred for each row execute function ip011_assert_owner_narrative();
    create constraint trigger ip011_owner_narrative_from_narrative after insert or update or delete on narratives deferrable initially deferred for each row execute function ip011_assert_owner_narrative();

    create function ip011_assert_membership_state() returns trigger language plpgsql as $fn$
    declare checked_event uuid; checked_collection uuid; checked_membership uuid;
    begin
      if tg_table_name = 'events' then checked_event := coalesce(new.id, old.id);
      elsif tg_table_name = 'collections' then checked_collection := coalesce(new.id, old.id);
      else checked_membership := coalesce(new.id, old.id); end if;
      if exists (
        select 1 from collection_event_memberships m
        join events e on e.id = m.event_id join collections c on c.id = m.collection_id
        where m.withdrawn_revision is null
          and (m.event_id = checked_event or m.collection_id = checked_collection or m.id = checked_membership)
          and (e.withdrawn_revision is not null or c.withdrawn_revision is not null)
      ) then raise exception using errcode = '23514', message = 'Active membership requires active endpoints'; end if;
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end $fn$;
    create constraint trigger ip011_membership_from_event after update or delete on events deferrable initially deferred for each row execute function ip011_assert_membership_state();
    create constraint trigger ip011_membership_from_collection after update or delete on collections deferrable initially deferred for each row execute function ip011_assert_membership_state();
    create constraint trigger ip011_membership_from_membership after insert or update or delete on collection_event_memberships deferrable initially deferred for each row execute function ip011_assert_membership_state();
  `.execute(db);
}
