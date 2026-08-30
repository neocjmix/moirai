import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicStatus } from "./status";

describe("public status allowlist", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the public smoke workflow without forwarding raw API fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                conclusion: "success",
                created_at: "2026-08-30T01:00:00.000Z",
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
    expect(status.smoke).toEqual({
      result: "passed",
      checked_at: "2026-08-30T01:01:00.000Z",
      run_url: "https://github.com/neocjmix/moirai/actions/runs/1"
    });
    expect(JSON.stringify(status)).not.toContain(
      "private-shape-must-not-forward"
    );
  });
});
