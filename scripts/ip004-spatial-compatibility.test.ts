// IP-009 version 2 baseline: nested descendant spans now resolve.
// Reviewed against version 1; atomic positions and authored relations are unchanged.
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "../packages/graph-query/src/index.js";
import { buildSpatialArtifacts } from "../packages/graph-presentation/src/artifacts.js";
import { ip004ScaleFixture } from "./ip004-scale-fixture";

it("preserves the entire frozen 1k Graph spatial bundle including every coordinate", () => {
  const publication = buildPublicationArtifacts(
    ip004ScaleFixture(1000),
    5,
    "2026-09-13T00:00:00Z"
  );
  const result = queryFromPublicationDocuments(
    publication.manifestBody,
    publication.documents
  )!;
  const spatial = buildSpatialArtifacts(result, publication.manifestBody);
  // Captured for layout /3 after same-year redistribution stopped treating
  // immutable bucket anchors as movable cluster members; includes all bytes.
  expect(
    createHash("sha256").update(JSON.stringify(spatial)).digest("hex")
  ).toBe("6a0d4c774ea5619e5039213cf8a82ab9a1588b850e0074a6e416334372b57987");
});
