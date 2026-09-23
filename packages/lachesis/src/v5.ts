/** Staged v5 trust boundary. Do not expose until the coordinated v5 ingress. */
import {
  V5_AUTHORING_POLICY,
  type ResolvedV5Change
} from "@moirai/contracts/v5";
import { ChangeSetError } from "@moirai/domain";
import { authorizeActor, type ActorContext } from "./index.js";

export interface V5CanonicalStore {
  commit(input: ResolvedV5Change): Promise<unknown>;
}

export function createV5Lachesis(store: V5CanonicalStore) {
  return {
    policy(worldId: string, actor: ActorContext) {
      authorizeActor(actor, "world:read", worldId);
      return V5_AUTHORING_POLICY;
    },
    commit(plan: Omit<ResolvedV5Change, "actor">, actor: ActorContext) {
      authorizeActor(actor, "world:write", plan?.world_id);
      if (Object.hasOwn(plan, "actor"))
        throw new ChangeSetError(
          "invalid_request",
          "actor",
          "Actor is server-derived"
        );
      return store.commit({ ...plan, actor: actor.actor_id });
    }
  };
}
