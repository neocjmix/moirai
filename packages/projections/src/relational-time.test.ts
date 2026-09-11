import { readFileSync } from "node:fs";
import {
  normalizeLegacyChangePlan,
  type CreateChangeSet
} from "@moirai/contracts";
import { resolveCreateOperations } from "@moirai/domain";
import { describe, expect, it } from "vitest";
import {
  projectCanonGraphScope,
  projectRelationalTime,
  projectPublicDocuments,
  type CanonicalRevisionView
} from "./index.js";

const base = new URL(
  "../../../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
const json = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), "utf8"));
function corpus(): CanonicalRevisionView {
  const operations = [
    "bootstrap.change-plan.json",
    "success.change-plan.json"
  ].flatMap(
    (name) =>
      resolveCreateOperations(
        {
          ...normalizeLegacyChangePlan(json(name)),
          actor: "019f3b00-0000-7000-8000-000000000099"
        } as CreateChangeSet,
        () => {
          throw Error("explicit IDs required");
        }
      ).operations
  );
  const rows = (type: string) =>
    operations
      .filter((o) => o.kind === "create" && o.entity_type === type)
      .map((o) => ({ id: o.entity_id, ...o.value }));
  const eventCanonMemberships = operations.flatMap((operation) =>
    operation.kind === "add"
      ? [
          {
            event_id: String(operation.value.event_id),
            canon_id: String(operation.value.canon_id)
          }
        ]
      : []
  );
  const events = operations.flatMap((operation) => {
    if (operation.kind !== "create" || operation.entity_type !== "event")
      return [];
    return [
      {
        id: operation.entity_id,
        ...operation.value,
        canon_memberships: eventCanonMemberships
          .filter((membership) => membership.event_id === operation.entity_id)
          .map((membership) => membership.canon_id)
      }
    ];
  });
  return {
    world: rows("world")[0],
    canons: rows("canon"),
    timeSystems: rows("time_system"),
    canonTimeSystems: rows("canon_time_system"),
    eventCanonMemberships,
    events,
    relations: rows("relation"),
    narratives: rows("narrative")
  } as unknown as CanonicalRevisionView;
}
const canonId = "019f3b00-0000-7000-8000-000000000002";
const eventId = (suffix: string) =>
  `019f3b00-0000-7000-8000-000000000${suffix}`;
describe("TS-010 publication projection", () => {
  it("preserves all five concrete knowledge ranges and their exclusive upper bounds", () => {
    const result = projectRelationalTime(corpus(), 2, canonId);
    const expected = json("expected/solver-projection.json") as {
      items: {
        case_id: string;
        kind: string;
        lower?: string;
        upper?: string;
        span?: { value: string; unit: string };
      }[];
    };
    for (const [index, suffix] of [
      "101",
      "102",
      "103",
      "104",
      "105"
    ].entries()) {
      const position = result.positions.find(
        (p) => p.event_id === eventId(suffix)
      )!;
      const item = expected.items[index]!;
      expect(position).toMatchObject({
        kind: "bounded",
        lower: { time_event: { coordinate: item.lower }, inclusive: true },
        upper: { time_event: { coordinate: item.upper }, inclusive: false }
      });
      if (item.span) expect(position.knowledge_span).toEqual(item.span);
      expect(position.source_constraint_ids.length).toBeGreaterThan(0);
    }
    expect(
      result.positions.find((p) => p.event_id === eventId("106"))
    ).toMatchObject({
      kind: "exact",
      time_event: {
        coordinate: "2026-09-05T08:13:21.123456789012Z",
        persisted: false
      }
    });
    for (const suffix of ["10a", "10b"])
      expect(
        result.positions.find((p) => p.event_id === eventId(suffix))
      ).toMatchObject({ kind: "relative-only", knowledge_span: null });
  });
  it("uses explicit Duration and distinguishes descendants from proved during events", () => {
    const result = projectRelationalTime(corpus(), 2, canonId);
    const composite = result.composites.find(
      (c) => c.event_id === eventId("107")
    )!;
    expect(composite.duration).toMatchObject({
      basis: "explicit_boundaries",
      kind: "exact",
      amount: { value: "2000000000000", unit: "picosecond" },
      start: { coordinate: "2026-09-05T08:13:22.000000000000Z" },
      end: { coordinate: "2026-09-05T08:13:24.000000000000Z" }
    });
    expect(composite.descendant_span.basis).toBe("descendant_span");
    expect(composite.descendant_event_ids).toContain(eventId("108"));
    expect(composite.descendant_event_ids).not.toContain(eventId("109"));
    expect(composite.during).toEqual([
      expect.objectContaining({ event_id: eventId("109"), membership: false })
    ]);
    expect(
      result.positions.find((p) => p.event_id === eventId("108"))
        ?.knowledge_span
    ).toEqual({ value: "1000000000", unit: "picosecond" });
    expect(composite.duration.evidence).not.toEqual(
      composite.descendant_span.evidence
    );
  });
  it("publishes the same revision through the gated artifact and is input-order deterministic", () => {
    const view = corpus();
    const result = projectRelationalTime(view, 2, canonId);
    expect(
      projectRelationalTime(
        {
          ...view,
          events: [...view.events].reverse(),
          relations: [...view.relations].reverse(),
          timeSystems: [...view.timeSystems].reverse()
        },
        2,
        canonId
      )
    ).toEqual(result);
    const documents = projectPublicDocuments(view, 2, "2026-09-06T00:00:00Z");
    const artifact = documents.find((d) => d.key.endsWith("/temporal.json"))!;
    expect(artifact.value).toMatchObject({
      source_revision: 2,
      served_revision: 2,
      semantic_digest: result.semantic_digest
    });
    expect(documents.some((d) => /timeline-|process-/.test(d.key))).toBe(false);
    expect(
      documents.find((d) => d.key.endsWith(`/canons/${canonId}.json`))?.value
    ).toMatchObject({ temporal_artifact: { key: artifact.key } });
    expect(result.virtual_time_events.every((t) => t.persisted === false)).toBe(
      true
    );
  });

  it("lays out coordinate and relative-only chronology without exporting numeric time", () => {
    const view = corpus();
    const temporal = projectRelationalTime(view, 2, canonId);
    const graph = projectCanonGraphScope(view, 2, canonId, temporal);
    const byId = new Map(graph.nodes.map((node) => [node.event_id, node]));
    const coordinateIds = ["101", "102", "103", "104", "105", "106"].map(
      eventId
    );
    expect(coordinateIds.map((id) => byId.get(id)!.chronology.mode)).toEqual(
      Array(6).fill("coordinate")
    );
    // Overlapping knowledge ranges share a band; no false total order is made.
    expect(coordinateIds.map((id) => byId.get(id)!.chronology.rank)).toEqual([
      0, 1, 1, 2, 2, 2
    ]);
    expect(byId.get(eventId("102"))!.x).not.toBe(byId.get(eventId("103"))!.x);
    const relativeA = byId.get(eventId("10a"))!;
    const relativeB = byId.get(eventId("10b"))!;
    expect(relativeA.chronology).toMatchObject({ mode: "relative", rank: 0 });
    expect(relativeB.chronology).toMatchObject({ mode: "relative", rank: 1 });
    expect(relativeA.chronology.component_id).toBe(
      relativeB.chronology.component_id
    );
    expect(relativeA.chronology.time_system_ref).toBeNull();
    expect(
      graph.nodes.every((node) => node.layout_basis === "inferred_chronology")
    ).toBe(true);
    expect(JSON.stringify(graph)).not.toContain(
      "2026-09-05T08:13:21.123456789012Z"
    );
  });
});
