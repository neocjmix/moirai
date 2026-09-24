/** Staged only. The active /mcp endpoint remains v4 until cutover. */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ChangeSetError } from "@moirai/domain";
import { Ajv } from "ajv";
import {
  V5_CHANGE_PLAN_SCHEMA,
  V5_EVENT_SEARCH_SCHEMA,
  V5_EVENT_DETAIL_SCHEMA
} from "@moirai/contracts/v5-wire";
import type { createV5Clotho } from "@moirai/clotho-application/v5";
import { authenticate, type Credential, type Principal } from "./auth.js";
import {
  oidcAuthenticator,
  type OidcAuthenticator,
  type OidcConfig
} from "./oidc.js";

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
const discovery = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list"
]);

export function registerV5McpRoutes(
  app: FastifyInstance,
  credentials: readonly Credential[],
  service: ReturnType<typeof createV5Clotho>,
  oidc?: OidcConfig,
  verify: OidcAuthenticator = oidcAuthenticator(oidc)
): void {
  const principals = new WeakMap<FastifyRequest, Principal>();
  app.post(
    "/mcp-v5",
    {
      bodyLimit: 1_048_576,
      onRequest: async (request, reply) => {
        reply.header("cache-control", "no-store");
        if (request.headers.origin)
          return reply.code(403).send({ error: "origin_not_allowed" });
      },
      preHandler: async (request, reply) => {
        if (
          !request.headers.authorization &&
          request.headers["content-length"] === "0"
        )
          return reply.code(204).send();
        const principal =
          authenticate(request.headers.authorization, credentials) ??
          (await verify(request.headers.authorization).catch(() => undefined));
        if (principal) {
          principals.set(request, principal);
          return;
        }
        const body = request.body as Record<string, unknown> | undefined;
        if (
          body &&
          !Array.isArray(body) &&
          body.jsonrpc === "2.0" &&
          typeof body.method === "string" &&
          discovery.has(body.method)
        )
          return;
        return reply
          .header("www-authenticate", "Bearer")
          .code(401)
          .send({ error: "unauthorized" });
      }
    },
    async (request, reply) => {
      const actor = principals.get(request);
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
          },
          {
            name: "event_search",
            description:
              "Find World Event title candidates before creating or reusing an Event. Paged, revision-pinned, bounded results.",
            inputSchema: V5_EVENT_SEARCH_SCHEMA as typeof policySchema,
            annotations: { readOnlyHint: true }
          },
          {
            name: "event_get",
            description:
              "Inspect a candidate's single owner Narrative, memberships and adjacent facts at a pinned World Revision; follow bounded pages.",
            inputSchema: V5_EVENT_DETAIL_SCHEMA as typeof policySchema,
            annotations: { readOnlyHint: true }
          }
        ]
      }));
      server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        if (!actor) return errorResult("unauthorized");
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
                : params.name === "event_search"
                  ? await service.search(
                      input as Parameters<typeof service.search>[0],
                      actor
                    )
                  : params.name === "event_get"
                    ? await service.detail(
                        input as Parameters<typeof service.detail>[0],
                        actor
                      )
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
