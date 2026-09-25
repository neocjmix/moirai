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
import { assertV5SchemaReady, readActiveV5State } from "@moirai/persistence/v5";
import { parseCredentials } from "./auth.js";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const eventId = "019f5b00-0000-7000-8000-000000000115";
const changeSetId = "01996a80-0000-7000-8000-000000000001";

export async function runA3Acceptance(environment: NodeJS.ProcessEnv) {
  if (
    environment.CLOTHO_CONTRACT_MODE !== "v5" ||
    environment.CLOTHO_A3_ACCEPTANCE !== "revision-32" ||
    !environment.DATABASE_URL ||
    decodeURIComponent(new URL(environment.DATABASE_URL).pathname.slice(1)) !==
      "railway"
  )
    throw Error("a3_acceptance_configuration_invalid");
  const actor = parseCredentials(environment.CLOTHO_CREDENTIALS_JSON).find(
    (c) =>
      c.world_ids.includes(worldId) &&
      c.scopes.includes("world:read") &&
      c.scopes.includes("world:write") &&
      Date.parse(c.expires_at) > Date.now()
  );
  if (!actor) throw Error("a3_acceptance_actor_unavailable");
  const db = createDatabase(environment.DATABASE_URL);
  try {
    const app = createV5Clotho(databaseV5Lachesis(db));
    const world = await db
      .selectFrom("worlds")
      .select(["id", "slug", "title", "description", "current_revision"])
      .where("id", "=", worldId)
      .executeTakeFirstOrThrow();
    if (world.current_revision !== 31 && world.current_revision !== 32)
      throw Error("a3_acceptance_revision_drift");
    const before = await readActiveV5State(db, worldId);
    const policy = app.policy(worldId, actor) as {
      policy_version: string;
      policy_digest: string;
    };
    const search = (await app.search(
      { world_id: worldId, text: "계유정난", limit: 10 },
      actor
    )) as { events: Array<{ id: string }> };
    if (!search.events.some((event) => event.id === eventId))
      throw Error("a3_acceptance_search_missing");
    const detail = (await app.detail(
      { world_id: worldId, event_id: eventId, at_revision: 31 },
      actor
    )) as { event: { id: string }; narrative: { body: string } };
    if (detail.event.id !== eventId || !detail.narrative.body)
      throw Error("a3_acceptance_history_missing");
    const plan = {
      contract_version: 5,
      change_set_id: changeSetId,
      world_id: worldId,
      expected_revision: 31,
      intent: "IP-011 A3 exact-replay acceptance, preserving World content",
      origins: [
        {
          kind: "human_instruction",
          summary: "Authorized IP-011 A3 controlled production verification"
        }
      ],
      policy_version: policy.policy_version,
      policy_digest: policy.policy_digest,
      operations: [
        {
          kind: "update",
          entity_type: "world",
          entity_id: worldId,
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            slug: world.slug,
            title: world.title,
            description: world.description
          }
        }
      ]
    };
    try {
      await app.commit(
        {
          ...plan,
          change_set_id: "01996a80-0000-7000-8000-000000000002",
          policy_digest: "0".repeat(64)
        },
        actor
      );
      throw Error("a3_acceptance_stale_policy_accepted");
    } catch (error) {
      if (
        !(error instanceof ChangeSetError) ||
        error.code !== "authoring_policy_mismatch"
      )
        throw error;
    }
    const committed = (await app.commit(plan, actor)) as {
      current_revision: number;
      idempotent_replay: boolean;
    };
    const replayed = (await app.commit(plan, actor)) as {
      current_revision: number;
      idempotent_replay: boolean;
    };
    const after = await readActiveV5State(db, worldId);
    if (
      committed.current_revision !== 32 ||
      replayed.current_revision !== 32 ||
      !replayed.idempotent_replay ||
      before.events.length !== after.events.length ||
      before.collections.length !== after.collections.length ||
      before.relations.length !== after.relations.length ||
      before.narratives.length !== after.narratives.length ||
      before.world.slug !== after.world.slug ||
      before.world.title !== after.world.title ||
      before.world.description !== after.world.description
    )
      throw Error("a3_acceptance_readback_mismatch");
    process.stdout.write(
      JSON.stringify({
        operation: "ip011_a3_v5_acceptance",
        result_code: "policy_write_replay_preserved",
        revision: 32,
        change_set_id: changeSetId,
        stale_policy_rejected: true,
        idempotent_replay: true,
        events: after.events.length,
        collections: after.collections.length,
        relations: after.relations.length,
        narratives: after.narratives.length
      }) + "\n"
    );
  } finally {
    await db.destroy();
  }
}

export async function assertV5DeploymentReady(
  config: RuntimeConfig
): Promise<void> {
  if (config.contractMode !== "v5" && config.contractMode !== "v5-readonly")
    return;
  const db = createDatabase(config.databaseUrl);
  try {
    await assertV5SchemaReady(db);
  } finally {
    await db.destroy();
  }
}

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
