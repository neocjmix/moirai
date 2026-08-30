import { checkDatabaseReady, createDatabase } from "@moirai/persistence";
import { createServer } from "node:http";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const version = process.env.APP_VERSION ?? "0.0.0-dev";
const commitSha = process.env.DEPLOY_COMMIT_SHA ?? "local";
const port = Number(process.env.PORT ?? "3002");
const database = createDatabase(databaseUrl);

const server = createServer((request, response) => {
  const respond = (statusCode: number, status: "ok" | "not_ready"): void => {
    response.writeHead(statusCode, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status,
        service: "lachesis-worker",
        version,
        commit_sha: commitSha
      })
    );
  };

  if (request.url === "/health/live") {
    respond(200, "ok");
    return;
  }
  if (request.url === "/health/ready" || request.url === "/health") {
    void checkDatabaseReady(database)
      .then(() => respond(200, "ok"))
      .catch(() => respond(503, "not_ready"));
    return;
  }

  response.writeHead(404).end();
});

const shutdown = (): void => {
  server.close(() => {
    void database.destroy().finally(() => process.exit(0));
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, "0.0.0.0");
