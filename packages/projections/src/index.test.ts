import { describe, expect, it } from "vitest";

import { projectPublicDocuments } from "./index.js";

describe("public projection allowlist", () => {
  it("emits only public World, Canon and Event fields", () => {
    const source = {
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
      events: [
        {
          id: "event",
          canon_id: "canon",
          slug: null,
          kind: "atomic",
          title: "Event",
          summary: null,
          roles: [],
          attributes: {},
          actor: "private-actor-must-not-publish"
        }
      ],
      timeSystems: [],
      canonTimeSystems: [],
      temporalPlacements: [],
      relations: [],
      narratives: []
    } as const;
    const documents = projectPublicDocuments(
      source,
      1,
      "2026-08-30T00:00:00.000Z"
    );
    const serialized = JSON.stringify(documents);
    expect(serialized).toContain('"served_revision":1');
    expect(serialized).not.toContain("actor");
    expect(serialized).not.toContain("origin");
    expect(serialized).not.toContain("change_set");
    expect(
      documents.some((document) => document.key.endsWith("/search/en.json"))
    ).toBe(true);
  });
});
