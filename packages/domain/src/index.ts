import {
  CONTRACT_VERSION,
  type CreateChangeSet,
  type CreateOperation,
  type PublicCanon,
  type PublicCanonTimeSystem,
  type PublicEvent,
  type PublicNarrative,
  type PublicRelation,
  type PublicTemporalPlacement,
  type PublicTimeSystem,
  type PublicWorld,
  type RelationType,
  type ValidationIssue
} from "@moirai/contracts";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLIENT_REF = /^[a-z][a-z0-9_-]{0,63}$/;

type ResolveReferences<T> = T extends { readonly client_ref: string }
  ? string
  : T extends readonly (infer Item)[]
    ? readonly ResolveReferences<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: ResolveReferences<T[Key]> }
      : T;

export type ResolvedCreateOperation = ResolveReferences<CreateOperation> & {
  readonly entity_id: string;
};

export interface CanonicalState {
  readonly world: PublicWorld | null;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly events: readonly PublicEvent[];
  readonly temporalPlacements: readonly PublicTemporalPlacement[];
  readonly relations: readonly PublicRelation[];
  readonly narratives: readonly PublicNarrative[];
}

export class ChangeSetError extends Error implements ValidationIssue {
  readonly affected_ids: readonly string[];
  readonly retryable: boolean;

  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
    affectedIds: readonly string[] = [],
    retryable = false,
    readonly recovery?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.affected_ids = affectedIds;
    this.retryable = retryable;
  }

  toIssue(): ValidationIssue {
    return {
      code: this.code,
      path: this.path,
      affected_ids: this.affected_ids,
      message: this.message,
      retryable: this.retryable
    };
  }
}

function fail(
  code: string,
  path: string,
  message: string,
  affectedIds: readonly string[] = []
): never {
  throw new ChangeSetError(code, path, message, affectedIds);
}

function nonEmpty(value: string, path: string): void {
  if (!value.trim()) fail("required_field", path, `${path} is required`);
}

function isClientReference(
  value: unknown
): value is { readonly client_ref: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    typeof (value as { client_ref?: unknown }).client_ref === "string"
  );
}

export function validateCreateChangeSet(input: CreateChangeSet): void {
  if (input.contract_version !== CONTRACT_VERSION) {
    fail(
      "unsupported_contract_version",
      "contract_version",
      "Unsupported contract version"
    );
  }
  if (!UUID_V7.test(input.change_set_id) || !UUID_V7.test(input.world_id)) {
    fail(
      "invalid_identifier",
      "change_set_id",
      "Change Set and World IDs must be UUIDv7"
    );
  }
  if (
    !Number.isSafeInteger(input.expected_revision) ||
    input.expected_revision < 0
  ) {
    fail(
      "invalid_revision",
      "expected_revision",
      "Expected Revision must be a non-negative integer"
    );
  }
  nonEmpty(input.actor, "actor");
  nonEmpty(input.intent, "intent");
  if (input.operations.length === 0) {
    fail(
      "operations_required",
      "operations",
      "At least one Operation is required"
    );
  }
  const targets = new Set<string>();
  const clientRefs = new Set<string>();
  for (const [index, operation] of input.operations.entries()) {
    const path = `operations.${index}`;
    if (!operation.entity_id && !operation.client_ref) {
      fail(
        "operation_target_required",
        path,
        "Create Operation requires entity_id or client_ref"
      );
    }
    if (operation.entity_id) {
      if (
        !UUID_V7.test(operation.entity_id) ||
        targets.has(operation.entity_id)
      ) {
        fail(
          "duplicate_or_invalid_identifier",
          `${path}.entity_id`,
          "Entity IDs must be unique UUIDv7 values"
        );
      }
      targets.add(operation.entity_id);
    }
    if (operation.client_ref) {
      if (
        !CLIENT_REF.test(operation.client_ref) ||
        clientRefs.has(operation.client_ref)
      ) {
        fail(
          "duplicate_or_invalid_client_ref",
          `${path}.client_ref`,
          "client_ref must be unique and stable within the Change Set"
        );
      }
      clientRefs.add(operation.client_ref);
    }
  }
}

function resolveValue(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  path: string
): unknown {
  if (isClientReference(value)) {
    const id = mapping.get(value.client_ref);
    if (!id) {
      fail(
        "dangling_reference",
        path,
        `client_ref '${value.client_ref}' does not reference an earlier Operation`
      );
    }
    return id;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      resolveValue(child, mapping, `${path}.${index}`)
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveValue(child, mapping, `${path}.${key}`)
      ])
    );
  }
  return value;
}

export function resolveCreateOperations(
  input: CreateChangeSet,
  generateId: () => string
): {
  readonly operations: readonly ResolvedCreateOperation[];
  readonly idMapping: Readonly<Record<string, string>>;
} {
  validateCreateChangeSet(input);
  const mapping = new Map<string, string>();
  const operations = input.operations.map((operation, index) => {
    const entityId = operation.entity_id ?? generateId();
    if (!UUID_V7.test(entityId)) {
      fail(
        "invalid_identifier",
        `operations.${index}.entity_id`,
        "Generated entity ID is not UUIDv7"
      );
    }
    const resolved = {
      ...operation,
      entity_id: entityId,
      value: resolveValue(operation.value, mapping, `operations.${index}.value`)
    } as ResolvedCreateOperation;
    if (operation.client_ref) mapping.set(operation.client_ref, entityId);
    return resolved;
  });
  return { operations, idMapping: Object.fromEntries(mapping) };
}

const RELATION_REGISTRY: Readonly<
  Record<RelationType, { direction: "directed" | "undirected" }>
> = {
  contains: { direction: "directed" },
  precedes: { direction: "directed" },
  causes: { direction: "directed" },
  enables: { direction: "directed" },
  prevents: { direction: "directed" },
  influences: { direction: "directed" },
  starts: { direction: "directed" },
  ends: { direction: "directed" },
  identity_continues: { direction: "directed" },
  identity_instance_of: { direction: "directed" },
  identity_splits: { direction: "directed" },
  identity_merges: { direction: "directed" },
  derives_from: { direction: "directed" },
  transfers: { direction: "directed" }
};

function wouldCreateContainmentCycle(
  relations: Iterable<PublicRelation>,
  source: string,
  target: string
): boolean {
  const children = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== "contains") continue;
    const values = children.get(relation.source_event_id) ?? [];
    values.push(relation.target_event_id);
    children.set(relation.source_event_id, values);
  }
  const pending = [target];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(children.get(current) ?? []));
  }
  return false;
}

function finiteCoordinate(
  value: { readonly value: number },
  path: string
): void {
  if (!Number.isFinite(value.value)) {
    fail(
      "invalid_time_coordinate",
      path,
      "Temporal coordinates must be finite numbers"
    );
  }
}

export function validateCandidateChangeSet(
  input: CreateChangeSet,
  operations: readonly ResolvedCreateOperation[],
  existing: CanonicalState
): readonly ValidationIssue[] {
  const world = existing.world;
  const canons = new Map(existing.canons.map((item) => [item.id, item]));
  const timeSystems = new Map(
    existing.timeSystems.map((item) => [item.id, item])
  );
  const canonTimeSystems = new Map(
    existing.canonTimeSystems.map((item) => [item.id, item])
  );
  const events = new Map(existing.events.map((item) => [item.id, item]));
  const placements = new Map(
    existing.temporalPlacements.map((item) => [item.id, item])
  );
  const relations = new Map(existing.relations.map((item) => [item.id, item]));
  const narratives = new Map(
    existing.narratives.map((item) => [item.id, item])
  );
  const ids = new Set<string>([
    ...(world ? [world.id] : []),
    ...canons.keys(),
    ...timeSystems.keys(),
    ...canonTimeSystems.keys(),
    ...events.keys(),
    ...placements.keys(),
    ...relations.keys(),
    ...narratives.keys()
  ]);
  let candidateWorld = world;

  for (const [index, operation] of operations.entries()) {
    const path = `operations.${index}`;
    if (ids.has(operation.entity_id)) {
      fail(
        "duplicate_entity_id",
        `${path}.entity_id`,
        "Entity ID already exists",
        [operation.entity_id]
      );
    }
    ids.add(operation.entity_id);
    switch (operation.entity_type) {
      case "world": {
        const value = operation.value;
        if (candidateWorld || operation.entity_id !== input.world_id) {
          fail(
            "world_scope_mismatch",
            path,
            "World create must create the Change Set World",
            [operation.entity_id]
          );
        }
        nonEmpty(value.slug, `${path}.value.slug`);
        nonEmpty(value.title, `${path}.value.title`);
        candidateWorld = {
          id: operation.entity_id,
          slug: value.slug,
          title: value.title,
          description: value.description ?? null
        };
        break;
      }
      case "canon": {
        const value = operation.value;
        if (!candidateWorld || value.world_id !== input.world_id) {
          fail(
            "world_scope_mismatch",
            `${path}.value.world_id`,
            "Canon is outside the Change Set World"
          );
        }
        nonEmpty(value.slug, `${path}.value.slug`);
        nonEmpty(value.title, `${path}.value.title`);
        canons.set(operation.entity_id, {
          id: operation.entity_id,
          world_id: value.world_id,
          slug: value.slug,
          title: value.title,
          description: value.description ?? null
        });
        break;
      }
      case "time_system": {
        const value = operation.value;
        if (!candidateWorld || value.world_id !== input.world_id) {
          fail(
            "world_scope_mismatch",
            `${path}.value.world_id`,
            "Time System is outside the Change Set World"
          );
        }
        nonEmpty(value.slug, `${path}.value.slug`);
        nonEmpty(value.title, `${path}.value.title`);
        nonEmpty(value.definition_version, `${path}.value.definition_version`);
        if (value.definition.coordinate !== "integer") {
          fail(
            "unsupported_time_definition",
            `${path}.value.definition.coordinate`,
            "Milestone 2 requires the versioned integer coordinate adapter"
          );
        }
        timeSystems.set(operation.entity_id, {
          id: operation.entity_id,
          ...value
        });
        break;
      }
      case "canon_time_system": {
        const value = operation.value;
        const canon = canons.get(value.canon_id);
        const timeSystem = timeSystems.get(value.time_system_id);
        if (!canon || !timeSystem) {
          fail(
            "dangling_reference",
            path,
            "Canon-Time System link has a missing endpoint",
            [value.canon_id, value.time_system_id]
          );
        }
        if (
          canon.world_id !== timeSystem.world_id ||
          canon.world_id !== input.world_id
        ) {
          fail(
            "world_scope_mismatch",
            path,
            "Canon and Time System must belong to the same World"
          );
        }
        canonTimeSystems.set(operation.entity_id, {
          id: operation.entity_id,
          ...value
        });
        break;
      }
      case "event": {
        const value = operation.value;
        const canon = canons.get(value.canon_id);
        if (!canon)
          fail(
            "dangling_reference",
            `${path}.value.canon_id`,
            "Event Canon does not exist",
            [value.canon_id]
          );
        if (canon.world_id !== input.world_id)
          fail(
            "world_scope_mismatch",
            path,
            "Event is outside the Change Set World"
          );
        nonEmpty(value.title, `${path}.value.title`);
        events.set(operation.entity_id, {
          id: operation.entity_id,
          canon_id: value.canon_id,
          slug: value.slug ?? null,
          kind: value.kind,
          title: value.title,
          summary: value.summary ?? null,
          roles: value.roles,
          attributes: value.attributes
        });
        break;
      }
      case "event_temporal_placement": {
        const value = operation.value;
        const event = events.get(value.event_id);
        const timeSystem = timeSystems.get(value.time_system_id);
        if (!event || !timeSystem) {
          fail(
            "dangling_reference",
            path,
            "Temporal placement has a missing Event or Time System",
            [value.event_id, value.time_system_id]
          );
        }
        const linked = [...canonTimeSystems.values()].some(
          (item) =>
            item.canon_id === event.canon_id &&
            item.time_system_id === timeSystem.id
        );
        if (!linked)
          fail(
            "time_system_not_used_by_canon",
            path,
            "Event Canon does not use this Time System"
          );
        finiteCoordinate(value.earliest_start, `${path}.value.earliest_start`);
        finiteCoordinate(value.latest_start, `${path}.value.latest_start`);
        if (value.earliest_start.value > value.latest_start.value) {
          fail(
            "invalid_time_coordinate",
            path,
            "earliest_start must not be after latest_start"
          );
        }
        const earliestEnd = value.earliest_end ?? null;
        const latestEnd = value.latest_end ?? null;
        if (value.kind === "point" && (earliestEnd || latestEnd)) {
          fail(
            "invalid_time_coordinate",
            path,
            "Point placement must not contain end coordinates"
          );
        }
        if (value.kind === "interval") {
          if (!earliestEnd || !latestEnd)
            fail(
              "invalid_time_coordinate",
              path,
              "Interval placement requires end coordinates"
            );
          finiteCoordinate(earliestEnd, `${path}.value.earliest_end`);
          finiteCoordinate(latestEnd, `${path}.value.latest_end`);
          if (
            earliestEnd.value > latestEnd.value ||
            value.earliest_start.value > latestEnd.value
          ) {
            fail(
              "invalid_time_coordinate",
              path,
              "Interval boundaries are inconsistent"
            );
          }
        }
        nonEmpty(value.precision, `${path}.value.precision`);
        placements.set(operation.entity_id, {
          id: operation.entity_id,
          event_id: value.event_id,
          time_system_id: value.time_system_id,
          kind: value.kind,
          earliest_start: value.earliest_start,
          latest_start: value.latest_start,
          earliest_end: earliestEnd,
          latest_end: latestEnd,
          precision: value.precision,
          certainty: value.certainty,
          display_label: value.display_label ?? null
        });
        break;
      }
      case "relation": {
        const value = operation.value;
        const source = events.get(value.source_event_id);
        const target = events.get(value.target_event_id);
        if (!source || !target) {
          fail("dangling_reference", path, "Relation endpoint does not exist", [
            value.source_event_id,
            value.target_event_id
          ]);
        }
        if (
          source.canon_id !== target.canon_id ||
          source.canon_id !== value.canon_id
        ) {
          fail(
            "cross_canon_relation",
            path,
            "Relation and both endpoints must share one Canon",
            [source.id, target.id]
          );
        }
        if (source.id === target.id)
          fail(
            "self_relation_not_allowed",
            path,
            "This Relation type does not allow a self relation",
            [source.id]
          );
        if (RELATION_REGISTRY[value.type].direction !== value.direction) {
          fail(
            "relation_direction_mismatch",
            `${path}.value.direction`,
            "Relation direction does not match the registry"
          );
        }
        if (
          value.type === "contains" &&
          wouldCreateContainmentCycle(relations.values(), source.id, target.id)
        ) {
          fail(
            "containment_cycle",
            path,
            "contains Relation would create a cycle",
            [source.id, target.id]
          );
        }
        relations.set(operation.entity_id, {
          id: operation.entity_id,
          ...value
        });
        break;
      }
      case "narrative": {
        const value = operation.value;
        const canon = canons.get(value.canon_id);
        if (!canon)
          fail(
            "dangling_reference",
            `${path}.value.canon_id`,
            "Narrative Canon does not exist",
            [value.canon_id]
          );
        if (value.scope_type === "canon" && value.scope_id !== value.canon_id) {
          fail(
            "narrative_scope_mismatch",
            `${path}.value.scope_id`,
            "Canon Narrative must scope the same Canon"
          );
        }
        if (value.scope_type === "event") {
          const event = events.get(value.scope_id);
          if (!event)
            fail(
              "dangling_reference",
              `${path}.value.scope_id`,
              "Narrative Event does not exist",
              [value.scope_id]
            );
          if (event.canon_id !== value.canon_id)
            fail(
              "cross_canon_narrative",
              path,
              "Narrative and Event must share one Canon"
            );
        }
        if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.locale)) {
          fail(
            "invalid_locale",
            `${path}.value.locale`,
            "Narrative locale must be a BCP 47 tag"
          );
        }
        nonEmpty(value.body, `${path}.value.body`);
        for (const [
          referenceIndex,
          reference
        ] of value.public_references.entries()) {
          nonEmpty(
            reference.label,
            `${path}.value.public_references.${referenceIndex}.label`
          );
          let url: URL;
          try {
            url = new URL(reference.url);
          } catch {
            fail(
              "invalid_public_reference",
              `${path}.value.public_references.${referenceIndex}.url`,
              "Public reference must be an absolute URL"
            );
          }
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            fail(
              "invalid_public_reference",
              `${path}.value.public_references.${referenceIndex}.url`,
              "Public reference must use HTTP(S)"
            );
          }
        }
        narratives.set(operation.entity_id, {
          id: operation.entity_id,
          canon_id: value.canon_id,
          scope_type: value.scope_type,
          scope_id: value.scope_id,
          locale: value.locale,
          kind: value.kind,
          title: value.title ?? null,
          body: value.body,
          public_references: value.public_references
        });
        break;
      }
    }
  }

  if (!candidateWorld)
    fail("world_missing", "world_id", "Change Set World does not exist", [
      input.world_id
    ]);
  const warnings: ValidationIssue[] = [];
  for (const event of events.values()) {
    if (event.kind === "composite" && event.roles.includes("process")) {
      const hasChildren = [...relations.values()].some(
        (relation) =>
          relation.type === "contains" && relation.source_event_id === event.id
      );
      if (!hasChildren) {
        warnings.push({
          code: "empty_process",
          path: "operations",
          affected_ids: [event.id],
          message: "Process Event has no contained child Event",
          retryable: false
        });
      }
    }
  }
  return warnings;
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
