import { describe, expect, it } from "vitest";

import { HEALTH_RESPONSE_SCHEMA, MILESTONE_ZERO_WORLD } from "./index.js";

describe("Milestone 0 synthetic World", () => {
  it("has a stable, non-product revision fixture", () => {
    expect(MILESTONE_ZERO_WORLD).toEqual({
      world_id: "world_m0_synthetic",
      label: "Milestone 0 synthetic World",
      current_revision: 0,
      publication_target_revision: 0,
      served_revision: 0,
      projection_status: "ready"
    });
    expect(Object.isFrozen(MILESTONE_ZERO_WORLD)).toBe(true);
  });
});

describe("health contract", () => {
  it("is versioned and rejects extra public fields", () => {
    expect(HEALTH_RESPONSE_SCHEMA.$id).toBe("moirai.health.v1");
    expect(HEALTH_RESPONSE_SCHEMA.additionalProperties).toBe(false);
  });
});
