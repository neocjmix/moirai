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

  it("serves ID-scoped Subject artifacts", () => {
    const handleId = "01995c2a-7b00-7000-8000-000000000020";
    expect(artifactPath(["subjects", `${handleId}.json`])).toBe(
      `subjects/${handleId}.json`
    );
    expect(() => artifactPath(["subjects", "private.json"])).toThrow();
  });

  it("serves the Canon relational-time graph artifact", () => {
    const canonId = "019f3b00-0000-7000-8000-000000000002";
    expect(artifactPath(["graph", "canons", canonId, "temporal.json"])).toBe(
      `graph/canons/${canonId}/temporal.json`
    );
    expect(() =>
      artifactPath(["graph", "canons", "private", "temporal.json"])
    ).toThrow();
  });

  it("rejects superseded numeric temporal artifacts", () => {
    const canonId = "019f3b00-0000-7000-8000-000000000002";
    for (const name of [
      "timeline-019f3b00-0000-7000-8000-000000000003.json",
      "process-019f3b00-0000-7000-8000-000000000107.json",
      "states.json"
    ]) {
      expect(() => artifactPath(["graph", "canons", canonId, name])).toThrow(
        "unsupported artifact"
      );
    }
  });
});
