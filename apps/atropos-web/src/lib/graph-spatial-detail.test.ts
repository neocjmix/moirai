import { describe, expect, it, vi } from "vitest";
import { eventDetailResponseSchema } from "../urdr-port/shared/contracts";
import { graphSpatialDetail } from "./graph-spatial-detail";

const fixture = vi.hoisted(() => {
  const world = "01995c2a-7b00-7000-8000-000000000101";
  const canon = "019f5b00-0000-7000-8000-000000000002";
  const event = "019f5b00-0000-7000-8000-000000000100";
  const cause = "019f5b00-0000-7000-8000-000000000101";
  const source = { world_id: world, canon_id: canon, served_revision: 7 };
  const record = (id: string, title: string) => ({
    id,
    world_id: world,
    canon_memberships: [canon],
    slug: null,
    kind: "atomic",
    title,
    summary: "Public synthetic summary",
    roles: [],
    attributes: {}
  });
  return {
    source,
    event,
    cause,
    records: [record(event, "Known event"), record(cause, "Its cause")]
  };
});

vi.mock("./graph-spatial-query", () => ({
  graphSpatialQueryContext: async () => ({
    state: { version: 1, query: { sources: [fixture.source] }, focus: null },
    input: {
      scopes: [
        {
          id: "scope-1",
          source: fixture.source,
          nodes: [
            {
              id: "point-1",
              reference: { kind: "event", event_id: fixture.event }
            }
          ],
          links: []
        }
      ]
    }
  })
}));
vi.mock("./graph-revision-source", () => ({
  readGraphRevision: async () => ({
    world: { title: "Public fixture World" },
    manifest: {},
    snapshots: [
      {
        canon: { id: fixture.source.canon_id, title: "Interpretation A" },
        events: fixture.records,
        subjects: [],
        temporal: {
          positions: [
            {
              event_id: fixture.event,
              kind: "bounded",
              display_label: "1443년 범위"
            }
          ],
          composites: [],
          relations: [
            {
              id: "cause-1",
              type: "causes",
              source_ref: { kind: "event", event_id: fixture.cause },
              target_ref: { kind: "event", event_id: fixture.event }
            },
            {
              id: "enable-1",
              type: "enables",
              source_ref: { kind: "event", event_id: fixture.event },
              target_ref: { kind: "event", event_id: fixture.cause }
            }
          ]
        }
      }
    ]
  }),
  readGraphEventNarratives: async () => [
    {
      id: "narrative-1",
      title: "A readable account",
      body: "Authored public explanation.",
      public_references: [
        { label: "Public evidence", url: "https://example.org/evidence" }
      ]
    }
  ]
}));
vi.mock("./moirai-spatial", () => ({
  moiraiSpatialReader: {
    scope: async () => ({ unplaced: [], diagnostics: [] })
  }
}));

describe("Event reader detail presentation", () => {
  it("leads with authored narrative and temporal meaning, retaining the lossless sidecar separately", async () => {
    const detail = eventDetailResponseSchema.parse(
      await graphSpatialDetail({}, "point-1")
    );
    expect(detail.chronologySummary).toBe("1443년 범위");
    expect(detail.notes).toContain("Authored public explanation.");
    expect(detail.notes).toContain("https://example.org/evidence");
    expect(detail.notes).not.toContain("canon_memberships");
    expect(detail.notes).not.toContain("Revision 7");
    expect(detail.readingContext?.scopeLabel).toBe(
      "Public fixture World · Interpretation A"
    );
    expect(detail.readingContext?.observation).toContain("canon_memberships");
    expect(detail.readingContext?.observation).toContain(fixture.event);
    expect(detail.readingContext?.stableEventHref).toContain(
      `/${fixture.event}?revision=7&mq=`
    );
  });
  it("does not reinterpret enabling or other connections as direct causality", async () => {
    const detail = await graphSpatialDetail({}, "point-1");
    expect(detail.causeEvents).toEqual([
      { id: fixture.cause, label: "Its cause" }
    ]);
    expect(detail.resultEvents).toEqual([]);
  });
  it("does not synthesize detail for identities outside the selected query", async () => {
    await expect(graphSpatialDetail({}, "missing")).rejects.toThrow(
      "graph_identity_outside_query"
    );
  });
});
