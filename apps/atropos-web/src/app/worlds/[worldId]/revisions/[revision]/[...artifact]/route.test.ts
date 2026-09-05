import { describe, expect, it } from "vitest";

import { artifactPath } from "./route";

describe("revision artifact route allowlist", () => {
  it("serves the revision-pinned English search document", () => {
    expect(artifactPath(["search", "en.json"])).toBe("search/en.json");
  });

  it("rejects unallowlisted search paths", () => {
    expect(() => artifactPath(["search", "private.json"])).toThrow(
      "unsupported artifact"
    );
    expect(() => artifactPath(["search", "en.json", "extra"])).toThrow(
      "unsupported artifact"
    );
  });

  it("serves only ID-scoped Timeline graph artifacts", () => {
    const canonId = "01995c2a-7b00-7000-8000-000000000002";
    const timeSystemId = "01995c2a-7b00-7000-8000-000000000006";
    expect(
      artifactPath([
        "graph",
        "canons",
        canonId,
        `timeline-${timeSystemId}.json`
      ])
    ).toBe(`graph/canons/${canonId}/timeline-${timeSystemId}.json`);
    expect(() =>
      artifactPath(["graph", "canons", canonId, "timeline-private.json"])
    ).toThrow();
  });

  it("serves ID-scoped Subject artifacts", () => {
    const handleId = "01995c2a-7b00-7000-8000-000000000020";
    expect(artifactPath(["subjects", `${handleId}.json`])).toBe(
      `subjects/${handleId}.json`
    );
    expect(() => artifactPath(["subjects", "private.json"])).toThrow();
  });

  it("serves only ID-scoped Process graph artifacts", () => {
    const canonId = "01995c2a-7b00-7000-8000-000000000002";
    const processId = "01995c2a-7b00-7000-8000-000000000021";
    expect(
      artifactPath(["graph", "canons", canonId, `process-${processId}.json`])
    ).toBe(`graph/canons/${canonId}/process-${processId}.json`);
    expect(() =>
      artifactPath(["graph", "canons", canonId, "process-private.json"])
    ).toThrow();
  });

  it("serves the Canon State graph artifact", () => {
    const canonId = "01995c2a-7b00-7000-8000-000000000002";
    expect(artifactPath(["graph", "canons", canonId, "states.json"])).toBe(
      `graph/canons/${canonId}/states.json`
    );
  });
});
