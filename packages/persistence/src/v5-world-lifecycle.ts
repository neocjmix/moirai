/** Recoverable World retirement. Child rows and immutable history are retained. */
import { createHash } from "node:crypto";
import { sql } from "kysely";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";
import { ChangeSetError, stableStringify } from "@moirai/domain";
import { uuidV7, type MoiraiDatabase } from "./index.js";

interface Input {
  world_id: string;
  change_set_id: string;
  expected_revision: number;
  intent: string;
  policy_version: string;
  policy_digest: string;
}
export async function changeV5WorldLifecycle(
  db: MoiraiDatabase,
  action: "delete" | "restore",
  input: Input,
  actor: string
) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (
    !["delete", "restore"].includes(action) ||
    !uuid.test(actor) ||
    !uuid.test(input.world_id) ||
    !uuid.test(input.change_set_id) ||
    !Number.isSafeInteger(input.expected_revision) ||
    input.expected_revision < 1 ||
    !input.intent ||
    input.intent.length > 2000
  )
    throw new ChangeSetError(
      "invalid_request",
      "lifecycle",
      "Invalid World lifecycle request"
    );
  const requestDigest = createHash("sha256")
    .update(stableStringify({ action, input, actor }))
    .digest("hex");
  return db.transaction().execute(async (tx) => {
    await sql`set local lock_timeout = '5s'`.execute(tx);
    await sql`set local statement_timeout = '30s'`.execute(tx);
    await sql`select pg_advisory_xact_lock(hashtextextended(${input.world_id},0))`.execute(
      tx
    );
    const prior = (
      await sql<{
        request_digest: string;
        result: Record<string, unknown>;
      }>`select request_digest,result from change_sets where id=${input.change_set_id}`.execute(
        tx
      )
    ).rows[0];
    if (prior) {
      if (prior.request_digest !== requestDigest)
        throw new ChangeSetError(
          "idempotency_key_reused",
          "change_set_id",
          "Change Set ID has different content"
        );
      return { ...prior.result, idempotent_replay: true };
    }
    if (
      input.policy_version !== V5_AUTHORING_POLICY.policy_version ||
      input.policy_digest !== V5_AUTHORING_POLICY.policy_digest
    )
      throw new ChangeSetError(
        "authoring_policy_mismatch",
        "policy_version",
        "Retrieve current policy"
      );
    const world = (
      await sql<{
        current_revision: number;
        withdrawn_revision: number | null;
      }>`select current_revision,withdrawn_revision from worlds where id=${input.world_id} for update`.execute(
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
        "Refresh World revision",
        [input.world_id],
        true,
        { current_revision: world.current_revision }
      );
    if ((world.withdrawn_revision !== null) === (action === "delete"))
      throw new ChangeSetError(
        "world_state_conflict",
        "world_id",
        "World already has requested status"
      );
    const revision = world.current_revision + 1;
    const status = action === "delete" ? "withdrawn" : "active";
    const result = {
      world_id: input.world_id,
      change_set_id: input.change_set_id,
      current_revision: revision,
      publication_target_revision: revision,
      status,
      idempotent_replay: false
    };
    await sql`insert into change_sets(id,world_id,request_digest,actor,intent,contract_version,origins,result,policy_version,policy_digest) values (${input.change_set_id},${input.world_id},${requestDigest},${actor},${input.intent},'5',${JSON.stringify([{ kind: "human_instruction", summary: input.intent }])}::jsonb,${JSON.stringify(result)}::jsonb,${input.policy_version},${input.policy_digest})`.execute(
      tx
    );
    await sql`insert into change_operations(change_set_id,world_id,revision,operation_index,entity_type,entity_id,operation_kind,"before","after",origin_refs) values (${input.change_set_id},${input.world_id},${revision},0,'world_lifecycle',${input.world_id},'update',${JSON.stringify({ status: action === "delete" ? "active" : "withdrawn" })}::jsonb,${JSON.stringify({ status })}::jsonb,'[{"field":"*","origin_index":0}]'::jsonb)`.execute(
      tx
    );
    await sql`insert into world_revisions(id,world_id,revision,change_set_id) values (${uuidV7()},${input.world_id},${revision},${input.change_set_id})`.execute(
      tx
    );
    await sql`update worlds set withdrawn_revision=${action === "delete" ? revision : null}, current_revision=${revision},publication_target_revision=${revision},updated_revision=${revision} where id=${input.world_id}`.execute(
      tx
    );
    await sql`update world_publication_state set projection_status='building',updated_at=now() where world_id=${input.world_id}`.execute(
      tx
    );
    await sql`insert into publication_outbox(world_id,target_revision,change_set_id,status) values (${input.world_id},${revision},${input.change_set_id},'pending')`.execute(
      tx
    );
    return result;
  });
}
