// IP-009 version 2 baseline: nested descendant spans now resolve.
// Reviewed against version 1; atomic positions and authored relations are unchanged.
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "../packages/graph-query/src/index.js";
import { ip004ScaleFixture } from "./ip004-scale-fixture";

it("preserves the complete 1k query result across lookup indexing", () => {
  const publication = buildPublicationArtifacts(
    ip004ScaleFixture(1000),
    5,
    "2026-09-13T00:00:00Z"
  );
  const result = queryFromPublicationDocuments(
    publication.manifestBody,
    publication.documents
  )!;
  expect(
    createHash("sha256").update(JSON.stringify(result)).digest("hex")
  ).toBe("3d4c2e2ae497a43e9fa154e0e154e4f3b7aa7a4ba691489a8871706496e1e433");
});
