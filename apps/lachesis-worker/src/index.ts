import {
  checkDatabaseReady,
  claimPublicationJob,
  completePublicationJob,
  createDatabase,
  readWorldAtRevision,
  reconcileSubjectHandleState,
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

async function processNextJob(): Promise<boolean> {
  const job = await claimPublicationJob(database);
  if (!job) return false;
  try {
    if (publicationMode === "v5") {
      const state = await readV5WorldAtRevision(
        database,
        job.worldId,
        job.targetRevision
      );
      const { artifacts } = await buildV5WorldCompleteArtifacts(
        state,
        job.targetRevision
      );
      const pointer = await publishV5CompleteArtifacts(
        publicationStore,
        artifacts,
        new Date().toISOString()
      );
      const served = await readV5ServedRoot(publicationStore, job.worldId);
      if (
        served.pointer.served_revision !== job.targetRevision ||
        served.pointer.manifest_sha256 !== pointer.manifest_sha256
      )
        throw Error("v5_publication_readback_mismatch");
      await completePublicationJob(database, job, job.targetRevision);
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
    await completePublicationJob(database, job, servedRevision);
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
    await retryPublicationJob(database, job, errorCode);
    process.stderr.write(
      JSON.stringify({
        level: "error",
        service: "lachesis-worker",
        operation: "publication",
        world_id: job.worldId,
        change_set_id: job.changeSetId,
        revision: job.targetRevision,
        result_code: errorCode,
        retry_count: job.attemptCount
      }) + "\n"
    );
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
