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
  // Captured after shared Event IDs became Canon-independent; includes all artifact bytes.
  expect(
    createHash("sha256").update(JSON.stringify(spatial)).digest("hex")
  ).toBe("5fc6459a2f1083c079ee58ca947797f28592e9a380a49831bf8846d31025b7e5");
});
