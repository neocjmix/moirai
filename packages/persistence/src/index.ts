import type {
  CommitResult,
  CreateChangeSet,
  CreateOperation,
  PublicCanon,
  PublicEvent,
  PublicWorld,
  ProjectionStatus
} from "@moirai/contracts";
import {
  ChangeSetError,
  stableStringify,
  validateCreateChangeSet
} from "@moirai/domain";
import {
  type Generated,
  type JSONColumnType,
  Kysely,
  PostgresDialect,
  sql
} from "kysely";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

interface RevisionFields {
  created_revision: number;
  updated_revision: number;
  withdrawn_revision: number | null;
}

interface WorldTable extends RevisionFields {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  current_revision: number;
  publication_target_revision: number;
}

interface CanonTable extends RevisionFields {
  id: string;
  world_id: string;
  slug: string;
  title: string;
  description: string | null;
}

interface EventTable extends RevisionFields {
  id: string;
  canon_id: string;
  slug: string | null;
  kind: "atomic" | "composite";
  title: string;
  summary: string | null;
  roles: JSONColumnType<readonly string[]>;
  attributes: JSONColumnType<Readonly<Record<string, unknown>>>;
}

interface ChangeSetTable {
  id: string;
  world_id: string;
  request_digest: string;
  actor: string;
  intent: string;
  contract_version: string;
  origins: JSONColumnType<CreateChangeSet["origins"]>;
  result: JSONColumnType<CommitResult>;
  committed_at: Generated<Date>;
}

interface ChangeOperationTable {
  change_set_id: string;
  world_id: string;
  revision: number;
  operation_index: number;
  entity_type: string;
  entity_id: string;
  operation_kind: string;
  before: JSONColumnType<Record<string, unknown>> | null;
  after: JSONColumnType<PublicWorld | PublicCanon | PublicEvent> | null;
}

interface WorldRevisionTable {
  id: string;
  world_id: string;
  revision: number;
  change_set_id: string;
  committed_at: Generated<Date>;
}

interface PublicationStateTable {
  world_id: string;
  served_revision: number;
  projection_status: ProjectionStatus;
  last_error_code: string | null;
  updated_at: Generated<Date>;
}

interface PublicationOutboxTable {
  id: Generated<string>;
  world_id: string;
  target_revision: number;
  change_set_id: string;
  status: "pending" | "processing" | "completed";
  attempt_count: Generated<number>;
  available_at: Generated<Date>;
  lease_expires_at: Date | null;
  last_error_code: string | null;
  created_at: Generated<Date>;
  completed_at: Date | null;
}

export interface DatabaseSchema {
  moirai_system_metadata: {
    key: string;
    value: string;
    updated_at: Date;
  };
  worlds: WorldTable;
  canons: CanonTable;
  events: EventTable;
  change_sets: ChangeSetTable;
  change_operations: ChangeOperationTable;
  world_revisions: WorldRevisionTable;
  world_publication_state: PublicationStateTable;
  publication_outbox: PublicationOutboxTable;
}

export type MoiraiDatabase = Kysely<DatabaseSchema>;

export interface RevisionView {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly events: readonly PublicEvent[];
  readonly generatedAt: string;
}

export interface PublicationJob {
  readonly id: string;
  readonly worldId: string;
  readonly targetRevision: number;
  readonly changeSetId: string;
  readonly attemptCount: number;
}

export function createDatabase(connectionString: string): MoiraiDatabase {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 5 })
    })
  });
}

export async function checkDatabaseReady(db: MoiraiDatabase): Promise<void> {
  await sql`select 1`.execute(db);
}

function uuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function digest(input: CreateChangeSet): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function publicRecord(
  operation: CreateOperation
): PublicWorld | PublicCanon | PublicEvent {
  if (operation.entity_type === "world") {
    return {
      id: operation.entity_id,
      slug: operation.value.slug,
      title: operation.value.title,
      description: operation.value.description ?? null
    };
  }
  if (operation.entity_type === "canon") {
    return {
      id: operation.entity_id,
      world_id: operation.value.world_id,
      slug: operation.value.slug,
      title: operation.value.title,
      description: operation.value.description ?? null
    };
  }
  return {
    id: operation.entity_id,
    canon_id: operation.value.canon_id,
    slug: operation.value.slug ?? null,
    kind: operation.value.kind,
    title: operation.value.title,
    summary: operation.value.summary ?? null,
    roles: operation.value.roles,
    attributes: operation.value.attributes
  };
}

async function applyCreate(
  transaction: MoiraiDatabase,
  operation: CreateOperation,
  revision: number
): Promise<void> {
  const record = publicRecord(operation);
  if (operation.entity_type === "world") {
    await transaction
      .insertInto("worlds")
      .values({
        ...(record as PublicWorld),
        current_revision: revision,
        publication_target_revision: revision,
        created_revision: revision,
        updated_revision: revision,
        withdrawn_revision: null
      })
      .execute();
  } else if (operation.entity_type === "canon") {
    await transaction
      .insertInto("canons")
      .values({
        ...(record as PublicCanon),
        created_revision: revision,
        updated_revision: revision,
        withdrawn_revision: null
      })
      .execute();
  } else {
    await transaction
      .insertInto("events")
      .values({
        ...(record as PublicEvent),
        roles: JSON.stringify((record as PublicEvent).roles),
        attributes: JSON.stringify((record as PublicEvent).attributes),
        created_revision: revision,
        updated_revision: revision,
        withdrawn_revision: null
      })
      .execute();
  }
}

export async function commitCreateChangeSet(
  db: MoiraiDatabase,
  input: CreateChangeSet
): Promise<CommitResult> {
  validateCreateChangeSet(input);
  const requestDigest = digest(input);

  return db.transaction().execute(async (transaction) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${input.world_id}, 0))`.execute(
      transaction
    );

    const replay = await transaction
      .selectFrom("change_sets")
      .select(["request_digest", "result"])
      .where("id", "=", input.change_set_id)
      .executeTakeFirst();
    if (replay) {
      if (replay.request_digest !== requestDigest) {
        throw new ChangeSetError(
          "idempotency_key_reused",
          "Change Set ID has a different request digest"
        );
      }
      return { ...replay.result, idempotent_replay: true };
    }

    const currentWorld = await transaction
      .selectFrom("worlds")
      .select(["current_revision"])
      .where("id", "=", input.world_id)
      .forUpdate()
      .executeTakeFirst();
    const currentRevision = currentWorld?.current_revision ?? 0;
    if (currentRevision !== input.expected_revision) {
      throw new ChangeSetError(
        "revision_conflict",
        `expected revision ${input.expected_revision}, current revision ${currentRevision}`
      );
    }
    const revision = currentRevision + 1;
    if (currentWorld) {
      throw new ChangeSetError(
        "invalid_change_set",
        "Milestone 1 supports initial create only"
      );
    }

    for (const operation of input.operations) {
      await applyCreate(
        transaction as unknown as MoiraiDatabase,
        operation,
        revision
      );
    }

    const result: CommitResult = {
      change_set_id: input.change_set_id,
      world_id: input.world_id,
      current_revision: revision,
      publication_target_revision: revision,
      served_revision: 0,
      idempotent_replay: false
    };
    await transaction
      .insertInto("change_sets")
      .values({
        id: input.change_set_id,
        world_id: input.world_id,
        request_digest: requestDigest,
        actor: input.actor,
        intent: input.intent,
        contract_version: input.contract_version,
        origins: JSON.stringify(input.origins),
        result: JSON.stringify(result)
      })
      .execute();

    for (const [operationIndex, operation] of input.operations.entries()) {
      await transaction
        .insertInto("change_operations")
        .values({
          change_set_id: input.change_set_id,
          world_id: input.world_id,
          revision,
          operation_index: operationIndex,
          entity_type: operation.entity_type,
          entity_id: operation.entity_id,
          operation_kind: operation.kind,
          before: null,
          after: JSON.stringify(publicRecord(operation))
        })
        .execute();
    }

    await transaction
      .insertInto("world_revisions")
      .values({
        id: uuidV7(),
        world_id: input.world_id,
        revision,
        change_set_id: input.change_set_id
      })
      .execute();
    await transaction
      .insertInto("world_publication_state")
      .values({
        world_id: input.world_id,
        served_revision: 0,
        projection_status: "building",
        last_error_code: null
      })
      .execute();
    await transaction
      .insertInto("publication_outbox")
      .values({
        world_id: input.world_id,
        target_revision: revision,
        change_set_id: input.change_set_id,
        status: "pending",
        lease_expires_at: null,
        last_error_code: null,
        completed_at: null
      })
      .execute();
    return result;
  });
}

export async function readWorldAtRevision(
  db: MoiraiDatabase,
  worldId: string,
  revision: number
): Promise<RevisionView> {
  const revisionRecord = await db
    .selectFrom("world_revisions")
    .select("committed_at")
    .where("world_id", "=", worldId)
    .where("revision", "=", revision)
    .executeTakeFirst();
  if (!revisionRecord) throw new Error("World Revision does not exist");
  const operations = await db
    .selectFrom("change_operations")
    .select([
      "entity_type",
      "entity_id",
      "after",
      "revision",
      "operation_index"
    ])
    .where("world_id", "=", worldId)
    .where("revision", "<=", revision)
    .orderBy("revision")
    .orderBy("operation_index")
    .execute();
  const latest = new Map<string, (typeof operations)[number]>();
  for (const operation of operations)
    latest.set(operation.entity_id, operation);
  const records = [...latest.values()].filter(
    (operation) => operation.after !== null
  );
  const world = records.find((record) => record.entity_type === "world")
    ?.after as PublicWorld | undefined;
  if (!world) throw new Error("revision view has no World");
  return {
    world,
    canons: records
      .filter((record) => record.entity_type === "canon")
      .map((record) => record.after as PublicCanon),
    events: records
      .filter((record) => record.entity_type === "event")
      .map((record) => record.after as PublicEvent),
    generatedAt: revisionRecord.committed_at.toISOString()
  };
}

export async function claimPublicationJob(
  db: MoiraiDatabase,
  leaseSeconds = 60
): Promise<PublicationJob | null> {
  const result = await sql<{
    id: string;
    world_id: string;
    target_revision: number;
    change_set_id: string;
    attempt_count: number;
  }>`
    with candidate as (
      select id
      from publication_outbox
      where available_at <= now()
        and (status = 'pending' or (status = 'processing' and lease_expires_at < now()))
      order by id
      for update skip locked
      limit 1
    )
    update publication_outbox as job
      set status = 'processing',
          attempt_count = attempt_count + 1,
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second')
    from candidate
    where job.id = candidate.id
    returning job.id::text, job.world_id::text, job.target_revision,
      job.change_set_id::text, job.attempt_count
  `.execute(db);
  const job = result.rows[0];
  return job
    ? {
        id: job.id,
        worldId: job.world_id,
        targetRevision: job.target_revision,
        changeSetId: job.change_set_id,
        attemptCount: job.attempt_count
      }
    : null;
}

export async function completePublicationJob(
  db: MoiraiDatabase,
  job: PublicationJob,
  servedRevision: number
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    await transaction
      .updateTable("world_publication_state")
      .set({
        served_revision: servedRevision,
        projection_status: "ready",
        last_error_code: null,
        updated_at: new Date()
      })
      .where("world_id", "=", job.worldId)
      .where("served_revision", "<", servedRevision)
      .execute();
    await transaction
      .updateTable("publication_outbox")
      .set({
        status: "completed",
        completed_at: new Date(),
        lease_expires_at: null,
        last_error_code: null
      })
      .where("id", "=", job.id)
      .execute();
  });
}

export async function retryPublicationJob(
  db: MoiraiDatabase,
  job: PublicationJob,
  errorCode: string
): Promise<void> {
  const delaySeconds = Math.min(300, 2 ** Math.min(job.attemptCount, 8));
  await db
    .updateTable("publication_outbox")
    .set({
      status: "pending",
      available_at: new Date(Date.now() + delaySeconds * 1000),
      lease_expires_at: null,
      last_error_code: errorCode.slice(0, 128)
    })
    .where("id", "=", job.id)
    .execute();
  await db
    .updateTable("world_publication_state")
    .set({
      projection_status: "failed",
      last_error_code: errorCode.slice(0, 128),
      updated_at: new Date()
    })
    .where("world_id", "=", job.worldId)
    .execute();
}

export async function getPublicationStatus(
  db: MoiraiDatabase,
  worldId: string
): Promise<{
  currentRevision: number;
  targetRevision: number;
  servedRevision: number;
  projectionStatus: ProjectionStatus;
} | null> {
  const row = await db
    .selectFrom("worlds")
    .innerJoin(
      "world_publication_state",
      "world_publication_state.world_id",
      "worlds.id"
    )
    .select([
      "worlds.current_revision",
      "worlds.publication_target_revision",
      "world_publication_state.served_revision",
      "world_publication_state.projection_status"
    ])
    .where("worlds.id", "=", worldId)
    .executeTakeFirst();
  return row
    ? {
        currentRevision: row.current_revision,
        targetRevision: row.publication_target_revision,
        servedRevision: row.served_revision,
        projectionStatus: row.projection_status
      }
    : null;
}
