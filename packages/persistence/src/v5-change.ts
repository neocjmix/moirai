/** Internal v5 transaction. Never wire to v4 ingress or the default migrator. */
import { createHash } from "node:crypto";
import { sql, type QueryExecutorProvider } from "kysely";
import type { OriginRef, ResolvedV5Change } from "@moirai/contracts/v5";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { ChangeSetError, stableStringify } from "@moirai/domain";
import { applyV5Operations } from "@moirai/domain/v5-operations";
import { orderedV5State } from "@moirai/domain/v5";
import { uuidV7, type MoiraiDatabase } from "./index.js";
import { readActiveV5State } from "./v5-read.js";

const digest = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pair = (v: { collection_id: string; event_id: string }) =>
  `${v.collection_id}:${v.event_id}`;
type EntityType =
  | "collection"
  | "time_system"
  | "collection_time_system"
  | "event"
  | "relation"
  | "narrative";
interface HistoryChange {
  entity_type: EntityType | "world" | "event_collection_membership";
  entity_id: string;
  operation_kind: "create" | "update" | "withdraw" | "add" | "remove";
  before: unknown;
  after: unknown;
}

/** Attribute final-state diffs to the submitted operations, including the
 * selection/Narrative withdrawals implied by retiring a Collection. */
export function attributeV5ChangeOrigins(
  input: ResolvedV5Change,
  changes: HistoryChange[]
) {
  const direct = new Map<string, OriginRef[]>();
  const collectionRetirements = new Map<string, OriginRef[]>();
  for (const operation of input.operations) {
    const refs = operation.origin_refs;
    if (
      !Array.isArray(refs) ||
      refs.length === 0 ||
      refs.some(
        (ref) =>
          typeof ref?.field !== "string" ||
          ref.field.length === 0 ||
          ref.field.length > 128 ||
          !Number.isSafeInteger(ref.origin_index) ||
          ref.origin_index < 0 ||
          ref.origin_index >= input.origins.length
      )
    )
      throw new ChangeSetError(
        "invalid_origin_refs",
        "operations.origin_refs",
        "Every operation needs valid source references"
      );
    const key =
      operation.entity_type === "event_collection_membership"
        ? `${operation.entity_type}:${pair(operation.value)}`
        : `${operation.entity_type}:${operation.entity_id}`;
    direct.set(key, [...(direct.get(key) ?? []), ...refs]);
    if (operation.kind === "withdraw" && operation.entity_type === "collection")
      collectionRetirements.set(operation.entity_id, refs);
  }
  return changes.map((change) => {
    const before = change.before as Record<string, unknown> | null;
    const after = change.after as Record<string, unknown> | null;
    const selection = (after ?? before) as {
      collection_id: string;
      event_id: string;
    } | null;
    const key =
      change.entity_type === "event_collection_membership" && selection
        ? `${change.entity_type}:${pair(selection)}`
        : `${change.entity_type}:${change.entity_id}`;
    const implicitCollection =
      change.operation_kind === "withdraw" || change.operation_kind === "remove"
        ? change.entity_type === "narrative" &&
          before?.scope_type === "collection"
          ? String(before.scope_id)
          : change.entity_type === "collection_time_system" ||
              change.entity_type === "event_collection_membership"
            ? String(before?.collection_id)
            : null
        : null;
    const refs =
      direct.get(key) ??
      (implicitCollection
        ? collectionRetirements.get(implicitCollection)
        : undefined);
    if (!refs?.length)
      throw new ChangeSetError(
        "missing_change_origin",
        "operations.origin_refs",
        "Every canonical history change must have a source operation",
        [change.entity_id]
      );
    return refs;
  });
}

async function insertEntity(
  db: QueryExecutorProvider,
  type: EntityType,
  value: Record<string, unknown>,
  revision: number
) {
  const body = JSON.stringify(value);
  switch (type) {
    case "collection":
      await sql`insert into collections(id,world_id,slug,title,description,created_revision,updated_revision)
        select id,world_id,slug,title,description,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,world_id uuid,slug text,title text,description text)`.execute(
        db
      );
      break;
    case "time_system":
      await sql`insert into time_systems(id,world_id,slug,title,kind,definition_version,definition,created_revision,updated_revision)
        select id,world_id,slug,title,kind,definition_version,definition,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,world_id uuid,slug text,title text,kind text,definition_version text,definition jsonb)`.execute(
        db
      );
      break;
    case "collection_time_system":
      await sql`insert into collection_time_systems(id,collection_id,time_system_id,created_revision,updated_revision)
        select id,collection_id,time_system_id,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,collection_id uuid,time_system_id uuid)`.execute(
        db
      );
      break;
    case "event":
      await sql`insert into events(id,world_id,slug,title,summary,roles,attributes,created_revision,updated_revision)
        select id,world_id,slug,title,summary,roles,attributes,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,world_id uuid,slug text,title text,summary text,roles jsonb,attributes jsonb)`.execute(
        db
      );
      break;
    case "relation":
      await sql`insert into relations(id,world_id,type,source_ref,target_ref,direction,attributes,created_revision,updated_revision)
        select id,world_id,type,source_ref,target_ref,direction,attributes,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,world_id uuid,type text,source_ref jsonb,target_ref jsonb,direction text,attributes jsonb)`.execute(
        db
      );
      break;
    case "narrative":
      await sql`insert into narratives(id,world_id,scope_type,scope_id,locale,title,body,public_references,notes,created_revision,updated_revision)
        select id,world_id,scope_type,scope_id,locale,title,body,public_references,notes,${revision},${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,world_id uuid,scope_type text,scope_id uuid,locale text,title text,body text,public_references jsonb,notes jsonb)`.execute(
        db
      );
  }
}

async function updateEntity(
  db: QueryExecutorProvider,
  type: EntityType,
  value: Record<string, unknown>,
  revision: number
) {
  const body = JSON.stringify(value);
  switch (type) {
    case "collection":
      await sql`update collections t set slug=v.slug,title=v.title,description=v.description,updated_revision=${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,slug text,title text,description text) where t.id=v.id`.execute(
        db
      );
      break;
    case "event":
      await sql`update events t set slug=v.slug,title=v.title,summary=v.summary,roles=v.roles,attributes=v.attributes,updated_revision=${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,slug text,title text,summary text,roles jsonb,attributes jsonb) where t.id=v.id`.execute(
        db
      );
      break;
    case "narrative":
      await sql`update narratives t set locale=v.locale,title=v.title,body=v.body,public_references=v.public_references,notes=v.notes,updated_revision=${revision}
        from jsonb_to_record(${body}::jsonb) as v(id uuid,locale text,title text,body text,public_references jsonb,notes jsonb) where t.id=v.id`.execute(
        db
      );
      break;
    default:
      throw new ChangeSetError(
        "unsupported_operation",
        "operations",
        "Entity update is unsupported"
      );
  }
}

/** The caller must be a trusted Lachesis boundary with an authorized Actor.
 * Full World read is validation-only and must not be used for interactive queries. */
export async function commitV5Resolved(
  db: MoiraiDatabase,
  input: ResolvedV5Change
) {
  if (
    !uuid.test(input.change_set_id) ||
    !uuid.test(input.world_id) ||
    !uuid.test(input.actor) ||
    !Number.isSafeInteger(input.expected_revision) ||
    input.expected_revision < 1 ||
    !input.intent ||
    !Array.isArray(input.origins) ||
    !Array.isArray(input.operations) ||
    input.operations.length === 0
  )
    throw new ChangeSetError("invalid_request", "plan", "Invalid v5 change");
  const requestDigest = digest(input);
  return db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout = '5s'`.execute(tx);
    await sql`set local statement_timeout = '30s'`.execute(tx);
    await sql`select pg_advisory_xact_lock(hashtextextended(${input.world_id},0))`.execute(
      tx
    );
    const previous = (
      await sql<{
        request_digest: string;
        result: Record<string, unknown>;
      }>`select request_digest,result from change_sets where id=${input.change_set_id}`.execute(
        tx
      )
    ).rows[0];
    if (previous) {
      if (previous.request_digest !== requestDigest)
        throw new ChangeSetError(
          "idempotency_key_reused",
          "change_set_id",
          "Change Set ID has different content",
          [input.change_set_id]
        );
      return { ...previous.result, idempotent_replay: true };
    }
    if (!input.policy_version || !input.policy_digest)
      throw new ChangeSetError(
        "authoring_policy_required",
        "policy_version",
        "Retrieve the current authoring policy",
        [],
        true,
        { action: "authoring.policy.get" }
      );
    if (
      input.policy_version !== V5_AUTHORING_POLICY.policy_version ||
      input.policy_digest !== V5_AUTHORING_POLICY.policy_digest
    )
      throw new ChangeSetError(
        "authoring_policy_mismatch",
        "policy_version",
        "Authoring policy changed",
        [],
        true,
        { action: "authoring.policy.get" }
      );
    const world = (
      await sql<{
        current_revision: number;
      }>`select current_revision from worlds where id=${input.world_id} and withdrawn_revision is null for update`.execute(
        tx
      )
    ).rows[0];
    if (!world)
      throw new ChangeSetError(
        "world_missing",
        "world_id",
        "World does not exist"
      );
    if (world.current_revision !== input.expected_revision)
      throw new ChangeSetError(
        "revision_conflict",
        "expected_revision",
        "Refresh World context",
        [input.world_id],
        true,
        { action: "refresh_context", current_revision: world.current_revision }
      );
    const existing = await readActiveV5State(tx, input.world_id);
    const candidate = applyV5Operations(
      existing,
      input.world_id,
      input.operations
    );
    const revision = world.current_revision + 1;
    const changes: HistoryChange[] = [];
    if (stableStringify(existing.world) !== stableStringify(candidate.world)) {
      await sql`update worlds set slug=${candidate.world.slug},title=${candidate.world.title},description=${candidate.world.description},updated_revision=${revision} where id=${input.world_id}`.execute(
        tx
      );
      changes.push({
        entity_type: "world",
        entity_id: input.world_id,
        operation_kind: "update",
        before: existing.world,
        after: candidate.world
      });
    }
    const types = [
      ["collection", "collections"],
      ["time_system", "timeSystems"],
      ["collection_time_system", "collectionTimeSystems"],
      ["event", "events"],
      ["relation", "relations"],
      ["narrative", "narratives"]
    ] as const;
    // Withdraw dependents before owners. All final-state constraints are deferred.
    for (const [type, key] of [...types].reverse()) {
      const nextIds = new Set(candidate[key].map((v) => v.id));
      for (const old of existing[key]) {
        if (nextIds.has(old.id)) continue;
        await sql`update ${sql.table(type === "time_system" ? "time_systems" : type === "collection_time_system" ? "collection_time_systems" : `${type}s`)} set withdrawn_revision=${revision},updated_revision=${revision} where id=${old.id} and withdrawn_revision is null`.execute(
          tx
        );
        changes.push({
          entity_type: type,
          entity_id: old.id,
          operation_kind: "withdraw",
          before: old,
          after: null
        });
      }
    }
    const oldMemberships = new Map(
      existing.eventCollectionMemberships.map((m) => [pair(m), m])
    );
    const newMemberships = new Map(
      candidate.eventCollectionMemberships.map((m) => [pair(m), m])
    );
    for (const [key, old] of oldMemberships)
      if (!newMemberships.has(key)) {
        const row = (
          await sql<{
            id: string;
          }>`update collection_event_memberships set withdrawn_revision=${revision},updated_revision=${revision}
          where collection_id=${old.collection_id} and event_id=${old.event_id} and withdrawn_revision is null returning id`.execute(
            tx
          )
        ).rows[0];
        if (!row) throw new Error("v5_membership_drift");
        changes.push({
          entity_type: "event_collection_membership",
          entity_id: row.id,
          operation_kind: "remove",
          before: old,
          after: null
        });
      }
    for (const [type, key] of types) {
      const old = new Map(existing[key].map((v) => [v.id, v]));
      for (const value of candidate[key]) {
        const before = old.get(value.id);
        if (before && stableStringify(before) === stableStringify(value))
          continue;
        if (before)
          await updateEntity(
            tx,
            type,
            value as unknown as Record<string, unknown>,
            revision
          );
        else
          await insertEntity(
            tx,
            type,
            value as unknown as Record<string, unknown>,
            revision
          );
        changes.push({
          entity_type: type,
          entity_id: value.id,
          operation_kind: before ? "update" : "create",
          before: before ?? null,
          after: value
        });
      }
    }
    for (const [key, value] of newMemberships)
      if (!oldMemberships.has(key)) {
        const id = uuidV7();
        await sql`insert into collection_event_memberships(id,world_id,collection_id,event_id,created_revision,updated_revision)
          values (${id},${input.world_id},${value.collection_id},${value.event_id},${revision},${revision})`.execute(
          tx
        );
        changes.push({
          entity_type: "event_collection_membership",
          entity_id: id,
          operation_kind: "add",
          before: null,
          after: value
        });
      }
    const reread = await readActiveV5State(tx, input.world_id);
    if (digest(orderedV5State(reread)) !== digest(orderedV5State(candidate)))
      throw new Error("v5_write_readback_mismatch");
    const changeOrigins = attributeV5ChangeOrigins(input, changes);
    const served =
      (
        await sql<{
          served_revision: number;
        }>`select served_revision from world_publication_state where world_id=${input.world_id}`.execute(
          tx
        )
      ).rows[0]?.served_revision ?? 0;
    const result = {
      change_set_id: input.change_set_id,
      world_id: input.world_id,
      current_revision: revision,
      publication_target_revision: revision,
      served_revision: served,
      idempotent_replay: false,
      id_mapping: input.id_mapping ?? {},
      warnings: []
    };
    await sql`insert into change_sets(id,world_id,request_digest,actor,intent,contract_version,origins,result,policy_version,policy_digest)
      values (${input.change_set_id},${input.world_id},${requestDigest},${input.actor},${input.intent},'5',${JSON.stringify(input.origins)}::jsonb,${JSON.stringify(result)}::jsonb,${input.policy_version},${input.policy_digest})`.execute(
      tx
    );
    for (const [index, change] of changes.entries())
      await sql`insert into change_operations(change_set_id,world_id,revision,operation_index,entity_type,entity_id,operation_kind,"before","after",origin_refs)
        values (${input.change_set_id},${input.world_id},${revision},${index},${change.entity_type},${change.entity_id},${change.operation_kind},${change.before === null ? null : JSON.stringify(change.before)}::jsonb,${change.after === null ? null : JSON.stringify(change.after)}::jsonb,${JSON.stringify(changeOrigins[index])}::jsonb)`.execute(
        tx
      );
    await sql`insert into world_revisions(id,world_id,revision,change_set_id) values (${uuidV7()},${input.world_id},${revision},${input.change_set_id})`.execute(
      tx
    );
    await sql`update worlds set current_revision=${revision},publication_target_revision=${revision},updated_revision=${revision} where id=${input.world_id}`.execute(
      tx
    );
    await sql`update world_publication_state set projection_status='building',updated_at=now() where world_id=${input.world_id}`.execute(
      tx
    );
    await sql`insert into publication_outbox(world_id,target_revision,change_set_id,status) values (${input.world_id},${revision},${input.change_set_id},'pending')`.execute(
      tx
    );
    await sql`set constraints all immediate`.execute(tx);
    return result;
  });
}
