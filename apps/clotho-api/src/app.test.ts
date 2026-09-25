import type { MoiraiDatabase } from "@moirai/persistence";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";

describe("Clotho health metadata", () => {
  it("mounts only the v5 contract while preserving the cutover write fence", async () => {
    const token = "syntheticV5CutoverToken0123456789abc";
    const worldId = "01995c2a-7b00-7000-8000-000000000101";
    const app = buildApp(
      {
        contractMode: "v5-readonly",
        appVersion: "5",
        commitSha: "v5sha",
        databaseUrl: "postgres://unused",
        port: 3001,
        credentials: [
          {
            token_sha256: createHash("sha256").update(token).digest("hex"),
            actor_id: "01995c2a-7b00-7000-8000-000000000099",
            scopes: ["world:read", "world:write"],
            world_ids: [worldId],
            expires_at: "2099-01-01T00:00:00Z"
          }
        ]
      },
      { destroy: vi.fn(async () => undefined) } as unknown as MoiraiDatabase
    );
    try {
      const old = await app.inject({
        method: "POST",
        url: "/v1/clotho/change.commit",
        payload: {}
      });
      expect(old.statusCode).toBe(404);
      const policy = await app.inject({
        method: "POST",
        url: "/v2/clotho/authoring.policy.get",
        headers: { authorization: `Bearer ${token}` },
        payload: { contract_version: 5, world_id: worldId }
      });
      expect(policy.statusCode).toBe(200);
      expect(policy.json().contract_version).toBe(5);
      const blocked = await app.inject({
        method: "POST",
        url: "/v2/clotho/change.commit",
        headers: { authorization: `Bearer ${token}` },
        payload: {}
      });
      expect(blocked.json().error.code).toBe("writes_quiesced");
      expect(app.hasRoute({ method: "POST", url: "/mcp" })).toBe(true);
    } finally {
      await app.close();
    }
  });
  it("rejects an authenticated v4 writer during quiescence before touching the database", async () => {
    const token = "syntheticQuiesceToken0123456789abcd";
    const worldId = "01995c2a-7b00-7000-8000-000000000101";
    const database = {
      destroy: vi.fn(async () => undefined)
    } as unknown as MoiraiDatabase;
    const app = buildApp(
      {
        contractMode: "quiesced",
        appVersion: "1.2.3",
        commitSha: "abc123",
        databaseUrl: "postgres://unused",
        port: 3001,
        credentials: [
          {
            token_sha256: createHash("sha256").update(token).digest("hex"),
            actor_id: "01995c2a-7b00-7000-8000-000000000099",
            scopes: ["world:read", "world:write"],
            world_ids: [worldId],
            expires_at: "2099-01-01T00:00:00Z"
          }
        ]
      },
      database
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/clotho/change.validate",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          plan: {
            contract_version: 4,
            change_set_id: "01995c2a-7b00-7000-8000-000000000090",
            world_id: worldId,
            expected_revision: 30,
            intent: "Synthetic cutover probe",
            origins: [
              { kind: "human_instruction", summary: "Synthetic probe" }
            ],
            operations: []
          }
        }
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("writes_quiesced");
    } finally {
      await app.close();
    }
  });
  it("serves exact deployment identity without caching it", async () => {
    const database = {
      destroy: vi.fn(async () => undefined)
    } as unknown as MoiraiDatabase;
    const app = buildApp(
      {
        appVersion: "1.2.3",
        commitSha: "abc123",
        databaseUrl: "postgres://unused",
        port: 3001
      },
      database
    );

    try {
      const response = await app.inject({ method: "GET", url: "/health/live" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({
        status: "ok",
        service: "clotho-api",
        version: "1.2.3",
        commit_sha: "abc123"
      });
      const redirect = await app.inject({ method: "GET", url: "/health" });
      expect(redirect.statusCode).toBe(302);
      expect(redirect.headers.location).toBe("/health/ready");
      expect(redirect.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });
});
