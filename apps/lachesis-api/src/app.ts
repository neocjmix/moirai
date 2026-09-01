import { HEALTH_RESPONSE_SCHEMA, type HealthResponse } from "@moirai/contracts";
import {
  checkDatabaseReady,
  createDatabase,
  type MoiraiDatabase
} from "@moirai/persistence";
import Fastify, { type FastifyInstance } from "fastify";

import type { RuntimeConfig } from "./config.js";
import { databaseExecutor, registerClotho } from "./clotho.js";
import { registerMcp } from "./mcp.js";

export function buildApp(
  config: RuntimeConfig,
  database: MoiraiDatabase = createDatabase(config.databaseUrl)
): FastifyInstance {
  const app = Fastify({
    logger: true,
    disableRequestLogging: true,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  registerClotho(app, config.credentials ?? [], databaseExecutor(database));
  registerMcp(
    app,
    {
      credentials: config.credentials ?? [],
      oidc: config.oidc,
      version: config.appVersion
    },
    databaseExecutor(database)
  );
  app.addHook("onResponse", async (request, reply) => {
    app.log.info(
      {
        route: request.routeOptions.url,
        status: reply.statusCode,
        elapsed_ms: reply.elapsedTime
      },
      "request completed"
    );
  });

  app.get(
    "/health/live",
    { schema: { response: { 200: HEALTH_RESPONSE_SCHEMA } } },
    async (): Promise<HealthResponse> => ({
      status: "ok",
      service: "lachesis-api",
      version: config.appVersion,
      commit_sha: config.commitSha
    })
  );

  app.get(
    "/health/ready",
    {
      schema: {
        response: { 200: HEALTH_RESPONSE_SCHEMA, 503: HEALTH_RESPONSE_SCHEMA }
      }
    },
    async (_request, reply) => {
      try {
        await checkDatabaseReady(database);
        return {
          status: "ok" as const,
          service: "lachesis-api" as const,
          version: config.appVersion,
          commit_sha: config.commitSha
        };
      } catch {
        return reply.code(503).send({
          status: "not_ready",
          service: "lachesis-api",
          version: config.appVersion,
          commit_sha: config.commitSha
        });
      }
    }
  );

  app.get("/health", async (_request, reply) =>
    reply.redirect("/health/ready")
  );

  app.addHook("onClose", async () => {
    await database.destroy();
  });

  return app;
}
