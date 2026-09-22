// IP-009 version 2 baseline: nested descendant spans now resolve.
// Reviewed against version 1; atomic positions and authored relations are unchanged.
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildPublicationArtifacts } from "@moirai/publication";
import { ip004ScaleFixture } from "./ip004-scale-fixture";

it("preserves every Publication byte for the dense shared-time R5 workload", () => {
  const artifacts = buildPublicationArtifacts(
    ip004ScaleFixture(100),
    5,
    "2026-09-13T00:00:00Z"
  );
  expect(
    createHash("sha256").update(JSON.stringify(artifacts)).digest("hex")
  ).toBe("5e4de92851cc9d894b88ebc23c3921e1067e9606a1e9c4bb436e189c31d3543b");
});
