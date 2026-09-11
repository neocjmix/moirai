import { sql } from "kysely";
import { fileURLToPath } from "node:url";

import { createDatabase, type MoiraiDatabase } from "./index.js";

export interface Ip003CanonEventPreflight {
  readonly worlds: readonly {
    readonly world_id: string;
    readonly current_revision: number;
    readonly publication_target_revision: number;
    readonly served_revision: number;
  }[];
  readonly counts: {
    readonly worlds: number;
    readonly canons: number;
    readonly events: number;
    readonly active_events: number;
    readonly memberships: number;
    readonly active_memberships: number;
    readonly relations: number;
    readonly active_relations: number;
    readonly relation_memberships: number | null;
    readonly active_relation_memberships: number | null;
  };
  readonly invariants: {
    readonly legacy_event_canon_cross_world: number;
    readonly events_without_world: number;
    readonly active_events_without_active_membership: number;
    readonly cross_world_memberships: number;
    readonly duplicate_active_memberships: number;
    readonly world_local_slug_collision_groups: number;
    readonly legacy_relation_canon_cross_world: number;
    readonly relations_without_world: number | null;
    readonly active_relations_without_active_membership: number | null;
    readonly cross_world_relation_memberships: number | null;
    readonly duplicate_active_relation_memberships: number | null;
  };
}

function numbers<T extends Record<string, string>>(
  row: T
): {
  [K in keyof T]: number;
} {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)])
  ) as { [K in keyof T]: number };
}

export async function collectIp003CanonEventPreflight(
  db: MoiraiDatabase
): Promise<Ip003CanonEventPreflight> {
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
    left join world_publication_state as publication on publication.world_id = world.id
    order by world.id
  `.execute(db);

  const counts = await sql<{
    worlds: string;
    canons: string;
    events: string;
    active_events: string;
    memberships: string;
    active_memberships: string;
    relations: string;
    active_relations: string;
  }>`
    select
      (select count(*) from worlds)::text as worlds,
      (select count(*) from canons)::text as canons,
      (select count(*) from events)::text as events,
      (select count(*) from events where withdrawn_revision is null)::text as active_events,
      (select count(*) from canon_event_memberships)::text as memberships,
      (select count(*) from canon_event_memberships where withdrawn_revision is null)::text as active_memberships
      ,(select count(*) from relations)::text as relations
      ,(select count(*) from relations where withdrawn_revision is null)::text as active_relations
  `.execute(db);

  const invariants = await sql<{
    legacy_event_canon_cross_world: string;
    events_without_world: string;
    active_events_without_active_membership: string;
    cross_world_memberships: string;
    duplicate_active_memberships: string;
    world_local_slug_collision_groups: string;
    legacy_relation_canon_cross_world: string;
  }>`
    select
      (
        select count(*)
        from events as event
        join canons as canon on canon.id = event.canon_id
        where event.world_id <> canon.world_id
      )::text as legacy_event_canon_cross_world,
      (select count(*) from events where world_id is null)::text as events_without_world,
      (
        select count(*)
        from events as event
        where event.withdrawn_revision is null
          and not exists (
            select 1 from canon_event_memberships as membership
            where membership.event_id = event.id
              and membership.withdrawn_revision is null
          )
      )::text as active_events_without_active_membership,
      (
        select count(*)
        from canon_event_memberships as membership
        join events as event on event.id = membership.event_id
        join canons as canon on canon.id = membership.canon_id
        where membership.world_id <> event.world_id
           or membership.world_id <> canon.world_id
      )::text as cross_world_memberships,
      (
        select count(*)
        from (
          select canon_id, event_id
          from canon_event_memberships
          where withdrawn_revision is null
          group by canon_id, event_id
          having count(*) > 1
        ) as duplicate
      )::text as duplicate_active_memberships,
      (
        select count(*)
        from (
          select world_id, slug
          from events
          where slug is not null
          group by world_id, slug
          having count(*) > 1
        ) as collision
      )::text as world_local_slug_collision_groups,
      (
        select count(*) from relations as relation
        join canons as canon on canon.id = relation.canon_id
        where canon.world_id <> (
          select endpoint.world_id from events as endpoint
          where endpoint.id = (relation.source_ref->>'event_id')::uuid
          limit 1
        )
      )::text as legacy_relation_canon_cross_world
  `.execute(db);

  const relationMembershipTable = await sql<{ present: boolean }>`
    select to_regclass('public.canon_relation_memberships') is not null as present
  `.execute(db);
  const relationState = relationMembershipTable.rows[0]?.present
    ? numbers(
        (
          await sql<{
            relation_memberships: string;
            active_relation_memberships: string;
            relations_without_world: string;
            active_relations_without_active_membership: string;
            cross_world_relation_memberships: string;
            duplicate_active_relation_memberships: string;
          }>`
            select
              (select count(*) from canon_relation_memberships)::text as relation_memberships,
              (select count(*) from canon_relation_memberships where withdrawn_revision is null)::text as active_relation_memberships,
              (select count(*) from relations where world_id is null)::text as relations_without_world,
              (
                select count(*) from relations as relation
                where relation.withdrawn_revision is null and not exists (
                  select 1 from canon_relation_memberships as membership
                  where membership.relation_id = relation.id
                    and membership.withdrawn_revision is null
                )
              )::text as active_relations_without_active_membership,
              (
                select count(*) from canon_relation_memberships as membership
                join relations as relation on relation.id = membership.relation_id
                join canons as canon on canon.id = membership.canon_id
                where membership.world_id <> relation.world_id
                   or membership.world_id <> canon.world_id
              )::text as cross_world_relation_memberships,
              (
                select count(*) from (
                  select canon_id, relation_id from canon_relation_memberships
                  where withdrawn_revision is null
                  group by canon_id, relation_id having count(*) > 1
                ) as duplicate
              )::text as duplicate_active_relation_memberships
          `.execute(db)
        ).rows[0]!
      )
    : {
        relation_memberships: null,
        active_relation_memberships: null,
        relations_without_world: null,
        active_relations_without_active_membership: null,
        cross_world_relation_memberships: null,
        duplicate_active_relation_memberships: null
      };

  return {
    worlds: worlds.rows,
    counts: {
      ...numbers(counts.rows[0]!),
      relation_memberships: relationState.relation_memberships,
      active_relation_memberships: relationState.active_relation_memberships
    },
    invariants: {
      ...numbers(invariants.rows[0]!),
      relations_without_world: relationState.relations_without_world,
      active_relations_without_active_membership:
        relationState.active_relations_without_active_membership,
      cross_world_relation_memberships:
        relationState.cross_world_relation_memberships,
      duplicate_active_relation_memberships:
        relationState.duplicate_active_relation_memberships
    }
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const db = createDatabase(connectionString);
  try {
    process.stdout.write(
      `${JSON.stringify(await collectIp003CanonEventPreflight(db), null, 2)}\n`
    );
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "IP-003 preflight failed"}\n`
    );
    process.exitCode = 1;
  });
}
