import type {
  CommitResult,
  CreateChangeSet,
  ProjectionStatus,
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicNarrative,
  PublicRelation,
  PublicTemporalPlacement,
  PublicTimeSystem,
  PublicWorld,
  ValidationIssue
} from "@moirai/contracts";
import {
  ChangeSetError,
  type CanonicalState,
  type ResolvedCreateOperation,
  resolveCreateOperations,
  stableStringify,
  validateCandidateChangeSet,
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
export { queryClotho } from "./clotho-query.js";

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

interface TimeSystemTable extends RevisionFields {
  id: string;
  world_id: string;
  slug: string;
  title: string;
  kind: PublicTimeSystem["kind"];
  definition_version: string;
  definition: JSONColumnType<PublicTimeSystem["definition"]>;
}

interface CanonTimeSystemTable extends RevisionFields {
  id: string;
  canon_id: string;
  time_system_id: string;
}

interface EventTable extends RevisionFields {
  id: string;
  canon_id: string;
  slug: string | null;
  kind: PublicEvent["kind"];
  title: string;
  summary: string | null;
  roles: JSONColumnType<PublicEvent["roles"]>;
  attributes: JSONColumnType<PublicEvent["attributes"]>;
}

interface TemporalPlacementTable extends RevisionFields {
  id: string;
  event_id: string;
  time_system_id: string;
  kind: PublicTemporalPlacement["kind"];
  earliest_start: JSONColumnType<PublicTemporalPlacement["earliest_start"]>;
  latest_start: JSONColumnType<PublicTemporalPlacement["latest_start"]>;
  earliest_end: JSONColumnType<
    PublicTemporalPlacement["earliest_end"],
    string | null,
    string | null
  >;
  latest_end: JSONColumnType<
    PublicTemporalPlacement["latest_end"],
    string | null,
    string | null
  >;
  precision: string;
  certainty: PublicTemporalPlacement["certainty"];
  display_label: string | null;
}

interface RelationTable extends RevisionFields {
  id: string;
  canon_id: string;
  type: PublicRelation["type"];
  source_event_id: string;
  target_event_id: string;
  direction: PublicRelation["direction"];
  attributes: JSONColumnType<PublicRelation["attributes"]>;
}

interface NarrativeTable extends RevisionFields {
  id: string;
  canon_id: string;
  scope_type: PublicNarrative["scope_type"];
  scope_id: string;
  locale: string;
  kind: PublicNarrative["kind"];
  title: string | null;
  body: string;
  public_references: JSONColumnType<PublicNarrative["public_references"]>;
}

interface ChangeSetTable {
  id: string;
  world_id: string;
  request_digest: string;
  actor: string;
  intent: string;
  contract_version: string;
  origins: JSONColumnType<CreateChangeSet["origins"]>;
  warnings: JSONColumnType<readonly ValidationIssue[]>;
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
  after: JSONColumnType<Record<string, unknown>> | null;
  origin_refs: JSONColumnType<
    NonNullable<ResolvedCreateOperation["origin_refs"]>
  >;
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
  moirai_system_metadata: { key: string; value: string; updated_at: Date };
  worlds: WorldTable;
  canons: CanonTable;
  time_systems: TimeSystemTable;
  canon_time_systems: CanonTimeSystemTable;
  events: EventTable;
  event_temporal_placements: TemporalPlacementTable;
  relations: RelationTable;
  narratives: NarrativeTable;
  change_sets: ChangeSetTable;
  change_operations: ChangeOperationTable;
  world_revisions: WorldRevisionTable;
  world_publication_state: PublicationStateTable;
  publication_outbox: PublicationOutboxTable;
}

export type MoiraiDatabase = Kysely<DatabaseSchema>;

export interface RevisionView extends CanonicalState {
  readonly world: PublicWorld;
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

export function changeSetDigest(input: CreateChangeSet): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function revisionFields(revision: number): RevisionFields {
  return {
    created_revision: revision,
    updated_revision: revision,
    withdrawn_revision: null
  };
}

function publicRecord(
  operation: ResolvedCreateOperation
): Record<string, unknown> {
  switch (operation.entity_type) {
    case "world": {
      const value = operation.value;
      return {
        id: operation.entity_id,
        slug: value.slug,
        title: value.title,
        description: value.description ?? null
      };
    }
    case "canon": {
      const value = operation.value;
      return {
        id: operation.entity_id,
        world_id: value.world_id,
        slug: value.slug,
        title: value.title,
        description: value.description ?? null
      };
    }
    case "time_system": {
      const value = operation.value;
      return { id: operation.entity_id, ...value };
    }
    case "canon_time_system": {
      const value = operation.value;
      return { id: operation.entity_id, ...value };
    }
    case "event": {
      const value = operation.value;
      return {
        id: operation.entity_id,
        canon_id: value.canon_id,
        slug: value.slug ?? null,
        kind: value.kind,
        title: value.title,
        summary: value.summary ?? null,
        roles: value.roles,
        attributes: value.attributes
      };
    }
    case "event_temporal_placement": {
      const value = operation.value;
      return {
        id: operation.entity_id,
        event_id: value.event_id,
        time_system_id: value.time_system_id,
        kind: value.kind,
        earliest_start: value.earliest_start,
        latest_start: value.latest_start,
        earliest_end: value.earliest_end ?? null,
        latest_end: value.latest_end ?? null,
        precision: value.precision,
        certainty: value.certainty,
        display_label: value.display_label ?? null
      };
    }
    case "relation": {
      const value = operation.value;
      return { id: operation.entity_id, ...value };
    }
    case "narrative": {
      const value = operation.value;
      return {
        id: operation.entity_id,
        canon_id: value.canon_id,
        scope_type: value.scope_type,
        scope_id: value.scope_id,
        locale: value.locale,
        kind: value.kind,
        title: value.title ?? null,
        body: value.body,
        public_references: value.public_references
      };
    }
  }
}

async function applyCreate(
  transaction: MoiraiDatabase,
  operation: ResolvedCreateOperation,
  revision: number
): Promise<void> {
  const record = publicRecord(operation);
  const revisionData = revisionFields(revision);
  switch (operation.entity_type) {
    case "world":
      await transaction
        .insertInto("worlds")
        .values({
          ...(record as unknown as PublicWorld),
          current_revision: revision,
          publication_target_revision: revision,
          ...revisionData
        })
        .execute();
      break;
    case "canon":
      await transaction
        .insertInto("canons")
        .values({ ...(record as unknown as PublicCanon), ...revisionData })
        .execute();
      break;
    case "time_system": {
      const item = record as unknown as PublicTimeSystem;
      await transaction
        .insertInto("time_systems")
        .values({
          ...item,
          definition: JSON.stringify(item.definition),
          ...revisionData
        })
        .execute();
      break;
    }
    case "canon_time_system":
      await transaction
        .insertInto("canon_time_systems")
        .values({
          ...(record as unknown as PublicCanonTimeSystem),
          ...revisionData
        })
        .execute();
      break;
    case "event": {
      const item = record as unknown as PublicEvent;
      await transaction
        .insertInto("events")
        .values({
          ...item,
          roles: JSON.stringify(item.roles),
          attributes: JSON.stringify(item.attributes),
          ...revisionData
        })
        .execute();
      break;
    }
    case "event_temporal_placement": {
      const item = record as unknown as PublicTemporalPlacement;
      await transaction
        .insertInto("event_temporal_placements")
        .values({
          ...item,
          earliest_start: JSON.stringify(item.earliest_start),
          latest_start: JSON.stringify(item.latest_start),
          earliest_end: item.earliest_end
            ? JSON.stringify(item.earliest_end)
            : null,
          latest_end: item.latest_end ? JSON.stringify(item.latest_end) : null,
          ...revisionData
        })
        .execute();
      break;
    }
    case "relation": {
      const item = record as unknown as PublicRelation;
      await transaction
        .insertInto("relations")
        .values({
          ...item,
          attributes: JSON.stringify(item.attributes),
          ...revisionData
        })
        .execute();
      break;
    }
    case "narrative": {
      const item = record as unknown as PublicNarrative;
      await transaction
        .insertInto("narratives")
        .values({
          ...item,
          public_references: JSON.stringify(item.public_references),
          ...revisionData
        })
        .execute();
      break;
    }
  }
}

function toPublicWorld(row: WorldTable): PublicWorld {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description
  };
}

function withoutRevision<T extends RevisionFields>(
  row: T
): Omit<T, keyof RevisionFields> {
  const {
    created_revision: _created,
    updated_revision: _updated,
    withdrawn_revision: _withdrawn,
    ...record
  } = row;
  void _created;
  void _updated;
  void _withdrawn;
  return record;
}

async function loadCurrentState(
  db: MoiraiDatabase,
  worldRow: WorldTable | undefined
): Promise<CanonicalState> {
  if (!worldRow) {
    return {
      world: null,
      canons: [],
      timeSystems: [],
      canonTimeSystems: [],
      events: [],
      temporalPlacements: [],
      relations: [],
      narratives: []
    };
  }
  const canons = await db
    .selectFrom("canons")
    .selectAll()
    .where("world_id", "=", worldRow.id)
    .where("withdrawn_revision", "is", null)
    .execute();
  const canonIds = canons.map((item) => item.id);
  const timeSystems = await db
    .selectFrom("time_systems")
    .selectAll()
    .where("world_id", "=", worldRow.id)
    .where("withdrawn_revision", "is", null)
    .execute();
  const events =
    canonIds.length > 0
      ? await db
          .selectFrom("events")
          .selectAll()
          .where("canon_id", "in", canonIds)
          .where("withdrawn_revision", "is", null)
          .execute()
      : [];
  const eventIds = events.map((item) => item.id);
  const [canonTimeSystems, placements, relations, narratives] =
    await Promise.all([
      canonIds.length > 0
        ? db
            .selectFrom("canon_time_systems")
            .selectAll()
            .where("canon_id", "in", canonIds)
            .where("withdrawn_revision", "is", null)
            .execute()
        : [],
      eventIds.length > 0
        ? db
            .selectFrom("event_temporal_placements")
            .selectAll()
            .where("event_id", "in", eventIds)
            .where("withdrawn_revision", "is", null)
            .execute()
        : [],
      canonIds.length > 0
        ? db
            .selectFrom("relations")
            .selectAll()
            .where("canon_id", "in", canonIds)
            .where("withdrawn_revision", "is", null)
            .execute()
        : [],
      canonIds.length > 0
        ? db
            .selectFrom("narratives")
            .selectAll()
            .where("canon_id", "in", canonIds)
            .where("withdrawn_revision", "is", null)
            .execute()
        : []
    ]);
  return {
    world: toPublicWorld(worldRow),
    canons: canons.map((item) => withoutRevision(item) as PublicCanon),
    timeSystems: timeSystems.map(
      (item) => withoutRevision(item) as PublicTimeSystem
    ),
    canonTimeSystems: canonTimeSystems.map(
      (item) => withoutRevision(item) as PublicCanonTimeSystem
    ),
    events: events.map((item) => withoutRevision(item) as PublicEvent),
    temporalPlacements: placements.map(
      (item) => withoutRevision(item) as PublicTemporalPlacement
    ),
    relations: relations.map((item) => withoutRevision(item) as PublicRelation),
    narratives: narratives.map(
      (item) => withoutRevision(item) as PublicNarrative
    )
  };
}

export async function commitCreateChangeSet(
  db: MoiraiDatabase,
  input: CreateChangeSet
): Promise<CommitResult> {
  validateCreateChangeSet(input);
  const requestDigest = changeSetDigest(input);
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
          "change_set_id",
          "Change Set ID has a different request digest",
          [input.change_set_id]
        );
      }
      return { ...replay.result, idempotent_replay: true };
    }
    const currentWorld = await transaction
      .selectFrom("worlds")
      .selectAll()
      .where("id", "=", input.world_id)
      .forUpdate()
      .executeTakeFirst();
    const currentRevision = currentWorld?.current_revision ?? 0;
    if (currentRevision !== input.expected_revision) {
      throw new ChangeSetError(
        "revision_conflict",
        "expected_revision",
        "World Revision changed; refresh the World context before retrying",
        [input.world_id],
        true,
        { action: "refresh_context", current_revision: currentRevision }
      );
    }
    const existing = await loadCurrentState(
      transaction as unknown as MoiraiDatabase,
      currentWorld
    );
    const { operations, idMapping } = resolveCreateOperations(input, () =>
      uuidV7()
    );
    const warnings = validateCandidateChangeSet(input, operations, existing);
    const revision = currentRevision + 1;
    for (const operation of operations) {
      await applyCreate(
        transaction as unknown as MoiraiDatabase,
        operation,
        revision
      );
    }
    if (currentWorld) {
      await transaction
        .updateTable("worlds")
        .set({
          current_revision: revision,
          publication_target_revision: revision,
          updated_revision: revision
        })
        .where("id", "=", input.world_id)
        .execute();
    }
    const servedState = currentWorld
      ? await transaction
          .selectFrom("world_publication_state")
          .select("served_revision")
          .where("world_id", "=", input.world_id)
          .executeTakeFirst()
      : undefined;
    const result: CommitResult = {
      change_set_id: input.change_set_id,
      world_id: input.world_id,
      current_revision: revision,
      publication_target_revision: revision,
      served_revision: servedState?.served_revision ?? 0,
      idempotent_replay: false,
      id_mapping: idMapping,
      warnings
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
        warnings: JSON.stringify(warnings),
        result: JSON.stringify(result)
      })
      .execute();
    for (const [operationIndex, operation] of operations.entries()) {
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
          after: JSON.stringify(publicRecord(operation)),
          origin_refs: JSON.stringify(operation.origin_refs ?? [])
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
    if (currentWorld) {
      await transaction
        .updateTable("world_publication_state")
        .set({
          projection_status: "building",
          last_error_code: null,
          updated_at: new Date()
        })
        .where("world_id", "=", input.world_id)
        .execute();
    } else {
      await transaction
        .insertInto("world_publication_state")
        .values({
          world_id: input.world_id,
          served_revision: 0,
          projection_status: "building",
          last_error_code: null
        })
        .execute();
    }
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

export async function validateChangePlan(
  db: MoiraiDatabase,
  input: CreateChangeSet
) {
  validateCreateChangeSet(input);
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (transaction) => {
      const row = await transaction
        .selectFrom("worlds")
        .selectAll()
        .where("id", "=", input.world_id)
        .executeTakeFirst();
      const revision = row?.current_revision ?? 0;
      if (revision !== input.expected_revision) {
        throw new ChangeSetError(
          "revision_conflict",
          "expected_revision",
          "Refresh World context before retrying",
          [input.world_id],
          true,
          { action: "refresh_context", current_revision: revision }
        );
      }
      const existing = await loadCurrentState(transaction, row);
      const { operations, idMapping } = resolveCreateOperations(input, () =>
        uuidV7()
      );
      const warnings = validateCandidateChangeSet(input, operations, existing);
      return {
        valid: true,
        source_revision: revision,
        plan_digest: changeSetDigest(input),
        operations,
        id_mapping: idMapping,
        affected_ids: operations.map((op) => op.entity_id),
        errors: [],
        warnings
      };
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
  const byType = (type: string): Record<string, unknown>[] =>
    records
      .filter((item) => item.entity_type === type)
      .map((item) => item.after!);
  const world = byType("world")[0] as unknown as PublicWorld | undefined;
  if (!world) throw new Error("revision view has no World");
  return {
    world,
    canons: byType("canon") as unknown as PublicCanon[],
    timeSystems: byType("time_system") as unknown as PublicTimeSystem[],
    canonTimeSystems: byType(
      "canon_time_system"
    ) as unknown as PublicCanonTimeSystem[],
    events: byType("event") as unknown as PublicEvent[],
    temporalPlacements: byType(
      "event_temporal_placement"
    ) as unknown as PublicTemporalPlacement[],
    relations: byType("relation") as unknown as PublicRelation[],
    narratives: byType("narrative") as unknown as PublicNarrative[],
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
      select id from publication_outbox
      where available_at <= now()
        and (status = 'pending' or (status = 'processing' and lease_expires_at < now()))
      order by id for update skip locked limit 1
    )
    update publication_outbox as job
      set status = 'processing', attempt_count = attempt_count + 1,
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second')
    from candidate where job.id = candidate.id
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
