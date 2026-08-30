import { describe, expect, it } from "vitest";

import { getPublicRuntimeMetadata } from "./runtime";

describe("public runtime metadata", () => {
  it("serializes only explicitly allowlisted deployment fields", () => {
    const metadata = getPublicRuntimeMetadata({
      APP_VERSION: "1.2.3",
      DEPLOY_COMMIT_SHA: "abc123",
      DEPLOYED_AT: "2026-08-30T00:00:00.000Z",
      DATABASE_URL: "must-not-leak",
      PRIVATE_HOSTNAME: "must-not-leak"
    });

    expect(metadata).toEqual({
      version: "1.2.3",
      commitSha: "abc123",
      deployedAt: "2026-08-30T00:00:00.000Z"
    });
    expect(JSON.stringify(metadata)).not.toContain("must-not-leak");
  });
});
