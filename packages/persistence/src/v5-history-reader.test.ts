import { describe, expect, it } from "vitest";
import {
  foldV5RevisionOperations,
  type V5HistoryOperation
} from "./v5-history-reader.js";

const world = {
  id: "w",
  slug: "real",
  title: "실제 세계사",
  description: null
};
const event = {
  id: "e",
  world_id: "w",
  slug: null,
  title: "계유정난",
  summary: null,
  roles: [],
  attributes: {}
};
const collection = (id: string) => ({
  id,
  world_id: "w",
  slug: id,
  title: id,
  description: null
});
const narrative = (
  id: string,
  scope_type: "event" | "collection",
  scope_id: string
) => ({
  id,
  world_id: "w",
  scope_type,
  scope_id,
  locale: "ko",
  title: null,
  body: `Reader account ${id}`,
  public_references: [],
  notes: []
});
const op = (
  revision: number,
  operation_index: number,
  entity_type: string,
  entity_id: string,
  operation_kind: string,
  before: unknown,
  after: unknown
): V5HistoryOperation => ({
  revision,
  operation_index,
  entity_type,
  entity_id,
  operation_kind,
  before,
  after
});
const membership = (collection_id: string) => ({
  collection_id,
  event_id: "e"
});
const baseline = [
  op(31, 0, "world", "w", "migration", null, world),
  op(31, 1, "collection", "c1", "migration", null, collection("c1")),
  op(31, 2, "event", "e", "migration", null, event),
  op(
    31,
    3,
    "narrative",
    "ne",
    "migration",
    null,
    narrative("ne", "event", "e")
  ),
  op(
    31,
    4,
    "narrative",
    "nc1",
    "migration",
    null,
    narrative("nc1", "collection", "c1")
  ),
  op(31, 5, "event_collection_membership", "m1", "add", null, membership("c1")),
  op(31, 6, "narrative", "retired-v4-id", "withdraw", null, null),
  op(
    31,
    7,
    "relation_canon_membership",
    "retired-link",
    "retire_applicability",
    null,
    { id: "retired-link" }
  )
];

describe("v5 historical reader", () => {
  it("reconstructs the migration snapshot and preserves one shared Event across selections", () => {
    const initial = foldV5RevisionOperations(baseline, "w");
    expect(initial.collections.map((c) => c.id)).toEqual(["c1"]);
    const shared = foldV5RevisionOperations(
      [
        ...baseline,
        op(32, 0, "collection", "c2", "create", null, collection("c2")),
        op(
          32,
          1,
          "narrative",
          "nc2",
          "create",
          null,
          narrative("nc2", "collection", "c2")
        ),
        op(
          32,
          2,
          "event_collection_membership",
          "m2",
          "add",
          null,
          membership("c2")
        )
      ],
      "w"
    );
    expect(shared.events).toEqual([event]);
    expect(shared.eventCollectionMemberships).toEqual([
      membership("c1"),
      membership("c2")
    ]);
    expect(
      shared.narratives.filter((n) => n.scope_type === "event")
    ).toHaveLength(1);
  });
  it("retiring a Collection removes its selection and Narrative, never the Event", () => {
    const withdrawn = foldV5RevisionOperations(
      [
        ...baseline,
        op(
          32,
          0,
          "narrative",
          "nc1",
          "withdraw",
          narrative("nc1", "collection", "c1"),
          null
        ),
        op(
          32,
          1,
          "event_collection_membership",
          "m1",
          "remove",
          membership("c1"),
          null
        ),
        op(32, 2, "collection", "c1", "withdraw", collection("c1"), null)
      ],
      "w"
    );
    expect(withdrawn.collections).toEqual([]);
    expect(withdrawn.eventCollectionMemberships).toEqual([]);
    expect(withdrawn.events).toEqual([event]);
    expect(withdrawn.narratives.map((n) => n.id)).toEqual(["ne"]);
  });
  it("does not treat older v4 rows or unknown operations as a v5 baseline", () => {
    expect(() => foldV5RevisionOperations(baseline.slice(1), "w")).toThrow();
    expect(() =>
      foldV5RevisionOperations(
        [...baseline, op(32, 0, "canon", "c1", "create", null, {})],
        "w"
      )
    ).toThrow("v5_history_entity_invalid");
  });
});
