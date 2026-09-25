import { HEALTH_RESPONSE_SCHEMA, type HealthResponse } from "@moirai/contracts";
import {
  checkDatabaseReady,
  createDatabase,
  type MoiraiDatabase
} from "@moirai/persistence";
import Fastify, { type FastifyInstance } from "fastify";

import type { RuntimeConfig } from "./config.js";
import { registerClotho } from "./clotho.js";
import { createClotho } from "@moirai/clotho-application";
import { databaseLachesis } from "@moirai/lachesis/database";
import { registerMcp } from "./mcp.js";
import { createV5Clotho } from "@moirai/clotho-application/v5";
import { databaseV5Lachesis } from "@moirai/lachesis/database";
import { registerV5ClothoRoutes } from "./v5-routes.js";
import { registerV5McpRoutes } from "./v5-mcp.js";
import { ChangeSetError } from "@moirai/domain";

export function buildApp(
  config: RuntimeConfig,
  database: MoiraiDatabase = createDatabase(config.databaseUrl)
): FastifyInstance {
  const app = Fastify({
    logger: true,
    disableRequestLogging: true,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  const mode = config.contractMode ?? "v4";
  if (mode === "quiesced")
    app.addHook("onRequest", async (request, reply) => {
      if (/^\/v1\/clotho\/change\./.test(request.url))
        return reply
          .header("cache-control", "no-store")
          .code(503)
          .send({ error: { code: "writes_quiesced" } });
    });
  if (mode === "v5" || mode === "v5-readonly") {
    const activeService = createV5Clotho(databaseV5Lachesis(database));
    const service =
      mode === "v5-readonly"
        ? {
            ...activeService,
            commit: (() => {
              throw new ChangeSetError(
                "writes_quiesced",
                "method",
                "Writes are paused for IP-011 cutover"
              );
            }) as typeof activeService.commit
          }
        : activeService;
    registerV5ClothoRoutes(app, config.credentials ?? [], service);
    registerV5McpRoutes(
      app,
      config.credentials ?? [],
      service,
      config.oidc,
      undefined,
      "/mcp"
    );
  } else {
    const execute = createClotho(databaseLachesis(database));
    const guardedExecute: typeof execute = (method, input, actor) => {
      if (mode === "quiesced" && method.startsWith("change."))
        throw new ChangeSetError(
          "writes_quiesced",
          "method",
          "Writes are paused for IP-011 cutover"
        );
      return execute(method, input, actor);
    };
    registerClotho(app, config.credentials ?? [], guardedExecute);
    registerMcp(
      app,
      {
        credentials: config.credentials ?? [],
        oidc: config.oidc,
        version: config.appVersion
      },
      guardedExecute
    );
  }
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
    async (_request, reply): Promise<HealthResponse> => {
      reply.header("cache-control", "no-store");
      return {
        status: "ok",
        service: "clotho-api",
        version: config.appVersion,
        commit_sha: config.commitSha
      };
    }
  );

  app.get(
    "/health/ready",
    {
      schema: {
        response: { 200: HEALTH_RESPONSE_SCHEMA, 503: HEALTH_RESPONSE_SCHEMA }
      }
    },
    async (_request, reply) => {
      reply.header("cache-control", "no-store");
      try {
        await checkDatabaseReady(database);
        return {
          status: "ok" as const,
          service: "clotho-api" as const,
          version: config.appVersion,
          commit_sha: config.commitSha
        };
      } catch {
        return reply.code(503).send({
          status: "not_ready",
          service: "clotho-api",
          version: config.appVersion,
          commit_sha: config.commitSha
        });
      }
    }
  );

  app.get("/health", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return reply.redirect("/health/ready");
  });

  app.addHook("onClose", async () => {
    await database.destroy();
  });

  return app;
}
