import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileMigrationProvider,
  Migrator,
  sql,
  type Kysely,
  type QueryExecutorProvider
} from "kysely";
import type { LegacyV4RevisionView } from "@moirai/contracts/legacy-v4";
import { V5_AUTHORING_POLICY, type CanonicalState } from "@moirai/contracts/v5";
import { assertV5CanonicalState, orderedV5State } from "@moirai/domain/v5";
import { stableStringify } from "@moirai/domain";
import { createDatabase, uuidV7, type MoiraiDatabase } from "./index.js";
import { captureDatabaseImage, databaseImageDigest } from "./ip011-backup.js";
import { readLegacyV4WorldAtRevision } from "./legacy-v4-reader.js";
import { readActiveV5State } from "./v5-read.js";
import { readV5WorldAtRevision } from "./v5-history-reader.js";
import {
  IP011_MIGRATION,
  prepare,
  finalize
} from "./cutovers/010_ip011_collections.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const fingerprint = (state: CanonicalState) =>
  hash(stableStringify(orderedV5State(state)));

async function historyDigest(
  db: QueryExecutorProvider,
  worldId: string,
  revision: number
): Promise<string> {
  const result = await sql<{ body: string }>`select jsonb_build_object(
    'revisions', (select jsonb_agg(to_jsonb(r) order by r.revision) from world_revisions r where r.world_id = ${worldId} and r.revision <= ${revision}),
    'operations', (select jsonb_agg(to_jsonb(o) order by o.revision, o.operation_index) from change_operations o where o.world_id = ${worldId} and o.revision <= ${revision}),
    'changes', (select jsonb_agg(to_jsonb(c) - 'policy_version' - 'policy_digest' order by c.id) from change_sets c join world_revisions r on r.change_set_id = c.id where r.world_id = ${worldId} and r.revision <= ${revision})
  )::text as body`.execute(db);
  return hash(result.rows[0]!.body);
}
async function withdrawnRelationsDigest(
  db: QueryExecutorProvider,
  worldId: string
): Promise<string> {
  const result = await sql<{
    body: string;
  }>`select coalesce(jsonb_agg(to_jsonb(r) - 'canon_id' order by r.id), '[]'::jsonb)::text as body from relations r where r.world_id = ${worldId} and r.withdrawn_revision is not null`.execute(
    db
  );
  return hash(result.rows[0]!.body);
}

async function applyReviewedContent(
  db: Kysely<unknown>,
  state: CanonicalState,
  revision: number
): Promise<void> {
  const worldId = state.world.id;
  const narratives = JSON.stringify(state.narratives);
  // Retire superseded rows before creating the one-owner partial unique index.
  await sql`update narratives set withdrawn_revision = ${revision}, updated_revision = ${revision} where world_id = ${worldId} and withdrawn_revision is null and id not in (select (v->>'id')::uuid from jsonb_array_elements(${narratives}::jsonb) v)`.execute(
    db
  );
  await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,title,body,public_references,notes,created_revision,updated_revision)
    select id,world_id,scope_type,scope_id,locale,title,body,public_references,notes,${revision},${revision}
    from jsonb_to_recordset(${narratives}::jsonb) as n(id uuid,world_id uuid,scope_type text,scope_id uuid,locale text,title text,body text,public_references jsonb,notes jsonb)
    on conflict(id) do update set world_id=excluded.world_id,scope_type=excluded.scope_type,scope_id=excluded.scope_id,locale=excluded.locale,title=excluded.title,body=excluded.body,public_references=excluded.public_references,notes=excluded.notes,updated_revision=excluded.updated_revision`.execute(
    db
  );
  await sql`update worlds set title=${state.world.title}, description=${state.world.description}, current_revision=${revision}, publication_target_revision=${revision}, updated_revision=${revision} where id=${worldId}`.execute(
    db
  );
  await sql`update collections c set title=v.title,description=v.description,updated_revision=${revision} from jsonb_to_recordset(${JSON.stringify(state.collections)}::jsonb) as v(id uuid,title text,description text) where c.id=v.id and c.world_id=${worldId}`.execute(
    db
  );
  await sql`update events e set summary=v.summary,attributes=v.attributes,updated_revision=${revision} from jsonb_to_recordset(${JSON.stringify(state.events)}::jsonb) as v(id uuid,summary text,attributes jsonb) where e.id=v.id and e.world_id=${worldId}`.execute(
    db
  );
  await sql`update relations set updated_revision=${revision} where world_id=${worldId} and withdrawn_revision is null`.execute(
    db
  );
}

/** Only a verified isolated copy can invoke this entry point. There is deliberately
 * no flag to authorize an operational source migration or any S3 write. */
export async function rehearseV5Database(
  sourceUrl: string,
  targetName: string,
  input: {
    readonly world_id: string;
    readonly expected_revision: number;
    readonly preservation_digest: string;
    readonly build_candidate: (
      snapshot: LegacyV4RevisionView
    ) => CanonicalState;
  }
) {
  if (!/^ip011_rehearsal_[0-9a-f]{16}$/.test(targetName))
    throw Error("isolated_rehearsal_name_required");
  if (!/^[0-9a-f]{64}$/.test(input.preservation_digest))
    throw Error("preservation_digest_required");
  const targetUrl = new URL(sourceUrl);
  if (decodeURIComponent(targetUrl.pathname.slice(1)) === targetName)
    throw Error("source_target_collision");
  targetUrl.pathname = `/${targetName}`;
  const source = createDatabase(sourceUrl);
  const target = createDatabase(targetUrl.toString());
  try {
    const sourceDigest = databaseImageDigest(
      await captureDatabaseImage(source)
    );
    if (
      databaseImageDigest(await captureDatabaseImage(target)) !== sourceDigest
    )
      throw Error("rehearsal_copy_drift");
    const identity = (
      await sql<{ name: string }>`select current_database() as name`.execute(
        target
      )
    ).rows[0];
    if (identity?.name !== targetName)
      throw Error("rehearsal_database_mismatch");
    const snapshot = await readLegacyV4WorldAtRevision(
      target,
      input.world_id,
      input.expected_revision
    );
    const candidate = input.build_candidate(snapshot);
    if (candidate.world.id !== input.world_id)
      throw Error("candidate_world_mismatch");
    assertV5CanonicalState(candidate);
    const historyBefore = await historyDigest(
      target,
      input.world_id,
      input.expected_revision
    );
    const withdrawnBefore = await withdrawnRelationsDigest(
      target,
      input.world_id
    );
    const candidateDigest = fingerprint(candidate);
    const sourceSnapshotDigest = hash(stableStringify(snapshot));
    const changeSetId = uuidV7();
    const revisionId = uuidV7();
    const revision = input.expected_revision + 1;
    const fileProvider = new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "migrations"
      )
    });
    const migrator = new Migrator({
      db: target,
      provider: {
        async getMigrations() {
          return {
            ...(await fileProvider.getMigrations()),
            [IP011_MIGRATION]: {
              async up(db: Kysely<unknown>) {
                await sql`set local lock_timeout = '5s'`.execute(db);
                await sql`set local statement_timeout = '30s'`.execute(db);
                const worlds = (
                  await sql<{
                    id: string;
                    current_revision: number;
                  }>`select id,current_revision from worlds order by id for update`.execute(
                    db
                  )
                ).rows;
                if (
                  worlds.length !== 1 ||
                  worlds[0]?.id !== input.world_id ||
                  worlds[0].current_revision !== input.expected_revision
                )
                  throw Error("rehearsal_revision_drift");
                const lockedSnapshot = await readLegacyV4WorldAtRevision(
                  db as unknown as MoiraiDatabase,
                  input.world_id,
                  input.expected_revision
                );
                if (
                  hash(stableStringify(lockedSnapshot)) !== sourceSnapshotDigest
                )
                  throw Error("rehearsal_snapshot_drift");
                const result = {
                  change_set_id: changeSetId,
                  world_id: input.world_id,
                  current_revision: revision,
                  publication_target_revision: revision,
                  served_revision: input.expected_revision,
                  idempotent_replay: false,
                  id_mapping: {},
                  warnings: []
                };
                // Archive applicability rows while their exact v4 table representation exists.
                const provenance = (
                  await sql<{
                    id: string;
                    value: Record<string, unknown>;
                  }>`select id,to_jsonb(m) as value from canon_relation_memberships m order by id`.execute(
                    db
                  )
                ).rows;
                await prepare(db);
                await sql`insert into change_sets(id,world_id,request_digest,actor,intent,contract_version,origins,result,policy_version,policy_digest)
          values (${changeSetId},${input.world_id},${input.preservation_digest},'system:ip011-migration','Apply reviewed IP-011 canonical realignment','5',${JSON.stringify([{ kind: "system_derived", summary: "Versioned IP-011 preservation migration" }])}::jsonb,${JSON.stringify(result)}::jsonb,${V5_AUTHORING_POLICY.policy_version},${V5_AUTHORING_POLICY.policy_digest})`.execute(
                  db
                );
                await sql`insert into world_revisions(id,world_id,revision,change_set_id) values (${revisionId},${input.world_id},${revision},${changeSetId})`.execute(
                  db
                );
                await applyReviewedContent(db, candidate, revision);
                const records: {
                  entity_type: string;
                  entity_id: string;
                  operation_kind: string;
                  after: unknown;
                }[] = [];
                for (const [entityType, values] of [
                  ["world", [candidate.world]],
                  ["collection", candidate.collections],
                  ["time_system", candidate.timeSystems],
                  ["collection_time_system", candidate.collectionTimeSystems],
                  ["event", candidate.events],
                  ["relation", candidate.relations],
                  ["narrative", candidate.narratives]
                ] as const)
                  for (const value of values)
                    records.push({
                      entity_type: entityType,
                      entity_id: value.id,
                      operation_kind: "migration",
                      after: value
                    });
                for (const membership of candidate.eventCollectionMemberships)
                  records.push({
                    entity_type: "event_collection_membership",
                    entity_id: uuidV7(),
                    operation_kind: "add",
                    after: membership
                  });
                for (const old of snapshot.narratives)
                  if (!candidate.narratives.some((n) => n.id === old.id))
                    records.push({
                      entity_type: "narrative",
                      entity_id: old.id,
                      operation_kind: "withdraw",
                      after: null
                    });
                for (const row of provenance)
                  records.push({
                    entity_type: "relation_canon_membership",
                    entity_id: row.id,
                    operation_kind: "retire_applicability",
                    after: row.value
                  });
                await sql`insert into change_operations(change_set_id,world_id,revision,operation_index,entity_type,entity_id,operation_kind,"before","after",origin_refs)
          select ${changeSetId},${input.world_id},${revision},(ordinality-1)::integer,v->>'entity_type',(v->>'entity_id')::uuid,v->>'operation_kind',null,nullif(v->'after','null'::jsonb),'[{"field":"*","origin_index":0}]'::jsonb
          from jsonb_array_elements(${JSON.stringify(records)}::jsonb) with ordinality as rows(v,ordinality)`.execute(
                  db
                );
                await finalize(db);
                const actual = await readActiveV5State(db, input.world_id);
                assertV5CanonicalState(actual);
                if (fingerprint(actual) !== candidateDigest)
                  throw Error("v5_readback_mismatch");
                if (
                  (await historyDigest(
                    db,
                    input.world_id,
                    input.expected_revision
                  )) !== historyBefore
                )
                  throw Error("historical_rows_changed");
                if (
                  (await withdrawnRelationsDigest(db, input.world_id)) !==
                  withdrawnBefore
                )
                  throw Error("withdrawn_relations_changed");
                await sql`insert into publication_outbox(world_id,target_revision,change_set_id,status) values (${input.world_id},${revision},${changeSetId},'pending')`.execute(
                  db
                );
                await sql`update world_publication_state set projection_status='building',updated_at=now() where world_id=${input.world_id}`.execute(
                  db
                );
                await sql`set constraints all immediate`.execute(db);
              }
            }
          };
        }
      }
    });
    const migrated = await migrator.migrateTo(IP011_MIGRATION);
    if (migrated.error)
      throw Error("v5_migration_failed", { cause: migrated.error });
    const actual = await readActiveV5State(target, input.world_id);
    if (fingerprint(actual) !== candidateDigest)
      throw Error("v5_committed_readback_mismatch");
    const replayed = await readV5WorldAtRevision(
      target,
      input.world_id,
      revision
    );
    if (fingerprint(replayed) !== candidateDigest)
      throw Error("v5_revision_replay_mismatch");
    const historical = await readLegacyV4WorldAtRevision(
      target,
      input.world_id,
      input.expected_revision
    );
    if (hash(stableStringify(historical)) !== sourceSnapshotDigest)
      throw Error("legacy_revision_changed");
    if (
      databaseImageDigest(await captureDatabaseImage(source)) !== sourceDigest
    )
      throw Error("operational_source_changed");
    return {
      operation: "ip011_v5_database_rehearsal",
      database: targetName,
      migration: IP011_MIGRATION,
      from_revision: input.expected_revision,
      to_revision: revision,
      candidate_digest: candidateDigest,
      history_unchanged: true,
      legacy_revision_unchanged: true,
      v5_revision_replay_matches_active: true,
      withdrawn_relations_unchanged: true,
      operational_source_unchanged: true,
      events: actual.events.length,
      collections: actual.collections.length,
      narratives: actual.narratives.length,
      relations: actual.relations.length,
      publication_processed: false
    };
  } finally {
    await target.destroy();
    await source.destroy();
  }
}
