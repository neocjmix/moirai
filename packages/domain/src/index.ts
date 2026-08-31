import {
  CONTRACT_VERSION,
  type CreateChangeSet,
  type CreateOperation
} from "@moirai/contracts";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class ChangeSetError extends Error {
  constructor(
    readonly code:
      "invalid_change_set" | "revision_conflict" | "idempotency_key_reused",
    message: string
  ) {
    super(message);
  }
}

function nonEmpty(value: string, field: string): void {
  if (!value.trim())
    throw new ChangeSetError("invalid_change_set", `${field} is required`);
}

export function validateCreateChangeSet(input: CreateChangeSet): void {
  if (input.contract_version !== CONTRACT_VERSION) {
    throw new ChangeSetError(
      "invalid_change_set",
      "unsupported contract_version"
    );
  }
  if (!UUID_V7.test(input.change_set_id) || !UUID_V7.test(input.world_id)) {
    throw new ChangeSetError(
      "invalid_change_set",
      "identifiers must be UUIDv7"
    );
  }
  if (
    !Number.isSafeInteger(input.expected_revision) ||
    input.expected_revision < 0
  ) {
    throw new ChangeSetError(
      "invalid_change_set",
      "expected_revision is invalid"
    );
  }
  nonEmpty(input.actor, "actor");
  nonEmpty(input.intent, "intent");
  if (input.operations.length === 0) {
    throw new ChangeSetError("invalid_change_set", "operations are required");
  }

  const created = new Map<string, CreateOperation>();
  for (const operation of input.operations) {
    if (
      !UUID_V7.test(operation.entity_id) ||
      created.has(operation.entity_id)
    ) {
      throw new ChangeSetError(
        "invalid_change_set",
        "entity IDs must be unique UUIDv7"
      );
    }
    if (operation.entity_type === "world") {
      if (operation.entity_id !== input.world_id) {
        throw new ChangeSetError(
          "invalid_change_set",
          "World operation is outside Change Set scope"
        );
      }
      nonEmpty(operation.value.slug, "world.slug");
      nonEmpty(operation.value.title, "world.title");
    } else if (operation.entity_type === "canon") {
      if (
        operation.value.world_id !== input.world_id ||
        !created.has(input.world_id)
      ) {
        throw new ChangeSetError(
          "invalid_change_set",
          "Canon must reference the created World"
        );
      }
      nonEmpty(operation.value.slug, "canon.slug");
      nonEmpty(operation.value.title, "canon.title");
    } else {
      const canon = created.get(operation.value.canon_id);
      if (canon?.entity_type !== "canon") {
        throw new ChangeSetError(
          "invalid_change_set",
          "Event must reference an earlier Canon"
        );
      }
      nonEmpty(operation.value.title, "event.title");
    }
    created.set(operation.entity_id, operation);
  }
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
