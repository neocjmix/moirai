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
  ).toBe("482e67153dd8449c88b73645fcf46d15208c04dbdad75335ad55b13c1820a768");
});
