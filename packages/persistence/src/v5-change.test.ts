import { describe, expect, it } from "vitest";
import type { ResolvedV5Change } from "@moirai/contracts/v5";
import { attributeV5ChangeOrigins } from "./v5-change.js";

const worldId = "019f5000-1100-7000-8000-000000000001";
const collectionId = "019f5000-1100-7000-8000-000000000002";
const eventId = "019f5000-1100-7000-8000-000000000003";
const narrativeId = "019f5000-1100-7000-8000-000000000004";
const ref = [{ field: "*", origin_index: 0 }];
const plan: ResolvedV5Change = {
  change_set_id: "019f5000-1100-7000-8000-000000000005",
  world_id: worldId,
  expected_revision: 1,
  actor: "019f5000-1100-7000-8000-000000000006",
  intent: "Synthetic retirement",
  origins: [{ kind: "human_instruction", summary: "Synthetic" }],
  policy_version: "v5/1",
  policy_digest: "test",
  operations: [
    {
      kind: "withdraw",
      entity_type: "collection",
      entity_id: collectionId,
      origin_refs: ref
    }
  ]
};

describe("v5 history provenance", () => {
  it("attributes implied selection and Narrative retirement to Collection withdrawal", () => {
    expect(
      attributeV5ChangeOrigins(plan, [
        {
          entity_type: "collection",
          entity_id: collectionId,
          operation_kind: "withdraw",
          before: { id: collectionId },
          after: null
        },
        {
          entity_type: "event_collection_membership",
          entity_id: eventId,
          operation_kind: "remove",
          before: { collection_id: collectionId, event_id: eventId },
          after: null
        },
        {
          entity_type: "narrative",
          entity_id: narrativeId,
          operation_kind: "withdraw",
          before: { scope_type: "collection", scope_id: collectionId },
          after: null
        }
      ])
    ).toEqual([ref, ref, ref]);
  });
  it("fails closed on invalid indices and unexplained diffs", () => {
    const missing = {
      entity_type: "event" as const,
      entity_id: eventId,
      operation_kind: "withdraw" as const,
      before: { id: eventId },
      after: null
    };
    expect(() => attributeV5ChangeOrigins(plan, [missing])).toThrowError(
      expect.objectContaining({ code: "missing_change_origin" })
    );
    expect(() =>
      attributeV5ChangeOrigins(
        {
          ...plan,
          operations: [
            {
              ...plan.operations[0]!,
              origin_refs: [{ field: "*", origin_index: 1 }]
            }
          ]
        },
        []
      )
    ).toThrowError(expect.objectContaining({ code: "invalid_origin_refs" }));
  });
});
