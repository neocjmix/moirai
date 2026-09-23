/** Internal v5 draft resolver. Clotho must validate a strict versioned wire
 * schema before it can pass a request to this boundary. */
import type {
  OriginRef,
  ResolvedOperation,
  ResolvedV5Change
} from "@moirai/contracts/v5";
import { ChangeSetError } from "@moirai/domain";
import { v5ClientRefId } from "./v5-client-ids.js";

type IdRef = string | { readonly client_ref: string };
type V5DraftOperation =
  | {
      readonly kind: "create";
      readonly entity_type: string;
      readonly entity_id?: string;
      readonly client_ref?: string;
      readonly origin_refs: readonly OriginRef[];
      readonly value: Record<string, unknown>;
    }
  | {
      readonly kind: "update" | "withdraw";
      readonly entity_type: string;
      readonly entity_id: IdRef;
      readonly origin_refs: readonly OriginRef[];
      readonly value?: Record<string, unknown>;
    }
  | {
      readonly kind: "add" | "remove";
      readonly entity_type: "event_collection_membership";
      readonly origin_refs: readonly OriginRef[];
      readonly value: Record<string, unknown>;
    };

export type V5DraftChange = Omit<
  ResolvedV5Change,
  "actor" | "operations" | "id_mapping"
> & {
  readonly operations: readonly V5DraftOperation[];
};
const uuidV7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clientRef = /^[a-z][a-z0-9_-]{0,63}$/;
const creatable = new Set([
  "collection",
  "time_system",
  "collection_time_system",
  "event",
  "relation",
  "narrative"
]);
const updatable = new Set(["world", "collection", "event", "narrative"]);
const withdrawable = new Set(["collection", "event", "relation", "narrative"]);
function invalid(path: string): never {
  throw new ChangeSetError(
    "invalid_reference",
    path,
    "Invalid v5 entity reference"
  );
}
function resolveId(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  path: string
): string {
  if (typeof value === "string" && uuidV7.test(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as { client_ref?: unknown }).client_ref === "string"
  ) {
    const id = mapping.get((value as { client_ref: string }).client_ref);
    if (id) return id;
  }
  return invalid(path);
}
function endpoint(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  path: string
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid(path);
  const record = value as Record<string, unknown>;
  if (record.kind === "event") {
    const id = Object.hasOwn(record, "client_ref")
      ? resolveId({ client_ref: record.client_ref }, mapping, path)
      : resolveId(record.event_id, mapping, path);
    const rest = { ...record };
    delete rest.client_ref;
    return { ...rest, event_id: id };
  }
  if (record.kind === "time_event") {
    const ref = record.time_system_ref as Record<string, unknown> | undefined;
    if (!ref || typeof ref !== "object" || Array.isArray(ref))
      return invalid(path);
    const id = Object.hasOwn(ref, "client_ref")
      ? resolveId({ client_ref: ref.client_ref }, mapping, path)
      : resolveId(ref.time_system_id, mapping, path);
    return { ...record, time_system_ref: { time_system_id: id } };
  }
  return invalid(path);
}
function valueRefs(
  value: Record<string, unknown>,
  type: string,
  mapping: ReadonlyMap<string, string>,
  path: string
): Record<string, unknown> {
  const result = { ...value };
  for (const key of [
    "world_id",
    "collection_id",
    "time_system_id",
    "event_id",
    "scope_id"
  ])
    if (Object.hasOwn(result, key))
      result[key] = resolveId(result[key], mapping, `${path}.${key}`);
  if (type === "relation") {
    result.source_ref = endpoint(
      value.source_ref,
      mapping,
      `${path}.source_ref`
    );
    result.target_ref = endpoint(
      value.target_ref,
      mapping,
      `${path}.target_ref`
    );
  }
  return result;
}

/** Preallocate IDs before resolving links; both exact retry and forward
 * references therefore reuse the same canonical identifiers. */
export function resolveV5DraftChange(
  plan: V5DraftChange
): Omit<ResolvedV5Change, "actor"> {
  if (
    !plan ||
    !uuidV7.test(plan.change_set_id) ||
    !Array.isArray(plan.operations)
  )
    return invalid("change_set_id");
  const mapping = new Map<string, string>();
  const allocated = new Set<string>();
  for (const [index, operation] of plan.operations.entries()) {
    if (
      !Array.isArray(operation.origin_refs) ||
      operation.origin_refs.length === 0 ||
      operation.origin_refs.some(
        (ref) =>
          !Number.isSafeInteger(ref.origin_index) ||
          ref.origin_index < 0 ||
          ref.origin_index >= plan.origins.length ||
          typeof ref.field !== "string" ||
          (ref.field !== "*" &&
            (!operation.value || !Object.hasOwn(operation.value, ref.field)))
      )
    )
      return invalid(`operations.${index}.origin_refs`);
    if (operation.kind !== "create") continue;
    if (
      !creatable.has(operation.entity_type) ||
      (operation.entity_id === undefined) ===
        (operation.client_ref === undefined)
    )
      return invalid(`operations.${index}`);
    if (
      operation.client_ref !== undefined &&
      (!clientRef.test(operation.client_ref) ||
        mapping.has(operation.client_ref))
    )
      return invalid(`operations.${index}.client_ref`);
    const id =
      operation.client_ref === undefined
        ? resolveId(
            operation.entity_id,
            mapping,
            `operations.${index}.entity_id`
          )
        : v5ClientRefId(
            plan.change_set_id,
            operation.entity_type,
            operation.client_ref
          );
    if (allocated.has(id)) return invalid(`operations.${index}.entity_id`);
    allocated.add(id);
    if (operation.client_ref !== undefined)
      mapping.set(operation.client_ref, id);
  }
  const operations = plan.operations.map(
    (operation, index): ResolvedOperation => {
      const path = `operations.${index}`;
      if (operation.kind === "add" || operation.kind === "remove") {
        if (
          operation.entity_type !== "event_collection_membership" ||
          !operation.value
        )
          return invalid(path);
        return {
          kind: operation.kind,
          entity_type: operation.entity_type,
          origin_refs: operation.origin_refs,
          value: {
            event_id: resolveId(
              operation.value.event_id,
              mapping,
              `${path}.event_id`
            ),
            collection_id: resolveId(
              operation.value.collection_id,
              mapping,
              `${path}.collection_id`
            )
          }
        };
      }
      if (operation.kind === "withdraw") {
        if (!withdrawable.has(operation.entity_type)) return invalid(path);
        return {
          kind: "withdraw",
          entity_type: operation.entity_type as "event",
          entity_id: resolveId(
            operation.entity_id,
            mapping,
            `${path}.entity_id`
          ),
          origin_refs: operation.origin_refs
        };
      }
      if (operation.kind === "update") {
        if (!updatable.has(operation.entity_type) || !operation.value)
          return invalid(path);
        return {
          kind: "update",
          entity_type: operation.entity_type as "event",
          entity_id: resolveId(
            operation.entity_id,
            mapping,
            `${path}.entity_id`
          ),
          origin_refs: operation.origin_refs,
          value: valueRefs(
            operation.value,
            operation.entity_type,
            mapping,
            `${path}.value`
          ) as never
        };
      }
      if (operation.kind === "create") {
        if (!creatable.has(operation.entity_type) || !operation.value)
          return invalid(path);
        return {
          kind: "create",
          entity_type: operation.entity_type as "event",
          entity_id:
            operation.client_ref === undefined
              ? resolveId(operation.entity_id, mapping, `${path}.entity_id`)
              : mapping.get(operation.client_ref)!,
          origin_refs: operation.origin_refs,
          value: valueRefs(
            operation.value,
            operation.entity_type,
            mapping,
            `${path}.value`
          ) as never
        };
      }
      return invalid(path);
    }
  );
  return {
    change_set_id: plan.change_set_id,
    world_id: plan.world_id,
    expected_revision: plan.expected_revision,
    intent: plan.intent,
    origins: plan.origins,
    policy_version: plan.policy_version,
    policy_digest: plan.policy_digest,
    operations,
    id_mapping: Object.fromEntries(mapping)
  };
}
