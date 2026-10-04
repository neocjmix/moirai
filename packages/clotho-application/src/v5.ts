import {
  V5_INPUT_SCHEMAS,
  type V5Method,
  type V5ReadMethod
} from "@moirai/contracts/v5-wire";
/** Production v5 Clotho application contract. */
import {
  V5_CHANGE_PLAN_SCHEMA,
  V5_EVENT_SEARCH_SCHEMA,
  V5_EVENT_DETAIL_SCHEMA
} from "@moirai/contracts/v5-wire";
import { ChangeSetError } from "@moirai/domain";
import { authorizeActor, type ActorContext } from "@moirai/lachesis";
import type { V5DraftChange, WorldLifecycleInput } from "@moirai/lachesis/v5";
import { Ajv } from "ajv";

const valid = new Ajv({
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false
}).compile(V5_CHANGE_PLAN_SCHEMA);
const validSearch = new Ajv({
  coerceTypes: false,
  removeAdditional: false
}).compile(V5_EVENT_SEARCH_SCHEMA);
const validDetail = new Ajv({
  coerceTypes: false,
  removeAdditional: false
}).compile(V5_EVENT_DETAIL_SCHEMA);
export interface V5LachesisBoundary {
  lifecycle?(
    action: "delete" | "restore",
    input: WorldLifecycleInput,
    actor: ActorContext
  ): Promise<unknown>;
  query?(
    method: V5ReadMethod,
    input: Record<string, unknown>,
    actor: ActorContext
  ): Promise<unknown>;
  validateDraft?(plan: V5DraftChange, actor: ActorContext): Promise<unknown>;
  policy(worldId: string, actor: ActorContext): unknown;
  commitDraft(plan: V5DraftChange, actor: ActorContext): Promise<unknown>;
  search(
    input: {
      world_id: string;
      text: string;
      limit?: number;
      cursor?: string | null;
    },
    actor: ActorContext
  ): Promise<unknown>;
  detail(
    input: {
      world_id: string;
      event_id: string;
      at_revision: number;
      cursor?: string | null;
    },
    actor: ActorContext
  ): Promise<unknown>;
}

const validators = Object.fromEntries(
  Object.entries(V5_INPUT_SCHEMAS).map(([method, schema]) => [
    method,
    new Ajv({ coerceTypes: false, removeAdditional: false }).compile(schema)
  ])
);
export function createV5Clotho(boundary: V5LachesisBoundary) {
  const service = {
    detail(
      input: {
        world_id: string;
        event_id: string;
        at_revision: number;
        cursor?: string | null;
      },
      actor: ActorContext
    ) {
      authorizeActor(actor, "world:read", input?.world_id);
      if (!validDetail(input))
        throw new ChangeSetError(
          "invalid_request",
          "detail",
          "Invalid v5 Event detail input"
        );
      return boundary.detail(input, actor);
    },
    search(
      input: {
        world_id: string;
        text: string;
        limit?: number;
        cursor?: string | null;
      },
      actor: ActorContext
    ) {
      authorizeActor(actor, "world:read", input?.world_id);
      if (!validSearch(input))
        throw new ChangeSetError(
          "invalid_request",
          "search",
          "Invalid v5 Event search input"
        );
      return boundary.search(input, actor);
    },
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
  return {
    ...service,
    async execute(
      method: V5Method,
      raw: unknown,
      actor: ActorContext
    ): Promise<unknown> {
      const input =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      authorizeActor(
        actor,
        method.startsWith("change.") ||
          ["world.create", "world.delete", "world.restore"].includes(method)
          ? "world:write"
          : "world:read",
        method === "world.list" || method === "authoring.schema.get"
          ? undefined
          : input.world_id
      );
      if (!validators[method])
        throw new ChangeSetError("unknown_tool", "method", "Unknown method");
      if (method.startsWith("change.")) {
        if (input.contract_version !== 5)
          throw new ChangeSetError(
            "unsupported_contract_version",
            "contract_version",
            "Use v5"
          );
        if (!input.policy_version || !input.policy_digest)
          throw new ChangeSetError(
            "authoring_policy_required",
            "policy_version",
            "Retrieve policy",
            [],
            true,
            { action: "authoring.policy.get" }
          );
      }
      if (!validators[method]!(input))
        throw new ChangeSetError(
          "invalid_request",
          "input",
          "Invalid v5 input"
        );
      if (method === "authoring.schema.get")
        return {
          contract_version: 5,
          method: input.method,
          input_schema: V5_INPUT_SCHEMAS[input.method as V5Method]
        };
      if (method === "authoring.policy.get")
        return service.policy(String(input.world_id), actor);
      if (method === "world.create") {
        if (
          input.expected_revision !== 0 ||
          !(
            input.operations as Array<{ kind: string; entity_type: string }>
          ).some((op) => op.kind === "create" && op.entity_type === "world")
        )
          throw new ChangeSetError(
            "invalid_request",
            "world.create",
            "Create requires revision zero and a World create operation"
          );
        return service.commit(input, actor);
      }
      if (method === "world.delete" || method === "world.restore") {
        if (!boundary.lifecycle)
          throw new ChangeSetError(
            "unsupported_method",
            "method",
            "Lifecycle unavailable"
          );
        return boundary.lifecycle(
          method === "world.delete" ? "delete" : "restore",
          input as unknown as WorldLifecycleInput,
          actor
        );
      }
      if (method === "change.commit") return service.commit(input, actor);
      if (method === "change.validate") {
        if (!boundary.validateDraft)
          throw new ChangeSetError(
            "unsupported_method",
            "method",
            "Validation unavailable"
          );
        const draft = { ...input };
        delete draft.contract_version;
        return boundary.validateDraft(draft as unknown as V5DraftChange, actor);
      }
      if (method === "event.search")
        return service.search(
          input as unknown as Parameters<typeof service.search>[0],
          actor
        );
      if (method === "event.get")
        return service.detail(
          input as unknown as Parameters<typeof service.detail>[0],
          actor
        );
      if (!boundary.query)
        throw new ChangeSetError(
          "unsupported_method",
          "method",
          "Query unavailable"
        );
      return boundary.query(method, input, actor);
    }
  };
}
