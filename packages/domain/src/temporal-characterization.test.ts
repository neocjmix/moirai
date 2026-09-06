import {
  CONTRACT_VERSION,
  SYNTHETIC_FIXTURE,
  type CreateChangeSet
} from "@moirai/contracts";
import { describe, expect, it } from "vitest";

import {
  resolveCreateOperations,
  validateCandidateChangeSet,
  validateCreateChangeSet
} from "./index.js";

describe("M4-D temporal validation characterization", () => {
  it("accepts a precedes cycle before the TS-010 solver is introduced", () => {
    const input: CreateChangeSet = {
      contract_version: CONTRACT_VERSION,
      change_set_id: SYNTHETIC_FIXTURE.changeSetId,
      world_id: SYNTHETIC_FIXTURE.worldId,
      expected_revision: 0,
      actor: "temporal-characterization",
      intent: "Characterize the pre-TS-010 cycle behavior",
      origins: [
        { kind: "human_instruction", summary: "Synthetic fixture only" }
      ],
      operations: [
        {
          kind: "create",
          entity_type: "world",
          entity_id: SYNTHETIC_FIXTURE.worldId,
          value: { slug: "temporal-baseline", title: "Temporal baseline" }
        },
        {
          kind: "create",
          entity_type: "canon",
          entity_id: SYNTHETIC_FIXTURE.canonId,
          value: {
            world_id: SYNTHETIC_FIXTURE.worldId,
            slug: "baseline",
            title: "Baseline"
          }
        },
        {
          kind: "create",
          entity_type: "event",
          entity_id: SYNTHETIC_FIXTURE.eventId,
          value: {
            canon_id: SYNTHETIC_FIXTURE.canonId,
            kind: "atomic",
            title: "A",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "event",
          entity_id: SYNTHETIC_FIXTURE.secondEventId,
          value: {
            canon_id: SYNTHETIC_FIXTURE.canonId,
            kind: "atomic",
            title: "B",
            roles: [],
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: SYNTHETIC_FIXTURE.causalRelationId,
          value: {
            canon_id: SYNTHETIC_FIXTURE.canonId,
            type: "precedes",
            source_event_id: SYNTHETIC_FIXTURE.eventId,
            target_event_id: SYNTHETIC_FIXTURE.secondEventId,
            direction: "directed",
            attributes: {}
          }
        },
        {
          kind: "create",
          entity_type: "relation",
          entity_id: SYNTHETIC_FIXTURE.structuralRelationId,
          value: {
            canon_id: SYNTHETIC_FIXTURE.canonId,
            type: "precedes",
            source_event_id: SYNTHETIC_FIXTURE.secondEventId,
            target_event_id: SYNTHETIC_FIXTURE.eventId,
            direction: "directed",
            attributes: {}
          }
        }
      ]
    };

    validateCreateChangeSet(input);
    const resolved = resolveCreateOperations(input, () => {
      throw new Error("unexpected generated ID");
    });

    expect(() =>
      validateCandidateChangeSet(input, resolved.operations, {
        world: null,
        canons: [],
        timeSystems: [],
        canonTimeSystems: [],
        events: [],
        temporalPlacements: [],
        relations: [],
        narratives: []
      })
    ).not.toThrow();
  });
});
