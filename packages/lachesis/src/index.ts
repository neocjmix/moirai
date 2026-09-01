import type {
  ChangePlan,
  ClothoMethod,
  ClothoScope,
  CreateChangeSet
} from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";

/** Produced by trusted server authentication, never deserialized from a request body. */
export interface ActorContext {
  readonly actor_id: string;
  readonly scopes: readonly ClothoScope[];
  readonly world_ids: readonly string[];
  readonly expires_at: string;
}
export type QueryMethod = Exclude<
  ClothoMethod,
  "change.validate" | "change.commit"
>;
export interface CanonicalStore {
  query(
    method: QueryMethod,
    input: Record<string, unknown>,
    worlds: readonly string[]
  ): Promise<unknown>;
  digest(change: CreateChangeSet): string;
  validate(change: CreateChangeSet): Promise<unknown>;
  commit(change: CreateChangeSet): Promise<unknown>;
}
export interface Lachesis {
  query(
    method: QueryMethod,
    input: Record<string, unknown>,
    actor: ActorContext
  ): Promise<unknown>;
  validate(
    plan: ChangePlan,
    actor: ActorContext,
    digest?: string
  ): Promise<unknown>;
  commit(
    plan: ChangePlan,
    actor: ActorContext,
    digest?: string
  ): Promise<unknown>;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function authorize(
  actor: ActorContext,
  scope: ClothoScope,
  world?: unknown
): void {
  if (
    !actor ||
    !uuid.test(actor.actor_id) ||
    !Number.isFinite(Date.parse(actor.expires_at)) ||
    Date.parse(actor.expires_at) <= Date.now() ||
    !Array.isArray(actor.scopes) ||
    !actor.scopes.includes(scope) ||
    !Array.isArray(actor.world_ids) ||
    !actor.world_ids.length ||
    actor.world_ids.some((id) => !uuid.test(id)) ||
    (world !== undefined &&
      (typeof world !== "string" || !actor.world_ids.includes(world)))
  )
    throw new ChangeSetError("forbidden", "authorization", "Access denied");
}
export function createLachesis(store: CanonicalStore): Lachesis {
  function change(
    plan: ChangePlan,
    actor: ActorContext,
    digest?: string
  ): CreateChangeSet {
    authorize(actor, "world:write", plan.world_id);
    if (Object.hasOwn(plan, "actor") || !uuid.test(plan.world_id))
      throw new ChangeSetError(
        "invalid_request",
        "plan",
        "Invalid change plan"
      );
    const command: CreateChangeSet = { ...plan, actor: actor.actor_id };
    if (digest && digest !== store.digest(command))
      throw new ChangeSetError(
        "plan_drift",
        "plan_digest",
        "Plan differs from preview"
      );
    return command;
  }
  return {
    async query(method, input, actor) {
      authorize(actor, "world:read", input.world_id);
      if (method !== "world.list" && typeof input.world_id !== "string")
        throw new ChangeSetError(
          "invalid_request",
          "world_id",
          "World is required"
        );
      return store.query(method, input, actor.world_ids);
    },
    async validate(plan, actor, digest) {
      return store.validate(change(plan, actor, digest));
    },
    async commit(plan, actor, digest) {
      // No preview receipt grants authority. Re-authorize and revalidate every commit.
      return store.commit(change(plan, actor, digest));
    }
  };
}
