import { describe, expect, it, vi } from "vitest";

import { getPublicStatus } from "./status";

describe("public status allowlist", () => {
  it("exposes current, target and served without forwarding workflow internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                conclusion: "success",
                html_url: "https://github.com/neocjmix/moirai/actions/runs/1",
                status: "completed",
                updated_at: "2026-08-30T01:01:00.000Z",
                logs_url: "private-shape-must-not-forward"
              }
            ]
          }),
          { status: 200 }
        )
      )
    );
    const status = await getPublicStatus();
    expect(status.synthetic_world).toMatchObject({
      current_revision: 2,
      publication_target_revision: 2,
      served_revision: 2,
      projection_status: "ready"
    });
    expect(JSON.stringify(status)).not.toContain(
      "private-shape-must-not-forward"
    );
    vi.unstubAllGlobals();
  });
});
