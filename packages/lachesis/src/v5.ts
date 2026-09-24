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
  search?(input: {
    world_id: string;
    text: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<unknown>;
  detail?(input: {
    world_id: string;
    event_id: string;
    at_revision: number;
    cursor?: string | null;
  }): Promise<unknown>;
}

export function createV5Lachesis(store: V5CanonicalStore) {
  return {
    async detail(
      input: {
        world_id: string;
        event_id: string;
        at_revision: number;
        cursor?: string | null;
      },
      actor: ActorContext
    ) {
      authorizeActor(actor, "world:read", input?.world_id);
      if (!store.detail)
        throw new ChangeSetError(
          "invalid_request",
          "detail",
          "Detail is unavailable"
        );
      try {
        return await store.detail(input);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "v5_detail_revision_changed"
        )
          throw new ChangeSetError(
            "revision_conflict",
            "at_revision",
            "World Revision changed; restart inspection",
            [],
            true
          );
        if (error instanceof Error && error.message.startsWith("v5_detail_"))
          throw new ChangeSetError(
            "invalid_request",
            "detail",
            "Invalid or unavailable Event detail"
          );
        throw error;
      }
    },
    async search(
      input: {
        world_id: string;
        text: string;
        limit?: number;
        cursor?: string | null;
      },
      actor: ActorContext
    ) {
      authorizeActor(actor, "world:read", input?.world_id);
      if (!store.search)
        throw new ChangeSetError(
          "invalid_request",
          "search",
          "Search is unavailable"
        );
      try {
        return await store.search(input);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "v5_search_revision_changed"
        )
          throw new ChangeSetError(
            "revision_conflict",
            "cursor",
            "World Revision changed; restart search",
            [],
            true
          );
        if (error instanceof Error && error.message.startsWith("v5_search_"))
          throw new ChangeSetError(
            "invalid_request",
            "search",
            "Invalid or unavailable World search"
          );
        throw error;
      }
    },
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
