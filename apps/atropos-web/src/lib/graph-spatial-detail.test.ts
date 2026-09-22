import { describe, expect, it, vi } from "vitest";
import { eventDetailResponseSchema } from "../urdr-port/shared/contracts";
import { graphSpatialDetail } from "./graph-spatial-detail";

const fixture = vi.hoisted(() => {
  const world = "01995c2a-7b00-7000-8000-000000000101";
  const canonA = "019f5b00-0000-7000-8000-000000000002";
  const canonB = "019f5b00-0000-7000-8000-000000000003";
  const event = "019f5b00-0000-7000-8000-000000000100";
  const cause = "019f5b00-0000-7000-8000-000000000101";
  const sourceA = { world_id: world, canon_id: canonA, served_revision: 7 };
  const sourceB = { world_id: world, canon_id: canonB, served_revision: 7 };
  const record = (id: string, title: string) => ({
    id,
    world_id: world,
    canon_memberships: [canonA, canonB],
    slug: null,
    kind: "atomic",
    title,
    summary: "Public synthetic summary",
    roles: [],
    attributes: {}
  });
  return {
    sourceA,
    sourceB,
    event,
    cause,
    records: [record(event, "Known event"), record(cause, "Its cause")]
  };
});

vi.mock("./graph-spatial-query", () => ({
  graphSpatialQueryContext: async () => ({
    state: {
      version: 1,
      query: {
        sources: [
          {
            ...fixture.sourceA,
            canon_ids: [fixture.sourceA.canon_id, fixture.sourceB.canon_id]
          }
        ]
      },
      focus: null
    },
    input: {
      scopes: [fixture.sourceA, fixture.sourceB].map((source, index) => ({
        id: `scope-${index + 1}`,
        source,
        nodes: [
          {
            id: "point-1",
            reference: { kind: "event", event_id: fixture.event }
          }
        ],
        links: []
      }))
    }
  })
}));
vi.mock("./graph-revision-source", () => ({
  readGraphRevision: async () => ({
    world: { title: "Public fixture World" },
    manifest: {},
    snapshots: [fixture.sourceA, fixture.sourceB].map((source, index) => ({
      canon: {
        id: source.canon_id,
        title: `Interpretation ${index ? "B" : "A"}`
      },
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
    }))
  }),
  readGraphEventNarratives: async () => [
    {
      id: "narrative-a",
      canon_id: fixture.sourceA.canon_id,
      scope_type: "event",
      scope_id: fixture.event,
      locale: "ko",
      kind: "primary",
      title: "기록 A",
      body: "첫 문단.\n\n둘째 문단.",
      public_references: [
        { label: "Public evidence", url: "https://example.org/evidence" }
      ]
    },
    {
      id: "narrative-b",
      canon_id: fixture.sourceB.canon_id,
      scope_type: "event",
      scope_id: fixture.event,
      locale: "ko",
      kind: "annotation",
      title: "기록 B",
      body: "다른 Canon의 해석.",
      public_references: []
    }
  ]
}));
vi.mock("./moirai-spatial", () => ({
  moiraiSpatialReader: {
    scope: async () => ({ unplaced: [], diagnostics: [] })
  }
}));

describe("Event reader detail presentation", () => {
  it("honors an explicit Canon without changing the shared Event identity", async () => {
    const detail = await graphSpatialDetail(
      {},
      "point-1",
      fixture.sourceA.canon_id
    );
    expect(detail.id).toBe("point-1");
    expect(detail.narrativeSections?.map((section) => section.canonId)).toEqual(
      [fixture.sourceA.canon_id]
    );
    expect(detail.readingContext?.scopeLabel).toBe(
      "Public fixture World · Interpretation A"
    );
    await expect(
      graphSpatialDetail({}, "point-1", "outside-query")
    ).rejects.toThrow("graph_identity_outside_query");
  });
  it("groups one Event's narratives by selected Canon without merging prose", async () => {
    const detail = eventDetailResponseSchema.parse(
      await graphSpatialDetail({}, "point-1")
    );
    expect(detail.chronologySummary).toBe("1443년 범위");
    expect(detail.narrativeSections).toEqual([
      expect.objectContaining({
        canonId: fixture.sourceA.canon_id,
        canonLabel: "Interpretation A",
        narratives: [
          expect.objectContaining({ body: "첫 문단.\n\n둘째 문단." })
        ]
      }),
      expect.objectContaining({
        canonId: fixture.sourceB.canon_id,
        canonLabel: "Interpretation B",
        narratives: [expect.objectContaining({ body: "다른 Canon의 해석." })]
      })
    ]);
    expect(detail.readingContext?.scopeLabel).toBe(
      "Public fixture World · Interpretation A / Interpretation B"
    );
    expect(detail.readingContext?.observation).toContain("canon_memberships");
    expect(detail.readingContext?.stableEventHref).toContain(
      `/graph/events/${fixture.sourceA.world_id}/${fixture.event}?revision=7&canon=${fixture.sourceA.canon_id}&mq=`
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
