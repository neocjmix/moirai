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
});
