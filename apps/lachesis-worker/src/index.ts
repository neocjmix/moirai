import {
  checkDatabaseReady,
  claimPublicationJob,
  completePublicationJob,
  createDatabase,
  readWorldAtRevision,
  reconcileSubjectHandleState,
  renewPublicationJobLease,
  retryPublicationJob
} from "@moirai/persistence";
import {
  buildPublicationArtifacts,
  publishArtifacts,
  S3ObjectStore
} from "@moirai/publication";
import {
  assertV5SchemaReady,
  readV5WorldAtRevision
} from "@moirai/persistence/v5";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import {
  publishV5CompleteArtifacts,
  readV5ServedRoot
} from "@moirai/publication/v5";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import {
  publishPresentation,
  backfillPresentation
} from "./spatial-publication.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const version = process.env.APP_VERSION ?? "0.0.0-dev";
const commitSha =
  process.env.DEPLOY_COMMIT_SHA ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  "local";
const port = Number(process.env.PORT ?? "3002");
const database = createDatabase(databaseUrl);
const publicationStore = new S3ObjectStore();
const publicationMode = process.env.PUBLICATION_CONTRACT_MODE ?? "v4";
if (!["v4", "quiesced", "v5-hold", "v5"].includes(publicationMode))
  throw Error("invalid_publication_contract_mode");
let stopping = false;

const operatorAction = process.env.IP011_A3_OPERATOR_ACTION;
if (operatorAction) {
  if (
    publicationMode !== "quiesced" ||
    process.env.IP011_WRITE_QUIESCED !== "1"
  )
    throw Error("ip011_operator_requires_quiescence");
  if (operatorAction === "preflight") {
    const name = (
      await sql<{ name: string }>`select current_database() as name`.execute(
        database
      )
    ).rows[0]?.name;
    const worlds = (
      await sql<{
        id: string;
        current_revision: number;
        publication_target_revision: number;
      }>`
        select id, current_revision, publication_target_revision from worlds order by id
      `.execute(database)
    ).rows;
    const pending = (
      await sql<{ count: number }>`
        select count(*)::int as count from publication_outbox where status <> 'completed'
      `.execute(database)
    ).rows[0]?.count;
    process.stdout.write(
      JSON.stringify({
        operation: "ip011_a3_preflight",
        database_name: name,
        worlds,
        pending_publication: pending
      }) + "\n"
    );
  } else if (operatorAction === "cutover-v5") {
    const exit = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        "pnpm",
        ["exec", "tsx", "scripts/ip011-a3-cutover.ts", "cutover-v5"],
        {
          cwd: fileURLToPath(new URL("../../../", import.meta.url)),
          env: process.env,
          stdio: "inherit"
        }
      );
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
    if (exit !== 0)
      throw Error("ip011_a3_cutover_failed_writes_must_remain_quiesced");
  } else {
    throw Error("invalid_ip011_operator_action");
  }
}

async function processNextJob(): Promise<boolean> {
  // The measured 100k v5 build takes about three minutes. Keep its claim
  // beyond that build, while retaining short restart recovery for v4.
  const job = await claimPublicationJob(
    database,
    publicationMode === "v5" ? 300 : 60
  );
  if (!job) return false;
  let leaseLost = false;
  const assertActive = async (): Promise<void> => {
    if (leaseLost || !(await renewPublicationJobLease(database, job, 300))) {
      leaseLost = true;
      throw Error("publication_job_lease_lost");
    }
  };
  // Large immutable uploads can run much longer than the build. The timer
  // renews during network waits; publication also checks before pointer CAS.
  const heartbeat =
    publicationMode === "v5"
      ? setInterval(() => {
          void assertActive().catch(() => {
            leaseLost = true;
          });
        }, 30_000)
      : null;
  try {
    if (publicationMode === "v5") {
      const state = await readV5WorldAtRevision(
        database,
        job.worldId,
        job.targetRevision
      );
      const { artifacts } = await buildV5WorldCompleteArtifacts(
        state,
        job.targetRevision,
        undefined,
        {
          renderPublication:
            process.env.LACHESIS_RENDER_PUBLICATION === "shadow"
        }
      );
      await assertActive();
      const pointer = await publishV5CompleteArtifacts(
        publicationStore,
        artifacts,
        new Date().toISOString(),
        assertActive
      );
      const served = await readV5ServedRoot(publicationStore, job.worldId);
      if (
        served.pointer.served_revision !== job.targetRevision ||
        served.pointer.manifest_sha256 !== pointer.manifest_sha256
      )
        throw Error("v5_publication_readback_mismatch");
      if (!(await completePublicationJob(database, job, job.targetRevision)))
        throw Error("publication_job_lease_lost");
      process.stdout.write(
        JSON.stringify({
          level: "info",
          service: "lachesis-worker",
          operation: "publication_v5",
          world_id: job.worldId,
          revision: job.targetRevision,
          result_code: "served"
        }) + "\n"
      );
      return true;
    }
    const view = await readWorldAtRevision(
      database,
      job.worldId,
      job.targetRevision
    );
    const subjects = await reconcileSubjectHandleState(
      database,
      view,
      job.targetRevision
    );
    const artifacts = buildPublicationArtifacts(
      view,
      job.targetRevision,
      view.generatedAt,
      subjects
    );
    const servedRevision = await publishArtifacts(publicationStore, artifacts);
    await publishPresentation(
      publicationStore,
      artifacts.manifestBody,
      artifacts.documents
    );
    if (!(await completePublicationJob(database, job, servedRevision)))
      throw Error("publication_job_lease_lost");
    process.stdout.write(
      JSON.stringify({
        level: "info",
        service: "lachesis-worker",
        operation: "publication",
        world_id: job.worldId,
        change_set_id: job.changeSetId,
        revision: job.targetRevision,
        result_code: "served",
        retry_count: job.attemptCount - 1
      }) + "\n"
    );
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? error.message.slice(0, 128)
        : "projection_failed";
    const retried = await retryPublicationJob(database, job, errorCode);
    process.stderr.write(
      JSON.stringify({
        level: "error",
        service: "lachesis-worker",
        operation: "publication",
        world_id: job.worldId,
        change_set_id: job.changeSetId,
        revision: job.targetRevision,
        result_code: retried ? errorCode : "publication_job_lease_lost",
        retry_count: job.attemptCount
      }) + "\n"
    );
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
  return true;
}

async function workerLoop(): Promise<void> {
  if (publicationMode === "v5" || publicationMode === "v5-hold")
    await assertV5SchemaReady(database);
  if (publicationMode === "v4") {
    try {
      await backfillPresentation(publicationStore);
    } catch {
      process.stderr.write(
        JSON.stringify({
          level: "error",
          service: "lachesis-worker",
          operation: "spatial_backfill",
          result_code: "backfill_failed"
        }) + "\n"
      );
    }
  }
  while (!stopping) {
    const processed =
      publicationMode === "quiesced" || publicationMode === "v5-hold"
        ? false
        : await processNextJob();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

const server = createServer((request, response) => {
  const respond = (statusCode: number, status: "ok" | "not_ready"): void => {
    response.writeHead(statusCode, {
      "cache-control": "no-store",
      "content-type": "application/json"
    });
    response.end(
      JSON.stringify({
        status,
        service: "lachesis-worker",
        version,
        commit_sha: commitSha
      })
    );
  };

  if (request.url === "/health/live") return respond(200, "ok");
  if (request.url === "/health/ready" || request.url === "/health") {
    void Promise.all([
      checkDatabaseReady(database),
      publicationStore.get("health/readiness.json").then((result) => {
        if (result.status !== 200 && result.status !== 404) {
          throw new Error("Publication Store is unavailable");
        }
      })
    ])
      .then(() => respond(200, "ok"))
      .catch(() => respond(503, "not_ready"));
    return;
  }
  response.writeHead(404).end();
});

const shutdown = (): void => {
  stopping = true;
  server.close(() => {
    void database.destroy().finally(() => process.exit(0));
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, "0.0.0.0");
void workerLoop().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "worker loop failed";
  process.stderr.write(
    JSON.stringify({
      level: "error",
      service: "lachesis-worker",
      operation: "worker_loop",
      result_code: message.slice(0, 128)
    }) + "\n"
  );
  process.exitCode = 1;
  shutdown();
});
