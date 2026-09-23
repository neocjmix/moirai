import { describe, expect, it } from "vitest";
import { v5ClientRefId } from "./v5-client-ids.js";
import {
  resolveV5DraftChange,
  type V5DraftChange
} from "./v5-client-resolver.js";

const change = "019f5000-1100-7000-8000-000000000023";
describe("v5 client references", () => {
  it("uses a stable UUIDv7 for exact retry while separating requests and references", () => {
    const first = v5ClientRefId(change, "event", "event-one");
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(first.replaceAll("-", "").slice(0, 12)).toBe(
      change.replaceAll("-", "").slice(0, 12)
    );
    expect(v5ClientRefId(change, "event", "event-one")).toBe(first);
    expect(v5ClientRefId(change, "event", "event-two")).not.toBe(first);
    expect(
      v5ClientRefId(
        "019f5000-1100-7000-8000-000000000024",
        "event",
        "event-one"
      )
    ).not.toBe(first);
    expect(v5ClientRefId(change, "narrative", "event-one")).not.toBe(first);
  });
  it("fails closed on unrecognized entity types, malformed IDs and references", () => {
    expect(() => v5ClientRefId("bad", "event", "valid")).toThrow();
    expect(() => v5ClientRefId(change, "canon", "valid")).toThrow();
    expect(() => v5ClientRefId(change, "event", "Invalid Ref")).toThrow();
  });
});

const draft: V5DraftChange = {
  change_set_id: change,
  world_id: "019f5000-1100-7000-8000-000000000001",
  expected_revision: 3,
  intent: "Synthetic shared Event",
  origins: [{ kind: "human_instruction", summary: "Synthetic" }],
  policy_version: "v5/1",
  policy_digest: "test",
  operations: [
    {
      kind: "add",
      entity_type: "event_collection_membership",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        event_id: { client_ref: "new-event" },
        collection_id: "019f5000-1100-7000-8000-000000000002"
      }
    },
    {
      kind: "create",
      entity_type: "event",
      client_ref: "new-event",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        world_id: "019f5000-1100-7000-8000-000000000001",
        slug: null,
        title: "Synthetic",
        summary: null,
        roles: [],
        attributes: {}
      }
    },
    {
      kind: "create",
      entity_type: "narrative",
      client_ref: "new-narrative",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        world_id: "019f5000-1100-7000-8000-000000000001",
        scope_type: "event",
        scope_id: { client_ref: "new-event" },
        locale: "ko",
        title: null,
        body: "Synthetic reader prose",
        public_references: [],
        notes: []
      }
    }
  ]
};
describe("v5 draft resolution", () => {
  it("resolves forward references and returns the same IDs and payload on exact retry", () => {
    const resolved = resolveV5DraftChange(draft);
    expect(resolveV5DraftChange(draft)).toEqual(resolved);
    expect(resolved.operations[0]).toMatchObject({
      value: { event_id: resolved.id_mapping?.["new-event"] }
    });
    expect(resolved.operations[2]).toMatchObject({
      value: { scope_id: resolved.id_mapping?.["new-event"] }
    });
    expect(resolved.id_mapping?.["new-event"]).not.toBe(
      resolved.id_mapping?.["new-narrative"]
    );
    expect(Object.hasOwn(resolved, "actor")).toBe(false);
  });
  it("rejects duplicate client references and unknown IDs", () => {
    expect(() =>
      resolveV5DraftChange({
        ...draft,
        operations: [draft.operations[1]!, draft.operations[1]!]
      })
    ).toThrow();
    expect(() =>
      resolveV5DraftChange({ ...draft, operations: [draft.operations[0]!] })
    ).toThrow();
    expect(() =>
      resolveV5DraftChange({
        ...draft,
        operations: [
          {
            ...draft.operations[1]!,
            origin_refs: [{ field: "not_a_field", origin_index: 0 }]
          }
        ]
      })
    ).toThrow();
  });
  it("resolves tagged Relation endpoints without rewriting arbitrary prose", () => {
    const withRelation: V5DraftChange = {
      ...draft,
      operations: [
        ...draft.operations,
        {
          kind: "create",
          entity_type: "relation",
          client_ref: "link",
          origin_refs: [{ field: "*", origin_index: 0 }],
          value: {
            world_id: draft.world_id,
            type: "contains",
            source_ref: { kind: "event", client_ref: "new-event" },
            target_ref: {
              kind: "event",
              event_id: "019f5000-1100-7000-8000-000000000010"
            },
            direction: "directed",
            attributes: { label: { client_ref: "new-event" } }
          }
        }
      ]
    };
    const relation = resolveV5DraftChange(withRelation).operations[3];
    expect(relation).toMatchObject({
      value: {
        source_ref: {
          kind: "event",
          event_id: v5ClientRefId(change, "event", "new-event")
        },
        attributes: { label: { client_ref: "new-event" } }
      }
    });
    expect(JSON.stringify(relation)).not.toContain(
      '"source_ref":{"kind":"event","client_ref"'
    );
  });
});
