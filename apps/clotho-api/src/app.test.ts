import type { MoiraiDatabase } from "@moirai/persistence";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";

describe("Clotho health metadata", () => {
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
    } finally {
      await app.close();
    }
  });
});
