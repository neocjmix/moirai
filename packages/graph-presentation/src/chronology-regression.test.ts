import { expect, it } from "vitest";
import type { CanonicalRevisionView } from "@moirai/projections";
import type {
  PublicRelation,
  CanonicalEventReference
} from "@moirai/contracts";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import { projectPresentationInput } from "./index.js";
import { layoutPresentationScope } from "./semantic-layout.js";

const years = [1573, 1575, 1582, 1588, 1598, 1600];
const ids = ["a", "b", "c", "d", "e", "f"];
const ref = (id: string): CanonicalEventReference => ({
  kind: "event",
  event_id: id
});
function fixture(topology: boolean): CanonicalRevisionView {
  const memberships = ["japan", "control"];
  const relations: PublicRelation[] = [];
  const add = (
    id: string,
    type: PublicRelation["type"],
    source_ref: CanonicalEventReference,
    target_ref: CanonicalEventReference
  ) =>
    relations.push({
      id,
      world_id: "w",
      canon_memberships: memberships,
      type,
      source_ref,
      target_ref,
      direction: "directed",
      attributes: {}
    });
  ids.forEach((id, i) => {
    const time = (year: number): CanonicalEventReference => ({
      kind: "time_event",
      time_system_ref: { time_system_id: "t" },
      definition_version: "1",
      coordinate: `${year}-01-01T00:00:00.000000000000Z`
    });
    add(id + "-lo", "not_after", time(years[i]!), ref(id));
    add(id + "-hi", "precedes", ref(id), time(years[i]! + 1));
    add(id + "-contains", "contains", ref("composite"), ref(id));
  });
  // A branching temporal topology whose depths disagree with calendar order:
  // C has rank 0 while B has rank 1; unrelated causal links do not set Y.
  if (topology) {
    add("ab", "precedes", ref("a"), ref("b"));
    add("af", "precedes", ref("a"), ref("f"));
    add("ce", "precedes", ref("c"), ref("e"));
    add("ed", "influences", ref("e"), ref("d"));
  }
  return {
    world: {
      id: "w",
      slug: "w",
      title: "Chronology regression",
      description: null
    },
    canons: memberships.map((id) => ({
      id,
      world_id: "w",
      slug: id,
      title: id,
      description: null
    })),
    events: [...ids, "composite"].map((id) => ({
      id,
      world_id: "w",
      canon_memberships: memberships,
      slug: id,
      title: id,
      summary: null,
      kind: id === "composite" ? "composite" : "atomic",
      roles: [],
      attributes: {}
    })),
    relations,
    eventCanonMemberships: [...ids, "composite"].flatMap((event_id) =>
      memberships.map((canon_id) => ({ event_id, canon_id }))
    ),
    relationCanonMemberships: relations.flatMap((r) =>
      memberships.map((canon_id) => ({ relation_id: r.id, canon_id }))
    ),
    timeSystems: [
      {
        id: "t",
        world_id: "w",
        slug: "gregorian",
        title: "Gregorian",
        kind: "calendar",
        definition_version: "1",
        definition: {
          calendar: "proleptic-gregorian",
          timezone: "UTC",
          coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
          fractional_digits: 12,
          leap_second_policy: "reject",
          interval_policy: "half-open",
          capabilities: [
            "canonicalize",
            "equality",
            "compare",
            "boundary",
            "difference"
          ]
        }
      }
    ],
    canonTimeSystems: memberships.map((canon_id) => ({
      id: canon_id + "-time",
      canon_id,
      time_system_id: "t"
    })),
    narratives: []
  };
}
it("preserves 1573 < 1575 < 1582 < 1588 < 1598 < 1600 through publication/query/layout despite topology and containment", () => {
  for (const topology of [false, true]) {
    const publication = buildPublicationArtifacts(
      fixture(topology),
      1,
      "2026-09-22T00:00:00Z"
    );
    const result = queryFromPublicationDocuments(
      publication.manifestBody,
      publication.documents
    )!;
    expect(result.events.filter((e) => ids.includes(e.id))).toHaveLength(6);
    const input = projectPresentationInput(result);
    const positions = input.scopes.map((scope) => {
      const layout = layoutPresentationScope(input, scope);
      expect(layout.unplaced).toEqual([]);
      const points = ids.map((id) => {
        const node = scope.nodes.find(
          (n) => n.reference.kind === "event" && n.reference.event_id === id
        )!;
        const entity = layout.chartPlane.entities.find(
          (e) => e.eventId === node.id && e.geometryKind === "point"
        )!;
        if (entity.geometryKind !== "point") throw Error("point required");
        expect(entity.position.y).toBeGreaterThan(
          years[ids.indexOf(id)]! * 140 - 1
        );
        expect(entity.position.y).toBeLessThan(
          (years[ids.indexOf(id)]! + 1) * 140 + 1
        );
        return { id: node.id, y: entity.position.y };
      });
      expect(points.map((p) => p.y)).toEqual(
        points.map((p) => p.y).toSorted((a, b) => a - b)
      );
      return points;
    });
    expect(positions[0]).toEqual(positions[1]);
  }
});
