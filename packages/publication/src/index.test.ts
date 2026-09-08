import { describe, expect, it } from "vitest";
import { buildPublicationArtifacts } from "./index.js";

describe("single Event/Relation publication format", () => {
  it("indexes the relational temporal artifact globally", () => {
    const artifacts = buildPublicationArtifacts(
      {
        world: {
          id: "world",
          slug: "world",
          title: "World",
          description: null
        },
        canons: [
          {
            id: "canon",
            world_id: "world",
            slug: "canon",
            title: "Canon",
            description: null
          }
        ],
        timeSystems: [],
        canonTimeSystems: [],
        events: [],
        relations: [],
        narratives: []
      },
      1,
      "2026-09-07T00:00:00Z"
    );
    const manifest = JSON.parse(artifacts.manifestBody);
    expect(manifest.algorithms.relational_time).toBe(
      "event-relational-projection/1"
    );
    expect(manifest.algorithms.graph_scope).toBe(
      "event-relational-graph-scope/2"
    );
    expect(
      artifacts.documents.some((item) => item.key.endsWith("/temporal.json"))
    ).toBe(true);
    expect(JSON.stringify(artifacts)).not.toContain("temporal_placements");
  });
});
