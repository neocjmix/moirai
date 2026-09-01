import { createHash, randomBytes } from "node:crypto";
import {
  CLOTHO_METHODS,
  CONTRACT_VERSION,
  type ClothoMethod
} from "@moirai/contracts";
import { createClotho } from "@moirai/clotho-application";
import { createLachesis, type CanonicalStore } from "@moirai/lachesis";
import { ChangeSetError } from "@moirai/domain";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerClotho } from "./clotho.js";
import { registerMcp } from "./mcp.js";
import { CLOTHO_CONNECTION_WORLD } from "./oidc.js";
import type { Credential } from "./auth.js";

const token = randomBytes(32).toString("base64url");
const credential: Credential = {
  token_sha256: createHash("sha256").update(token).digest("hex"),
  actor_id: "01995c2a-7b00-7000-8000-000000000199",
  world_ids: [CLOTHO_CONNECTION_WORLD],
  scopes: ["world:read", "world:write"],
  expires_at: "2099-01-01T00:00:00Z"
};
const world_id = CLOTHO_CONNECTION_WORLD,
  entity = "01995c2a-7b00-7000-8000-000000000198";
const plan = {
  contract_version: CONTRACT_VERSION,
  change_set_id: entity,
  world_id,
  expected_revision: 1,
  intent: "Synthetic parity",
  origins: [{ kind: "human_instruction", summary: "Synthetic fixture" }],
  operations: [
    {
      kind: "create",
      entity_type: "event",
      client_ref: "sample",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        canon_id: entity,
        kind: "atomic",
        title: "Synthetic event",
        roles: [],
        attributes: {}
      }
    }
  ]
};
const inputs: Record<ClothoMethod, Record<string, unknown>> = {
  "world.list": {},
  "world.get": { world_id },
  "canon.list": { world_id },
  "canon.get": { world_id, canon_id: entity },
  "event.search": { world_id, canon_id: entity, query: "Synthetic" },
  "event.get": { world_id, event_id: entity },
  "event.neighbors": { world_id, event_id: entity },
  "context.slice": { world_id, canon_ids: [entity], seed_ids: [entity] },
  "change.validate": { plan },
  "change.commit": { plan }
};
function setup() {
  const store = {
    query: vi.fn(async () => ({ source_revision: 1, items: [] })),
    digest: () => "a".repeat(64),
    validate: vi.fn(async () => ({ valid: true, plan_digest: "a".repeat(64) })),
    commit: vi.fn(async () => ({
      current_revision: 2,
      idempotent_replay: true
    }))
  } satisfies CanonicalStore;
  const execute = createClotho(createLachesis(store));
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } }
  });
  registerClotho(app, [credential], execute);
  registerMcp(app, { credentials: [credential], version: "test" }, execute);
  async function pair(method: ClothoMethod, input = inputs[method]) {
    const http = await app.inject({
      method: "POST",
      url: `/v1/clotho/${method}`,
      headers: { authorization: `Bearer ${token}` },
      payload: input
    });
    const mcp = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json, text/event-stream"
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: method.replaceAll(".", "_"), arguments: input }
      }
    });
    return { http, mcp };
  }
  return { app, store, pair };
}
describe("HTTP and MCP through the same Clotho and Lachesis applications", () => {
  it("preserves all ten tool results and exposes no internal command route", async () => {
    const { app, store, pair } = setup();
    try {
      for (const method of CLOTHO_METHODS) {
        const { http, mcp } = await pair(method);
        expect(http.statusCode).toBe(200);
        expect(mcp.json().result.structuredContent).toEqual(http.json());
      }
      expect(store.commit).toHaveBeenCalledWith({
        ...plan,
        actor: credential.actor_id
      });
      for (const path of [
        "/v1/lachesis/change.commit",
        "/v1/change.commit",
        "/internal/commit"
      ])
        expect(
          (
            await app.inject({
              method: "POST",
              url: path,
              headers: { authorization: `Bearer ${token}` },
              payload: { plan }
            })
          ).statusCode
        ).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("preserves input, scope and canonical recovery errors across transports", async () => {
    const { app, store, pair } = setup();
    try {
      for (const [method, input, code] of [
        ["world.list", { limit: "2" }, "invalid_request"],
        ["world.get", { world_id: entity }, "forbidden"],
        [
          "change.commit",
          { plan: { ...plan, actor: "spoofed" } },
          "invalid_request"
        ]
      ] as const) {
        const { http, mcp } = await pair(method, input);
        expect(http.json().error.code).toBe(code);
        expect(JSON.parse(mcp.json().result.content[0].text).error.code).toBe(
          code
        );
      }
      store.commit.mockRejectedValue(
        new ChangeSetError(
          "revision_conflict",
          "expected_revision",
          "private diagnostic",
          [],
          true,
          { action: "refresh_context", current_revision: 3 }
        )
      );
      const { http, mcp } = await pair("change.commit");
      expect(JSON.parse(mcp.json().result.content[0].text).error).toEqual(
        http.json().error
      );
      expect(http.body + mcp.body).not.toMatch(
        /private diagnostic|token_sha256/
      );
    } finally {
      await app.close();
    }
  });
});
