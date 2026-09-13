import { describe, expect, it, vi } from "vitest";
import type { MoiraiDatabase, RevisionView } from "./index.js";
import { TEST_FIXTURE as ids } from "@moirai/contracts/testing";
const fixture = vi.hoisted(() => ({ view: null as unknown }));
vi.mock("./index.js", () => ({
  getPublicationStatus: async () => ({
    currentRevision: 5,
    targetRevision: 5,
    servedRevision: 5,
    projectionStatus: "ready"
  }),
  readWorldAtRevision: async () => fixture.view
}));
import { queryClotho } from "./clotho-query.js";
const secondCanon = "01995c2a-7b00-7000-8000-000000000020";
fixture.view = {
  world: {
    id: ids.worldId,
    title: "Synthetic shared-event context",
    slug: "shared-context",
    description: null
  },
  canons: [ids.canonId, secondCanon].map((id) => ({
    id,
    world_id: ids.worldId,
    title: id,
    slug: id,
    description: null
  })),
  events: [
    {
      id: ids.eventId,
      world_id: ids.worldId,
      kind: "atomic",
      title: "Shared Event",
      slug: null,
      summary: null,
      roles: [],
      attributes: {},
      canon_memberships: [ids.canonId, secondCanon]
    }
  ],
  eventCanonMemberships: [ids.canonId, secondCanon].map((canon_id) => ({
    event_id: ids.eventId,
    canon_id
  })),
  relations: [],
  relationCanonMemberships: [],
  timeSystems: [],
  canonTimeSystems: [],
  narratives: [ids.canonId, secondCanon].map((canon_id, i) => ({
    id: `01995c2a-7b00-7000-8000-00000000003${i}`,
    canon_id,
    scope_type: "event",
    scope_id: ids.eventId,
    kind: "annotation",
    locale: "ko",
    title: `Interpretation ${i}`,
    body: i ? "사료비판 해석" : "연표의 설명",
    public_references: [
      { label: "Public fixture source", url: "https://example.org/history" }
    ]
  })),
  generatedAt: "2026-09-13T00:00:00Z"
} satisfies RevisionView;
const db = {} as MoiraiDatabase;

describe("Clotho shared Event interpretation scope", () => {
  it("does not search another Canon's Narrative through shared membership", async () => {
    const input = {
      world_id: ids.worldId,
      at_revision: 5,
      canon_id: ids.canonId,
      query: "사료비판",
      limit: 10
    };
    expect(
      await queryClotho(db, "event.search", input, [ids.worldId])
    ).toMatchObject({ items: [], source_revision: 5 });
    expect(
      await queryClotho(
        db,
        "event.search",
        { ...input, canon_id: secondCanon },
        [ids.worldId]
      )
    ).toMatchObject({ items: [{ id: ids.eventId }] });
  });
  it("retains each Narrative's Canon and public source across bounded continuation", async () => {
    const input = {
      world_id: ids.worldId,
      at_revision: 5,
      canon_ids: [ids.canonId, secondCanon],
      seed_ids: [ids.eventId],
      depth: 0,
      max_events: 10,
      max_relations: 10,
      max_narrative_chars: 3
    };
    let cursor: string | null = null;
    const fragments: Array<{
      canon_id: string;
      body: string;
      public_references: unknown;
    }> = [];
    do {
      const result = (await queryClotho(
        db,
        "context.slice",
        { ...input, ...(cursor ? { cursor } : {}) },
        [ids.worldId]
      )) as { narratives: typeof fragments; next_cursor: string | null };
      expect(
        result.narratives.reduce((n, row) => n + row.body.length, 0)
      ).toBeLessThanOrEqual(3);
      for (const row of result.narratives)
        expect(row).toMatchObject({
          canon_id: expect.any(String),
          public_references: [
            {
              label: "Public fixture source",
              url: "https://example.org/history"
            }
          ]
        });
      fragments.push(...result.narratives);
      cursor = result.next_cursor;
    } while (cursor);
    expect(
      fragments
        .filter((n) => n.canon_id === ids.canonId)
        .map((n) => n.body)
        .join("")
    ).toBe("연표의 설명");
    expect(
      fragments
        .filter((n) => n.canon_id === secondCanon)
        .map((n) => n.body)
        .join("")
    ).toBe("사료비판 해석");
  });
});
