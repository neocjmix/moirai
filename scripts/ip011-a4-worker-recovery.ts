/** Actual worker process + isolated PG17 + local conditional HTTP object store.
 * History-only synthetic fixture; no production database or bucket is used. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "kysely";
import { V5_AUTHORING_POLICY, type CanonicalState } from "@moirai/contracts/v5";
import { createDatabase } from "@moirai/persistence";
import { S3ObjectStore } from "@moirai/publication";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import {
  publishV5CompleteArtifacts,
  readV5ServedRoot
} from "@moirai/publication/v5";
import { migrateToVersion } from "../packages/persistence/src/migrate.js";
import {
  prepare,
  finalize
} from "../packages/persistence/src/cutovers/010_ip011_collections.js";
import { up } from "../packages/persistence/src/cutovers/011_ip011_authoring_search.js";

const source = process.env.DATABASE_URL;
if (!source) throw Error("a4_recovery_database_required");
const admin = createDatabase(source);
const name = `ip011_a4_recovery_${randomBytes(6).toString("hex")}`;
const target = new URL(source);
target.pathname = `/${name}`;
const db = createDatabase(target.toString());
const worldId = "019f5000-1200-7000-8000-000000000001";
const world = {
  id: worldId,
  slug: "recovery",
  title: "Synthetic recovery",
  description: null
};
const state: CanonicalState = {
  world,
  events: [],
  narratives: [],
  collections: [],
  relations: [],
  timeSystems: [],
  collectionTimeSystems: [],
  eventCollectionMemberships: []
};
const objects = new Map<string, { body: string; etag: string }>();
let puts = 0;
let reused = 0;
let pointerWrites = 0;
let paused = false;
let pauseEnabled = false;
const server = createServer(async (request, response) => {
  const key = decodeURIComponent(
    (request.url ?? "").replace(/^\/fixture\//, "")
  );
  const existing = objects.get(key);
  if (request.method === "GET") {
    response
      .writeHead(existing ? 200 : 404, existing ? { etag: existing.etag } : {})
      .end(existing?.body);
    return;
  }
  if (request.method !== "PUT") {
    response.writeHead(405).end();
    return;
  }
  let body = "";
  for await (const chunk of request) body += String(chunk);
  // Evaluate conditions after reading the request body, immediately before write.
  const current = objects.get(key);
  if (
    (request.headers["if-none-match"] === "*" && current) ||
    (request.headers["if-match"] &&
      request.headers["if-match"] !== current?.etag)
  ) {
    reused++;
    response.writeHead(412).end();
    return;
  }
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  objects.set(key, { body, etag });
  puts++;
  if (key.endsWith("/current.json")) pointerWrites++;
  if (pauseEnabled && puts === 100) {
    paused = true;
    return;
  }
  response.writeHead(200, { etag }).end();
});
const children: ChildProcess[] = [];
let childErrors = "";
async function until(
  predicate: () => Promise<boolean> | boolean,
  label: string,
  timeout = 120_000
) {
  const start = performance.now();
  while (!(await predicate())) {
    if (performance.now() - start > timeout)
      throw Error(`a4_recovery_timeout:${label}:${childErrors.slice(-500)}`);
    await delay(100);
  }
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("close", () => resolve());
    child.kill("SIGKILL");
  });
}
const row = async () =>
  (
    await sql<{ status: string; attempt_count: number; lease: Date }>`
  select status, attempt_count, lease_expires_at as lease from publication_outbox where world_id=${worldId}
`.execute(db)
  ).rows[0]!;
let created = false;
try {
  await sql`create database ${sql.id(name)}`.execute(admin);
  created = true;
  await migrateToVersion(target.toString(), "009_ip003_relation_memberships");
  await db.transaction().execute(async (tx) => {
    await prepare(tx);
    await finalize(tx);
    await up(tx);
    await sql`insert into kysely_migration(name,timestamp) values ('010_ip011_collections',${new Date().toISOString()})`.execute(
      tx
    );
    await sql`insert into worlds(id,slug,title,current_revision,publication_target_revision,created_revision,updated_revision)
      values (${worldId},'recovery','Synthetic recovery',32,32,31,32)`.execute(
      tx
    );
    await sql`insert into world_publication_state(world_id,served_revision,projection_status) values (${worldId},31,'pending')`.execute(
      tx
    );
    for (const revision of [31, 32]) {
      const changeId = randomUUID();
      await sql`insert into change_sets(id,world_id,request_digest,actor,intent,contract_version,origins,result,policy_version,policy_digest)
        values (${changeId},${worldId},${"0".repeat(64)},'synthetic','A4 recovery fixture','5','[]','{}',${V5_AUTHORING_POLICY.policy_version},${V5_AUTHORING_POLICY.policy_digest})`.execute(
        tx
      );
      await sql`insert into world_revisions(id,world_id,revision,change_set_id) values (${randomUUID()},${worldId},${revision},${changeId})`.execute(
        tx
      );
      if (revision === 31) {
        await sql`insert into change_operations(change_set_id,world_id,revision,operation_index,entity_type,entity_id,operation_kind,"after")
          values (${changeId},${worldId},31,0,'world',${worldId},'migration',${JSON.stringify(world)}::jsonb)`.execute(
          tx
        );
      } else {
        // Fixed 1k unplaced Events exercise upload/reuse/recovery, not layout scale.
        const operations = Array.from({ length: 1000 }, (_, i) => {
          const id = `019f5000-1200-7000-8001-${i.toString(16).padStart(12, "0")}`;
          const narrativeId = `019f5000-1200-7000-8002-${i.toString(16).padStart(12, "0")}`;
          return [
            {
              index: 2 * i,
              type: "event",
              id,
              value: {
                id,
                world_id: worldId,
                slug: null,
                title: `Event ${i}`,
                summary: null,
                roles: [],
                attributes: {}
              }
            },
            {
              index: 2 * i + 1,
              type: "narrative",
              id: narrativeId,
              value: {
                id: narrativeId,
                world_id: worldId,
                scope_type: "event",
                scope_id: id,
                locale: "ko",
                title: null,
                body: "Synthetic recovery",
                public_references: [],
                notes: []
              }
            }
          ];
        }).flat();
        await sql`insert into change_operations(change_set_id,world_id,revision,operation_index,entity_type,entity_id,operation_kind,"after")
          select ${changeId}::uuid,${worldId}::uuid,32,(o->>'index')::int,o->>'type',(o->>'id')::uuid,'create',o->'value'
          from jsonb_array_elements(${JSON.stringify(operations)}::jsonb) o`.execute(
          tx
        );
        await sql`insert into publication_outbox(world_id,target_revision,change_set_id,status) values (${worldId},32,${changeId},'pending')`.execute(
          tx
        );
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: target.toString(),
    PORT: "0",
    PUBLICATION_CONTRACT_MODE: "v5",
    AWS_ACCESS_KEY_ID: "synthetic",
    AWS_SECRET_ACCESS_KEY: "synthetic",
    AWS_S3_BUCKET_NAME: "fixture",
    AWS_DEFAULT_REGION: "local",
    AWS_ENDPOINT_URL: `http://127.0.0.1:${address.port}`
  };
  // Never inherit operator-action settings into the process under test.
  delete environment.IP011_A3_OPERATOR_ACTION;
  const store = new S3ObjectStore(environment);
  const baseline = await buildV5WorldCompleteArtifacts(state, 31);
  await publishV5CompleteArtifacts(
    store,
    baseline.artifacts,
    new Date().toISOString()
  );
  const oldPointer = objects.get(`worlds/${worldId}/current.json`)!.body;
  puts = 0;
  pointerWrites = 0;
  pauseEnabled = true;
  const launch = () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/lachesis-worker/src/index.ts"],
      { env: environment, stdio: ["ignore", "pipe", "pipe"] }
    );
    child.stdout!.on("data", () => {});
    child.stderr!.on("data", (data: Buffer) => {
      childErrors = (childErrors + data.toString()).slice(-2000);
    });
    children.push(child);
    return child;
  };
  const started = performance.now();
  const first = launch();
  await until(() => paused, "upload_pause");
  const claimed = await row();
  assert.equal(claimed.attempt_count, 1);
  await until(
    async () => (await row()).lease.getTime() > claimed.lease.getTime() + 1000,
    "heartbeat",
    45_000
  );
  assert.equal(objects.get(`worlds/${worldId}/current.json`)!.body, oldPointer);
  await stop(first);
  assert.equal(first.signalCode, "SIGKILL");
  pauseEnabled = false;
  const second = launch();
  await delay(2000);
  assert.equal(
    (await row()).attempt_count,
    1,
    "unexpired claim must not be reclaimed"
  );
  // Explicit time acceleration applies only to this newly created test database.
  await sql`update publication_outbox set lease_expires_at=now()-interval '1 second' where world_id=${worldId}`.execute(
    db
  );
  await until(
    async () => (await row()).status === "completed",
    "restart_complete"
  );
  const completed = await row();
  const served = await readV5ServedRoot(store, worldId);
  assert.equal(completed.attempt_count, 2);
  assert.equal(served.pointer.served_revision, 32);
  assert.equal(pointerWrites, 1);
  assert(
    reused >= 100,
    "restart must verify previously uploaded immutable objects"
  );
  const publication = (
    await sql<{
      served_revision: number;
      projection_status: string;
    }>`select served_revision,projection_status from world_publication_state where world_id=${worldId}`.execute(
      db
    )
  ).rows[0]!;
  assert.deepEqual(publication, {
    served_revision: 32,
    projection_status: "ready"
  });
  await stop(second);
  process.stdout.write(
    JSON.stringify({
      phase: "worker_recovery",
      node: process.version,
      postgres: "17-alpine",
      events: 1000,
      fixture: "history-only unplaced Events",
      elapsed_ms: performance.now() - started,
      heartbeat_renewed: true,
      cancel_signal: first.signalCode,
      attempts: completed.attempt_count,
      immutable_reuse: reused,
      uploaded_objects: puts,
      object_bytes: [...objects.values()].reduce(
        (n, o) => n + Buffer.byteLength(o.body),
        0
      ),
      pointer_writes: pointerWrites,
      served_revision: 32,
      previous_pointer_preserved_during_upload: true,
      lease_expiry: "SQL time acceleration after process death",
      failures: []
    }) + "\n"
  );
} finally {
  for (const child of children) await stop(child);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.destroy();
  if (created)
    await sql`drop database ${sql.id(name)} with (force)`.execute(admin);
  await admin.destroy();
}
