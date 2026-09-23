import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { V5_AUTHORING_POLICY } from "./v5.js";
it("pins the complete v5 policy content without activating v5 live ingress", () => {
  expect(
    createHash("sha256").update(V5_AUTHORING_POLICY.document).digest("hex")
  ).toBe(V5_AUTHORING_POLICY.policy_digest);
  expect(V5_AUTHORING_POLICY.write_contract_version).toBe(5);
  expect(V5_AUTHORING_POLICY.document).toContain(
    "Successful exact retry recovery precedes"
  );
});
