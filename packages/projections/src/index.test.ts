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
  eventCanonMemberships: [{ event_id: "event", canon_id: "canon" }],
  relationCanonMemberships: [],
  events: [
    {
      id: "event",
      world_id: "world",
      canon_memberships: ["canon"],
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

  it("publishes one World-owned Event identity across overlapping Canon scopes", () => {
    const canons = ["k1", "k2", "k3"].map((id) => ({
      id,
      world_id: "world",
      slug: id,
      title: id.toUpperCase(),
      description: null
    }));
    const memberships = {
      a: ["k1", "k2"],
      b: ["k1", "k2", "k3"],
      c: ["k2"],
      d: ["k3"]
    } as const;
    const overlap: CanonicalRevisionView = {
      ...view,
      canons,
      eventCanonMemberships: Object.entries(memberships).flatMap(
        ([event_id, canonIds]) =>
          canonIds.map((canon_id) => ({ event_id, canon_id }))
      ),
      events: Object.entries(memberships).map(([id, canon_memberships]) => ({
        id,
        world_id: "world",
        canon_memberships,
        slug: id,
        kind: "atomic" as const,
        title: id.toUpperCase(),
        summary: null,
        roles: [],
        attributes: {}
      }))
    };
    const documents = projectPublicDocuments(
      overlap,
      8,
      "2026-09-11T00:00:00Z"
    );
    const value = <T extends Readonly<Record<string, unknown>>>(
      suffix: string
    ) =>
      documents.find((document) => document.key.endsWith(suffix))!.value as T;
    const canonDocument = (id: string) =>
      value<{ readonly events: readonly { readonly id: string }[] }>(
        `/canons/${id}.json`
      );
    expect(canonDocument("k1").events.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(canonDocument("k2").events.map(({ id }) => id)).toEqual([
      "a",
      "b",
      "c"
    ]);
    expect(canonDocument("k3").events.map(({ id }) => id)).toEqual(["b", "d"]);
    expect(
      documents.filter((document) =>
        /\/events\/[a-d]\.json$/.test(document.key)
      )
    ).toHaveLength(4);
    expect(
      value<{ readonly event: Readonly<Record<string, unknown>> }>(
        "/events/a.json"
      ).event
    ).toMatchObject({
      id: "a",
      world_id: "world",
      canon_memberships: ["k1", "k2"]
    });
    const eventSearch = value<{
      readonly entries: readonly {
        readonly target_id: string;
        readonly target_type: string;
        readonly canonical_url: string;
        readonly canon_ids: readonly string[];
      }[];
    }>("/search/en.json").entries.filter(
      ({ target_type }) => target_type === "event"
    );
    expect(eventSearch).toHaveLength(4);
    expect(
      eventSearch.find(({ target_id }) => target_id === "b")
    ).toMatchObject({
      canonical_url: "/worlds/world/events/b",
      canon_ids: ["k1", "k2", "k3"]
    });
  });
});
