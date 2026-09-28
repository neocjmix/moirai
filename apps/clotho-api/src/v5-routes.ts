/** Production v5 HTTP transport. */
import type { FastifyInstance } from "fastify";
import { ChangeSetError } from "@moirai/domain";
import type { createV5Clotho } from "@moirai/clotho-application/v5";
import { V5_METHODS } from "@moirai/contracts/v5-wire";
import { authenticate, type Credential } from "./auth.js";

export function registerV5ClothoRoutes(
  app: FastifyInstance,
  credentials: readonly Credential[],
  service: ReturnType<typeof createV5Clotho>
): void {
  for (const kind of V5_METHODS) {
    const scope = kind.startsWith("change.") ? "world:write" : "world:read";
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
        const result = await service.execute(kind, request.body, actor);
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
