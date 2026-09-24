/** Staged only. The active /mcp endpoint remains v4 until cutover. */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance } from "fastify";
import { ChangeSetError } from "@moirai/domain";
import { Ajv } from "ajv";
import { V5_CHANGE_PLAN_SCHEMA } from "@moirai/contracts/v5-wire";
import type { createV5Clotho } from "@moirai/clotho-application/v5";
import { authenticate, type Credential } from "./auth.js";

const policySchema = {
  type: "object" as const,
  properties: {
    world_id: {
      type: "string" as const,
      pattern:
        "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    contract_version: { const: 5 }
  },
  required: ["world_id", "contract_version"],
  additionalProperties: false
};
const validPolicy = new Ajv({
  removeAdditional: false,
  coerceTypes: false
}).compile(policySchema);
const errorResult = (code: string) => ({
  isError: true,
  content: [
    { type: "text" as const, text: JSON.stringify({ error: { code } }) }
  ]
});

export function registerV5McpRoutes(
  app: FastifyInstance,
  credentials: readonly Credential[],
  service: ReturnType<typeof createV5Clotho>
): void {
  app.post(
    "/mcp-v5",
    {
      bodyLimit: 1_048_576,
      onRequest: async (request, reply) => {
        reply.header("cache-control", "no-store");
        if (request.headers.origin)
          return reply.code(403).send({ error: "origin_not_allowed" });
        if (!authenticate(request.headers.authorization, credentials))
          return reply
            .header("www-authenticate", "Bearer")
            .code(401)
            .send({ error: "unauthorized" });
      }
    },
    async (request, reply) => {
      const actor = authenticate(request.headers.authorization, credentials);
      if (!actor) return reply.code(401).send({ error: "unauthorized" });
      const server = new Server(
        { name: "moirai-clotho-v5-stage", version: "5" },
        {
          capabilities: { tools: {} },
          instructions:
            "Call authoring_policy_get before every write. The policy is versioned and authoritative. This staged endpoint uses contract_version=5."
        }
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "authoring_policy_get",
            description: "Read authoritative v5 policy before authoring.",
            inputSchema: policySchema,
            annotations: { readOnlyHint: true }
          },
          {
            name: "change_commit",
            description:
              "Commit strict v5 operations with policy identity and provenance.",
            inputSchema: V5_CHANGE_PLAN_SCHEMA as typeof policySchema,
            annotations: { destructiveHint: true, idempotentHint: true }
          }
        ]
      }));
      server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        const input = params.arguments ?? {};
        try {
          if (params.name === "authoring_policy_get" && !validPolicy(input))
            return errorResult("invalid_request");
          const result =
            params.name === "authoring_policy_get"
              ? service.policy(
                  (input as { world_id?: string }).world_id ?? "",
                  actor
                )
              : params.name === "change_commit"
                ? await service.commit(input, actor)
                : undefined;
          if (result === undefined) return errorResult("unknown_tool");
          const envelope = { contract_version: 5, result };
          const text = JSON.stringify(envelope);
          if (Buffer.byteLength(text) > 4_000_000)
            return errorResult("response_budget_exceeded");
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: envelope
          };
        } catch (error) {
          return errorResult(
            error instanceof ChangeSetError ? error.code : "internal_error"
          );
        }
      });
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true
      });
      reply.raw.once("close", () => {
        void server.close().catch(() => undefined);
      });
      await server.connect(transport as Parameters<typeof server.connect>[0]);
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    }
  );
}
