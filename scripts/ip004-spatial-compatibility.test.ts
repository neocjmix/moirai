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
  // Layout /4 changes the versioned bundle identity only for this anchored
  // fixture. Re-running with /3 reproduces the previous full-bundle hash.
  expect(
    createHash("sha256").update(JSON.stringify(spatial)).digest("hex")
  ).toBe("bd347fd3a7c29415b7fa4e26cefa0debd234fd71362d5074ee78f68d24e0988d");
});
