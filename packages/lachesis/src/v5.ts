/** Staged v5 trust boundary. Do not expose until the coordinated v5 ingress. */
import {
  V5_AUTHORING_POLICY,
  type ResolvedV5Change
} from "@moirai/contracts/v5";
import { ChangeSetError } from "@moirai/domain";
import { authorizeActor, type ActorContext } from "./index.js";
import {
  resolveV5DraftChange,
  type V5DraftChange
} from "./v5-client-resolver.js";
export type { V5DraftChange } from "./v5-client-resolver.js";

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
    },
    /** Staged entry point; transport validation of the v5 wire DTO is required
     * before exposing this to HTTP, MCP or CLI. */
    commitDraft(plan: V5DraftChange, actor: ActorContext) {
      authorizeActor(actor, "world:write", plan?.world_id);
      if (Object.hasOwn(plan, "actor") || Object.hasOwn(plan, "id_mapping"))
        throw new ChangeSetError(
          "invalid_request",
          "plan",
          "Server-derived fields are forbidden"
        );
      return store.commit({
        ...resolveV5DraftChange(plan),
        actor: actor.actor_id
      });
    }
  };
}
