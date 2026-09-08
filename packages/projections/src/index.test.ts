import { describe, expect, it } from "vitest";
import {
  projectPublicDocuments,
  projectSubjects,
  type CanonicalRevisionView
} from "./index.js";

const view: CanonicalRevisionView = {
  world: { id: "world", slug: "world", title: "World", description: null },
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
  events: [
    {
      id: "event",
      canon_id: "canon",
      slug: null,
      kind: "atomic",
      title: "Event",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  relations: [],
  narratives: []
};

describe("Event/Relation public projections", () => {
  it("publishes relational time for every Canon without leaking extra fields", () => {
    const dirty = {
      ...view,
      events: [{ ...view.events[0]!, actor: "private" }]
    } as unknown as CanonicalRevisionView;
    const documents = projectPublicDocuments(dirty, 7, "2026-09-07T00:00:00Z");
    expect(documents.some((item) => item.key.endsWith("/temporal.json"))).toBe(
      true
    );
    expect(
      documents.some((item) => item.key.endsWith("/scope-overview.json"))
    ).toBe(true);
    expect(JSON.stringify(documents)).not.toContain("private");
    expect(JSON.stringify(documents)).not.toContain("temporal_placements");
  });

  it("does not invent Subjects without identity Relations", () => {
    expect(projectSubjects(view, 7)).toEqual({ handles: [], projections: [] });
  });
});
