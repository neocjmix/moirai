/** Staged v5 HTTP transport. Never register on the live v4 app until the
 * coordinated policy/schema/database/Publication cutover. */
import type { FastifyInstance } from "fastify";
import { ChangeSetError } from "@moirai/domain";
import type { createV5Clotho } from "@moirai/clotho-application/v5";
import { Ajv } from "ajv";
import { authenticate, type Credential } from "./auth.js";

const uuid = {
  type: "string",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
};
const policyInput = {
  type: "object",
  properties: { world_id: uuid, contract_version: { const: 5 } },
  required: ["world_id", "contract_version"],
  additionalProperties: false
};
const validPolicy = new Ajv({
  removeAdditional: false,
  coerceTypes: false
}).compile(policyInput);

export function registerV5ClothoRoutes(
  app: FastifyInstance,
  credentials: readonly Credential[],
  service: ReturnType<typeof createV5Clotho>
): void {
  for (const kind of ["authoring.policy.get", "change.commit"] as const) {
    const scope = kind === "change.commit" ? "world:write" : "world:read";
    app.post(
      `/v2/clotho/${kind}`,
      {
        bodyLimit: 1_048_576,
        // Deliberately no Fastify body schema: its default Ajv removes
        // unknown fields, which could turn a forbidden actor/Canon payload
        // into a valid one. The application contract validates the raw body.
        onRequest: async (request, reply) => {
          reply.header("cache-control", "no-store");
          const actor = authenticate(
            request.headers.authorization,
            credentials
          );
          if (!actor)
            return reply
              .header("www-authenticate", "Bearer")
              .code(401)
              .send({ error: { code: "unauthorized" } });
          if (!actor.scopes.includes(scope))
            return reply.code(403).send({ error: { code: "forbidden" } });
        },
        errorHandler: (error, _request, reply) => {
          reply.header("cache-control", "no-store");
          const code =
            error instanceof ChangeSetError ? error.code : "internal_error";
          return reply
            .code(
              code === "forbidden"
                ? 403
                : code === "internal_error"
                  ? 500
                  : [
                        "revision_conflict",
                        "plan_drift",
                        "idempotency_key_reused"
                      ].includes(code)
                    ? 409
                    : 422
            )
            .send({
              error: {
                code,
                ...(error instanceof ChangeSetError
                  ? {
                      path: error.path,
                      affected_ids: error.affected_ids,
                      retryable: error.retryable,
                      ...(error.recovery ? { recovery: error.recovery } : {})
                    }
                  : {})
              }
            });
        }
      },
      async (request, reply) => {
        const actor = authenticate(request.headers.authorization, credentials);
        if (!actor)
          return reply.code(401).send({ error: { code: "unauthorized" } });
        const input = request.body as { world_id: string };
        if (kind === "authoring.policy.get" && !validPolicy(input))
          throw new ChangeSetError(
            "invalid_request",
            "input",
            "Invalid v5 policy input"
          );
        const result =
          kind === "change.commit"
            ? await service.commit(input, actor)
            : service.policy(input.world_id, actor);
        if (Buffer.byteLength(JSON.stringify(result)) > 4_000_000)
          throw new ChangeSetError(
            "response_budget_exceeded",
            "result",
            "Response budget exceeded"
          );
        return reply
          .header("cache-control", "no-store")
          .send({ contract_version: 5, result });
      }
    );
  }
}
