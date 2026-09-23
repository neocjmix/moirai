/** Staged v5 Clotho application contract. Never mount this alongside the
 * active v4 writer or advertise it before the coordinated cutover. */
import { V5_CHANGE_PLAN_SCHEMA } from "@moirai/contracts/v5-wire";
import { ChangeSetError } from "@moirai/domain";
import { authorizeActor, type ActorContext } from "@moirai/lachesis";
import type { V5DraftChange } from "@moirai/lachesis/v5";
import { Ajv } from "ajv";

const valid = new Ajv({
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false
}).compile(V5_CHANGE_PLAN_SCHEMA);
export interface V5LachesisBoundary {
  policy(worldId: string, actor: ActorContext): unknown;
  commitDraft(plan: V5DraftChange, actor: ActorContext): Promise<unknown>;
}

export function createV5Clotho(boundary: V5LachesisBoundary) {
  return {
    policy(worldId: string, actor: ActorContext) {
      authorizeActor(actor, "world:read", worldId);
      return boundary.policy(worldId, actor);
    },
    commit(input: unknown, actor: ActorContext) {
      const worldId =
        input && typeof input === "object"
          ? (input as { world_id?: unknown }).world_id
          : undefined;
      authorizeActor(actor, "world:write", worldId);
      if (!valid(input))
        throw new ChangeSetError(
          "invalid_request",
          "plan",
          "Invalid v5 change plan"
        );
      const plan = input as V5DraftChange & { contract_version: 5 };
      const draft: V5DraftChange = {
        change_set_id: plan.change_set_id,
        world_id: plan.world_id,
        expected_revision: plan.expected_revision,
        intent: plan.intent,
        origins: plan.origins,
        policy_version: plan.policy_version,
        policy_digest: plan.policy_digest,
        operations: plan.operations
      };
      return boundary.commitDraft(draft, actor);
    }
  };
}
