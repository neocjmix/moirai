import {
  CLOTHO_METHODS,
  CONTRACT_VERSION,
  clothoInputSchema,
  type ChangePlan,
  type ClothoMethod,
  type CreateChangeSet
} from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";
import {
  changeSetDigest,
  commitCreateChangeSet,
  queryClotho,
  validateChangePlan,
  type MoiraiDatabase
} from "@moirai/persistence";
import type { FastifyInstance } from "fastify";
import { authenticate, type Credential, type Principal } from "./auth.js";

export type ClothoExecutor = (
  method: ClothoMethod,
  input: Record<string, unknown>,
  credential: Principal
) => Promise<unknown>;
export function databaseExecutor(db: MoiraiDatabase): ClothoExecutor {
  return async (method, input, credential) => {
    if (method !== "change.validate" && method !== "change.commit")
      return queryClotho(db, method, input, credential.world_ids);
    const plan = input.plan as ChangePlan;
    const change: CreateChangeSet = { ...plan, actor: credential.actor_id };
    if (input.plan_digest && input.plan_digest !== changeSetDigest(change))
      throw new ChangeSetError(
        "plan_drift",
        "plan_digest",
        "Plan differs from preview"
      );
    return method === "change.validate"
      ? validateChangePlan(db, change)
      : commitCreateChangeSet(db, change);
  };
}
const problem = (code: string, retryable = false) => ({
  error: { code, message: "Request could not be completed", retryable }
});
export function registerClotho(
  app: FastifyInstance,
  credentials: readonly Credential[],
  execute: ClothoExecutor
): void {
  for (const method of CLOTHO_METHODS) {
    app.post(
      `/v1/clotho/${method}`,
      {
        bodyLimit: 1_048_576,
        schema: { body: clothoInputSchema(method) },
        onRequest: async (request, reply) => {
          reply.header("cache-control", "no-store");
          const credential = authenticate(
            request.headers.authorization,
            credentials
          );
          if (!credential)
            return reply
              .header("www-authenticate", "Bearer")
              .code(401)
              .send(problem("unauthorized"));
          const scope = method.startsWith("change.")
            ? "world:write"
            : "world:read";
          if (!credential.scopes.includes(scope))
            return reply.code(403).send(problem("forbidden"));
        }
      },
      async (request, reply) => {
        const credential = authenticate(
          request.headers.authorization,
          credentials
        );
        if (!credential) return reply.code(401).send(problem("unauthorized"));
        const input = request.body as Record<string, unknown>;
        const worldId = method.startsWith("change.")
          ? (input.plan as ChangePlan).world_id
          : input.world_id;
        if (worldId && !credential.world_ids.includes(String(worldId)))
          return reply.code(403).send(problem("forbidden"));
        const result = await execute(method, input, credential);
        if (Buffer.byteLength(JSON.stringify(result)) > 4_000_000) {
          return reply.code(422).send(problem("response_budget_exceeded"));
        }
        return reply
          .header("cache-control", "no-store")
          .send({ contract_version: CONTRACT_VERSION, result });
      }
    );
  }
  app.setErrorHandler((error, _request, reply) => {
    reply.header("cache-control", "no-store");
    if (error instanceof ChangeSetError) {
      const status =
        error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : [
                  "revision_conflict",
                  "plan_drift",
                  "idempotency_key_reused"
                ].includes(error.code)
              ? 409
              : 422;
      return reply.code(status).send({
        error: {
          code: error.code,
          message: "Change or context request is invalid",
          path: error.path,
          affected_ids: error.affected_ids,
          retryable: error.retryable,
          ...(error.recovery ? { recovery: error.recovery } : {})
        }
      });
    }
    const statusCode = (error as { statusCode?: number })?.statusCode;
    const status =
      statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    return reply
      .code(status)
      .send(
        problem(
          status === 500 ? "internal_error" : "invalid_request",
          status === 500
        )
      );
  });
  app.setNotFoundHandler((_request, reply) =>
    reply
      .header("cache-control", "no-store")
      .code(404)
      .send(problem("not_found"))
  );
}
