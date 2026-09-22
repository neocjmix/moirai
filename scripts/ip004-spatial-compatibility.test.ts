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
  ).toBe("d3ea3c877b94d943088b7de3860b3198c8cb9c0831bd4707a08326478af01874");
});
