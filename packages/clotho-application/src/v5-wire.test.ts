import { describe, expect, it } from "vitest";
import { Ajv } from "ajv";
import { V5_CHANGE_PLAN_SCHEMA } from "@moirai/contracts/v5-wire";
import { V5_AUTHORING_POLICY } from "@moirai/contracts/v5";

const valid = new Ajv({
  coerceTypes: false,
  removeAdditional: false,
  allErrors: false
}).compile(V5_CHANGE_PLAN_SCHEMA);
const worldId = "019f5000-1100-7000-8000-000000000001";
const ref = [{ field: "*", origin_index: 0 }];
const plan = {
  contract_version: 5,
  change_set_id: "019f5000-1100-7000-8000-000000000023",
  world_id: worldId,
  expected_revision: 30,
  intent: "Synthetic Collection and shared Event",
  origins: [{ kind: "human_instruction", summary: "Public synthetic fixture" }],
  policy_version: V5_AUTHORING_POLICY.policy_version,
  policy_digest: V5_AUTHORING_POLICY.policy_digest,
  operations: [
    {
      kind: "create",
      entity_type: "collection",
      client_ref: "new-collection",
      origin_refs: ref,
      value: {
        world_id: worldId,
        slug: "synthetic",
        title: "Synthetic",
        description: null
      }
    },
    {
      kind: "add",
      entity_type: "event_collection_membership",
      origin_refs: ref,
      value: {
        event_id: "019f5000-1100-7000-8000-000000000003",
        collection_id: { client_ref: "new-collection" }
      }
    },
    {
      kind: "create",
      entity_type: "narrative",
      client_ref: "new-narrative",
      origin_refs: ref,
      value: {
        world_id: worldId,
        scope_type: "collection",
        scope_id: { client_ref: "new-collection" },
        locale: "ko",
        title: null,
        body: "An account for a reader.",
        public_references: [],
        notes: []
      }
    }
  ]
};
describe("inactive v5 wire contract", () => {
  it("accepts a complete typed Collection plan with stable client references", () => {
    expect(valid(plan)).toBe(true);
  });
  it("rejects older agents, actor spoofing and old Canon/Composite semantics", () => {
    expect(valid({ ...plan, contract_version: 4 })).toBe(false);
    expect(valid({ ...plan, actor: worldId })).toBe(false);
    expect(valid({ ...plan, id_mapping: { forged: worldId } })).toBe(false);
    expect(valid({ ...plan, policy_digest: "" })).toBe(false);
    expect(
      valid({
        ...plan,
        operations: [{ ...plan.operations[0], entity_type: "canon" }]
      })
    ).toBe(false);
    expect(
      valid({
        ...plan,
        operations: [
          {
            ...plan.operations[0],
            value: { ...plan.operations[0]!.value, canon_id: worldId }
          }
        ]
      })
    ).toBe(false);
    expect(
      valid({
        ...plan,
        operations: [{ ...plan.operations[0], entity_id: worldId }]
      })
    ).toBe(false);
  });
  it("requires per-operation provenance and one owner Narrative shape", () => {
    expect(
      valid({
        ...plan,
        operations: [{ ...plan.operations[0], origin_refs: [] }]
      })
    ).toBe(false);
    expect(
      valid({
        ...plan,
        operations: [
          {
            ...plan.operations[2],
            value: { ...plan.operations[2]!.value, kind: "primary" }
          }
        ]
      })
    ).toBe(false);
    expect(
      valid({
        ...plan,
        operations: [
          {
            kind: "withdraw",
            entity_type: "collection",
            entity_id: worldId,
            origin_refs: ref
          }
        ]
      })
    ).toBe(true);
  });
});
