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
  ).toBe("52546ffdad4a8cce99bf64cad78ca59f3e7fb1ec74140f132a13fad04e4565f9");
});
