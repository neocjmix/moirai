import { describe, expect, it } from "vitest";

import {
  CURRENT_CACHE_CONTROL,
  REVISION_CACHE_CONTROL,
  createPointer,
  currentKey,
  revisionPrefix
} from "./index.js";

describe("Publication artifact contract", () => {
  it("keeps revision documents pinned and the pointer separate", () => {
    expect(revisionPrefix("world_1", 7)).toBe("worlds/world_1/revisions/7");
    expect(currentKey("world_1")).toBe("worlds/world_1/current.json");
    expect(
      createPointer("world_1", 7, "2026-01-01T00:00:00.000Z")
    ).toMatchObject({
      world_id: "world_1",
      served_revision: 7,
      manifest_key: "worlds/world_1/revisions/7/manifest.json"
    });
  });

  it("defines immutable revision caching and revalidated pointer caching", () => {
    expect(REVISION_CACHE_CONTROL).toContain("immutable");
    expect(CURRENT_CACHE_CONTROL).toContain("must-revalidate");
  });
});
