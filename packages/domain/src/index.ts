import {
  CONTRACT_VERSION,
  type CanonicalEventCanonMembership,
  type CanonicalEventReference,
  type CanonicalRelationCanonMembership,
  type ChangeOperation,
  type CreateChangeSet,
  type PublicCanon,
  type PublicCanonTimeSystem,
  type PublicEvent,
  type PublicNarrative,
  type PublicRelation,
  type PublicTimeSystem,
  type PublicWorld,
  type RelationType,
  type ValidationIssue
} from "@moirai/contracts";
import {
  canonicalRelationEndpoints,
  endpointEventId,
  endpointKey,
  temporalAdapterRegistry
} from "./temporal-relations.js";
import { solveTemporalGraph } from "./temporal-graph.js";
import type {
  CompositeTemporalRelation,
  TemporalConstraint
} from "./temporal.js";

export * from "./temporal.js";
export * from "./temporal-graph.js";
export * from "./temporal-relations.js";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLIENT_REF = /^[a-z][a-z0-9_-]{0,63}$/;

type ResolveReferences<T> = T extends {
  readonly kind: "event";
  readonly client_ref: string;
}
  ? { readonly kind: "event"; readonly event_id: string }
  : T extends { readonly kind: "time_event" }
    ? Extract<CanonicalEventReference, { readonly kind: "time_event" }>
    : T extends { readonly client_ref: string }
      ? string
      : T extends readonly (infer Item)[]
        ? readonly ResolveReferences<Item>[]
        : T extends object
          ? { readonly [Key in keyof T]: ResolveReferences<T[Key]> }
          : T;

export type ResolvedChangeOperation = ResolveReferences<ChangeOperation> & {
  readonly entity_id: string;
};
export type ResolvedCreateOperation = ResolvedChangeOperation;

export interface CanonicalState {
  readonly world: PublicWorld | null;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly eventCanonMemberships: readonly CanonicalEventCanonMembership[];
  readonly relationCanonMemberships: readonly CanonicalRelationCanonMembership[];
  readonly events: readonly PublicEvent[];
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
    for (const ref of operation.origin_refs ?? []) {
      if (
        !Number.isInteger(ref.origin_index) ||
        ref.origin_index < 0 ||
        !input.origins[ref.origin_index] ||
        (ref.field !== "*" && !Object.hasOwn(operation.value, ref.field))
      ) {
        fail(
          "invalid_origin_reference",
          `${path}.origin_refs`,
          "Origin must reference a supplied origin and changed field"
        );
      }
    }
    if (
      operation.kind === "create" &&
      !operation.entity_id &&
      !operation.client_ref
    ) {
      fail(
        "operation_target_required",
        path,
        "Create Operation requires entity_id or client_ref"
      );
    }
    if (operation.kind === "create" && operation.entity_id) {
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
    if (operation.kind === "create" && operation.client_ref) {
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
    if (operation.kind === "create" && operation.entity_type === "relation") {
      const value = operation.value;
      if (!value.source_ref || !value.target_ref) {
        fail(
          "relation_endpoint_contract_mismatch",
          `${path}.value`,
          "Relations require source_ref and target_ref"
        );
      }
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

function resolveReferenceId(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  path: string
): string {
  const resolved = resolveValue(value, mapping, path);
  if (typeof resolved !== "string") {
    fail("invalid_reference", path, "Reference must resolve to an identifier");
  }
  return resolved;
}

function resolveEventReference(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
  path: string
): CanonicalEventReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_event_reference", path, "Relation endpoint must be tagged");
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "event") {
    const eventId =
      typeof record.event_id === "string"
        ? record.event_id
        : resolveReferenceId(
            { client_ref: record.client_ref },
            mapping,
            `${path}.client_ref`
          );
    return { kind: "event", event_id: eventId };
  }
  if (record.kind === "time_event") {
    if (
      !record.time_system_ref ||
      typeof record.time_system_ref !== "object" ||
      Array.isArray(record.time_system_ref) ||
      typeof record.definition_version !== "string" ||
      typeof record.coordinate !== "string"
    ) {
      fail(
        "invalid_event_reference",
        path,
        "Time Event reference requires Time System, definition version, and coordinate"
      );
    }
    const timeSystemRef = record.time_system_ref as Record<string, unknown>;
    const timeSystemId =
      typeof timeSystemRef.time_system_id === "string"
        ? timeSystemRef.time_system_id
        : resolveReferenceId(
            { client_ref: timeSystemRef.client_ref },
            mapping,
            `${path}.time_system_ref.client_ref`
          );
    return {
      kind: "time_event",
      time_system_ref: { time_system_id: timeSystemId },
      definition_version: record.definition_version,
      coordinate: record.coordinate
    };
  }
  fail("invalid_event_reference", path, "Unknown Event reference kind");
}

function resolveRelationValue(
  _input: CreateChangeSet,
  value: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
  path: string
): Record<string, unknown> {
  let source = resolveEventReference(
    value.source_ref,
    mapping,
    `${path}.source_ref`
  );
  let target = resolveEventReference(
    value.target_ref,
    mapping,
    `${path}.target_ref`
  );
  if (value.type === "coincides" && endpointKey(source) > endpointKey(target)) {
    [source, target] = [target, source];
  }
  return {
    ...value,
    world_id: resolveReferenceId(value.world_id, mapping, `${path}.world_id`),
    source_ref: source,
    target_ref: target
  };
}

export function resolveCreateOperations(
  input: CreateChangeSet,
  generateId: () => string
): {
  readonly operations: readonly ResolvedChangeOperation[];
  readonly idMapping: Readonly<Record<string, string>>;
} {
  validateCreateChangeSet(input);
  const mapping = new Map<string, string>();
  const operations = input.operations.map((operation, index) => {
    if (operation.kind !== "create") {
      const value = resolveValue(
        operation.value,
        mapping,
        `operations.${index}.value`
      ) as { readonly event_id?: string; readonly relation_id?: string };
      return {
        ...operation,
        entity_id: value.event_id ?? value.relation_id!,
        value
      } as ResolvedChangeOperation;
    }
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
      value:
        operation.entity_type === "relation"
          ? resolveRelationValue(
              input,
              operation.value as unknown as Record<string, unknown>,
              mapping,
              `operations.${index}.value`
            )
          : resolveValue(operation.value, mapping, `operations.${index}.value`)
    } as ResolvedChangeOperation;
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
  not_after: { direction: "directed" },
  coincides: { direction: "undirected" },
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
    const endpoints = canonicalRelationEndpoints(relation);
    if (!endpoints) continue;
    const sourceId = endpointEventId(endpoints.source);
    const targetId = endpointEventId(endpoints.target);
    if (!sourceId || !targetId) continue;
    const values = children.get(sourceId) ?? [];
    values.push(targetId);
    children.set(sourceId, values);
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

function validateTimeSystemDefinition(
  definition: Readonly<Record<string, unknown>>,
  _contractVersion: CreateChangeSet["contract_version"],
  path: string
): void {
  const codec = definition.coordinate_codec;
  if (typeof codec !== "string") {
    fail(
      "unsupported_time_definition",
      `${path}.coordinate_codec`,
      "Temporal Time Systems require a versioned coordinate codec"
    );
  }
  const capabilities = definition.capabilities;
  if (
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === "string") ||
    !capabilities.includes("canonicalize") ||
    !capabilities.includes("equality")
  ) {
    fail(
      "unsupported_time_definition",
      `${path}.capabilities`,
      "Temporal Time Systems must declare canonicalize and equality capabilities"
    );
  }
  if (codec === "yyyy-iso-fields-fraction12-z-v1") {
    if (
      definition.calendar !== "proleptic-gregorian" ||
      definition.timezone !== "UTC" ||
      definition.fractional_digits !== 12 ||
      definition.leap_second_policy !== "reject" ||
      definition.interval_policy !== "half-open"
    ) {
      fail(
        "unsupported_time_definition",
        path,
        "The Gregorian UTC adapter requires its accepted calendar, timezone, precision, leap-second, and half-open boundary contract"
      );
    }
    if (
      !["compare", "boundary", "difference"].every((capability) =>
        capabilities.includes(capability)
      )
    ) {
      fail(
        "unsupported_time_definition",
        `${path}.capabilities`,
        "The accepted Gregorian UTC adapter requires compare, boundary, and difference capabilities"
      );
    }
    return;
  }
  if (codec === "continuous-decimal-v1") {
    if (
      typeof definition.unit !== "string" ||
      (definition.direction !== "ascending" &&
        definition.direction !== "descending")
    ) {
      fail(
        "unsupported_time_definition",
        path,
        "Continuous scalar Time Systems require a unit and direction"
      );
    }
    return;
  }
  if (codec === "opaque-cycle-v1" || codec === "opaque-token-v1") return;
  // A custom Time System may be authored before its executable adapter ships.
  // A Time Event reference to it will later report the missing capability.
}

function requireRelationEndpoints(
  value: unknown,
  path: string
): {
  readonly source: CanonicalEventReference;
  readonly target: CanonicalEventReference;
} {
  const endpoints = canonicalRelationEndpoints(value as PublicRelation);
  if (!endpoints) {
    fail(
      "invalid_event_reference",
      path,
      "Relation requires two canonical Event references"
    );
  }
  return endpoints;
}

function validateRelationReference(
  reference: CanonicalEventReference,
  canonId: string,
  events: ReadonlyMap<string, PublicEvent>,
  eventCanonMemberships: ReadonlyMap<string, ReadonlySet<string>>,
  timeSystems: ReadonlyMap<string, PublicTimeSystem>,
  canonTimeSystems: Iterable<PublicCanonTimeSystem>,
  path: string,
  relationId?: string
): PublicEvent | null {
  if (reference.kind === "event") {
    const event = events.get(reference.event_id);
    if (!event) {
      fail(
        "dangling_reference",
        path,
        "Relation Event endpoint does not exist",
        [reference.event_id]
      );
    }
    if (!eventCanonMemberships.get(event.id)?.has(canonId)) {
      fail(
        "cross_canon_relation",
        path,
        "Relation and Event endpoint must share one Canon",
        [event.id]
      );
    }
    return event;
  }
  const timeSystem = timeSystems.get(reference.time_system_ref.time_system_id);
  if (!timeSystem) {
    fail(
      "dangling_reference",
      path,
      "Time Event references an unknown Time System",
      [reference.time_system_ref.time_system_id]
    );
  }
  if (timeSystem.definition_version !== reference.definition_version) {
    fail(
      "time_system_version_mismatch",
      path,
      "Time Event definition version does not match the linked Time System",
      [timeSystem.id]
    );
  }
  const linked = [...canonTimeSystems].some(
    (item) => item.canon_id === canonId && item.time_system_id === timeSystem.id
  );
  if (!linked) {
    fail(
      "time_system_not_used_by_canon",
      path,
      "Time Event Time System is not linked to this Canon",
      [timeSystem.id, canonId]
    );
  }
  const adapter = temporalAdapterRegistry(timeSystems.values()).get(
    timeSystem.id,
    reference.definition_version
  );
  if (adapter) {
    try {
      const canonical = adapter.canonicalize(reference.coordinate);
      if (canonical !== reference.coordinate) {
        throw new Error(`Canonical coordinate is '${canonical}'`);
      }
    } catch (cause) {
      throw new ChangeSetError(
        "invalid_time_coordinate",
        path,
        `Invalid coordinate '${reference.coordinate}': ${cause instanceof Error ? cause.message : "adapter rejected the coordinate"}`,
        [timeSystem.id, ...(relationId ? [relationId] : [])],
        false,
        { original_coordinate: reference.coordinate }
      );
    }
  }
  return null;
}

function validateRelationEndpointKinds(
  type: RelationType,
  sourceEvent: PublicEvent | null,
  targetEvent: PublicEvent | null,
  path: string
): void {
  if (type === "contains") {
    if (!sourceEvent || sourceEvent.kind !== "composite") {
      fail(
        "relation_endpoint_kind_invalid",
        path,
        "contains requires a Composite Event as its source"
      );
    }
    return;
  }
  if (type === "starts" || type === "ends") {
    if (!targetEvent || targetEvent.kind !== "composite") {
      fail(
        "relation_endpoint_kind_invalid",
        path,
        `${type} requires a Composite Event as its target`
      );
    }
    return;
  }
  if (type === "precedes" || type === "not_after" || type === "coincides") {
    return;
  }
  if (!sourceEvent || !targetEvent) {
    fail(
      "relation_endpoint_kind_invalid",
      path,
      `${type} requires persisted Event endpoints`
    );
  }
}

function relationEndpointEventInWorld(
  reference: CanonicalEventReference,
  worldId: string,
  events: ReadonlyMap<string, PublicEvent>,
  timeSystems: ReadonlyMap<string, PublicTimeSystem>,
  path: string
): PublicEvent | null {
  if (reference.kind === "event") {
    const event = events.get(reference.event_id);
    if (!event)
      fail(
        "dangling_reference",
        path,
        "Relation Event endpoint does not exist",
        [reference.event_id]
      );
    if (event.world_id !== worldId)
      fail(
        "world_scope_mismatch",
        path,
        "Relation endpoint is outside its World",
        [event.id]
      );
    return event;
  }
  const timeSystem = timeSystems.get(reference.time_system_ref.time_system_id);
  if (!timeSystem)
    fail(
      "dangling_reference",
      path,
      "Time Event references an unknown Time System",
      [reference.time_system_ref.time_system_id]
    );
  if (timeSystem.world_id !== worldId)
    fail(
      "world_scope_mismatch",
      path,
      "Time Event is outside the Relation World",
      [timeSystem.id]
    );
  if (timeSystem.definition_version !== reference.definition_version)
    fail(
      "time_system_version_mismatch",
      path,
      "Time Event definition version does not match the linked Time System",
      [timeSystem.id]
    );
  return null;
}

function temporalGraphFailure(
  relations: readonly PublicRelation[],
  events: readonly PublicEvent[],
  timeSystems: readonly PublicTimeSystem[]
): void {
  const temporalRelations = relations.filter(
    (relation) => relation.source_ref && relation.target_ref
  );
  if (temporalRelations.length === 0) return;
  const registry = temporalAdapterRegistry(timeSystems);
  const constraints: TemporalConstraint[] = [];
  const structuralRelations: CompositeTemporalRelation[] = [];
  for (const relation of temporalRelations) {
    const endpoints = canonicalRelationEndpoints(relation);
    if (!endpoints) continue;
    if (
      relation.type === "precedes" ||
      relation.type === "not_after" ||
      relation.type === "coincides"
    ) {
      constraints.push({
        id: relation.id,
        type: relation.type,
        source: endpoints.source,
        target: endpoints.target
      });
    }
    if (
      relation.type === "contains" ||
      relation.type === "starts" ||
      relation.type === "ends"
    ) {
      structuralRelations.push({
        id: relation.id,
        type: relation.type,
        source: endpoints.source,
        target: endpoints.target
      });
    }
  }
  const completeCompositeIds = events
    .filter(
      (event) =>
        event.kind === "composite" &&
        structuralRelations.some(
          (relation) =>
            (relation.type === "starts" || relation.type === "ends") &&
            relation.target.kind === "event" &&
            relation.target.event_id === event.id
        )
    )
    .map((event) => event.id);
  const result = solveTemporalGraph(
    {
      constraints,
      structural_relations: structuralRelations,
      complete_composite_ids: completeCompositeIds
    },
    registry
  );
  if (result.valid) return;

  const relationById = new Map(
    relations.map((relation) => [relation.id, relation])
  );
  const allConstraintIds = [
    ...new Set(
      result.diagnostics.flatMap((diagnostic) => diagnostic.constraint_ids)
    )
  ].sort();
  const boundaryOrdering = result.diagnostics.some((diagnostic) => {
    const types = diagnostic.constraint_ids
      .map((id) => relationById.get(id)?.type)
      .filter(
        (type): type is "starts" | "ends" =>
          type === "starts" || type === "ends"
      );
    return types.includes("starts") && types.includes("ends");
  });
  const duplicateBoundary = completeCompositeIds.some((compositeId) =>
    (["starts", "ends"] as const).some(
      (type) =>
        structuralRelations.filter(
          (relation) =>
            relation.type === type &&
            relation.target.kind === "event" &&
            relation.target.event_id === compositeId
        ).length > 1
    )
  );
  const first = result.diagnostics[0]!;
  const code = boundaryOrdering
    ? "composite_boundary_order_invalid"
    : duplicateBoundary
      ? "composite_boundary_not_unique"
      : first.code === "invalid_composite_boundary"
        ? "composite_boundary_incomplete"
        : first.code === "invalid_time_coordinate"
          ? "invalid_time_coordinate"
          : first.code === "unsupported_temporal_capability" ||
              first.code === "unknown_time_system"
            ? "time_system_capability_missing"
            : "temporal_constraint_conflict";
  const timeSystemIds = [
    ...new Set(
      allConstraintIds.flatMap((id) => {
        const endpoints = relationById.get(id)
          ? canonicalRelationEndpoints(relationById.get(id)!)
          : null;
        return endpoints
          ? [endpoints.source, endpoints.target]
              .filter(
                (
                  reference
                ): reference is Extract<
                  CanonicalEventReference,
                  { readonly kind: "time_event" }
                > => reference.kind === "time_event"
              )
              .map((reference) => reference.time_system_ref.time_system_id)
          : [];
      })
    )
  ].sort();
  const originalCoordinates = allConstraintIds.flatMap((id) => {
    const endpoints = relationById.get(id)
      ? canonicalRelationEndpoints(relationById.get(id)!)
      : null;
    return endpoints
      ? [endpoints.source, endpoints.target]
          .filter(
            (
              reference
            ): reference is Extract<
              CanonicalEventReference,
              { readonly kind: "time_event" }
            > => reference.kind === "time_event"
          )
          .map((reference) => reference.coordinate)
      : [];
  });
  throw new ChangeSetError(
    code,
    "operations",
    first.message,
    [...new Set([...allConstraintIds, ...timeSystemIds])].sort(),
    false,
    {
      algorithm_version: result.algorithm_version,
      constraint_ids: allConstraintIds,
      event_refs: [
        ...new Set(
          result.diagnostics.flatMap((diagnostic) => diagnostic.event_refs)
        )
      ].sort(),
      ...(first.required_capability
        ? { required_capability: first.required_capability }
        : {}),
      ...(originalCoordinates.length > 0
        ? { original_coordinates: [...new Set(originalCoordinates)].sort() }
        : {})
    }
  );
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
  const eventCanonMemberships = new Map<string, Set<string>>();
  for (const event of existing.events) {
    eventCanonMemberships.set(event.id, new Set(event.canon_memberships));
  }
  for (const membership of existing.eventCanonMemberships) {
    const memberships = eventCanonMemberships.get(membership.event_id);
    if (memberships) memberships.add(membership.canon_id);
  }
  const withdrawnEventIds = new Set<string>();
  const relations = new Map(existing.relations.map((item) => [item.id, item]));
  const relationCanonMemberships = new Map<string, Set<string>>();
  for (const relation of existing.relations)
    relationCanonMemberships.set(
      relation.id,
      new Set(relation.canon_memberships ?? [])
    );
  for (const membership of existing.relationCanonMemberships ?? [])
    relationCanonMemberships
      .get(membership.relation_id)
      ?.add(membership.canon_id);
  const withdrawnRelationIds = new Set<string>();
  const narratives = new Map(
    existing.narratives.map((item) => [item.id, item])
  );
  const ids = new Set<string>([
    ...(world ? [world.id] : []),
    ...canons.keys(),
    ...timeSystems.keys(),
    ...canonTimeSystems.keys(),
    ...events.keys(),
    ...relations.keys(),
    ...narratives.keys()
  ]);
  let candidateWorld = world;

  for (const [index, operation] of operations.entries()) {
    const path = `operations.${index}`;
    if (operation.kind === "create" && ids.has(operation.entity_id)) {
      fail(
        "duplicate_entity_id",
        `${path}.entity_id`,
        "Entity ID already exists",
        [operation.entity_id]
      );
    }
    if (operation.kind === "create") ids.add(operation.entity_id);
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
        validateTimeSystemDefinition(
          value.definition,
          input.contract_version,
          `${path}.value.definition`
        );
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
        if (operation.kind === "withdraw") {
          const event = events.get(operation.value.event_id);
          if (!event) {
            fail(
              "dangling_reference",
              `${path}.value.event_id`,
              "Event withdrawal target does not exist",
              [operation.value.event_id]
            );
          }
          withdrawnEventIds.add(event.id);
          break;
        }
        const value = operation.value;
        if (value.world_id !== input.world_id)
          fail(
            "world_scope_mismatch",
            `${path}.value.world_id`,
            "Event is outside the Change Set World"
          );
        nonEmpty(value.title, `${path}.value.title`);
        events.set(operation.entity_id, {
          id: operation.entity_id,
          world_id: value.world_id,
          canon_memberships: [],
          slug: value.slug ?? null,
          kind: value.kind,
          title: value.title,
          summary: value.summary ?? null,
          roles: value.roles,
          attributes: value.attributes
        });
        eventCanonMemberships.set(operation.entity_id, new Set());
        break;
      }
      case "event_canon_membership": {
        const value = operation.value;
        const event = events.get(value.event_id);
        const canon = canons.get(value.canon_id);
        if (!event || !canon) {
          fail(
            "dangling_reference",
            path,
            "Event-Canon membership has a missing endpoint",
            [value.event_id, value.canon_id]
          );
        }
        if (canon.world_id !== input.world_id) {
          fail(
            "cross_world_canon_membership",
            path,
            "Event and Canon membership must belong to the Change Set World",
            [value.event_id, value.canon_id]
          );
        }
        const memberships = eventCanonMemberships.get(value.event_id)!;
        if (operation.kind === "add") {
          if (memberships.has(value.canon_id)) {
            fail(
              "duplicate_canon_membership",
              path,
              "Event already participates in this Canon",
              [value.event_id, value.canon_id]
            );
          }
          memberships.add(value.canon_id);
        } else {
          if (!memberships.has(value.canon_id)) {
            fail(
              "event_canon_membership_not_found",
              path,
              "Event does not participate in this Canon",
              [value.event_id, value.canon_id]
            );
          }
          memberships.delete(value.canon_id);
        }
        break;
      }
      case "relation": {
        if (operation.kind === "withdraw") {
          const relation = relations.get(operation.value.relation_id);
          if (!relation)
            fail(
              "dangling_reference",
              `${path}.value.relation_id`,
              "Relation withdrawal target does not exist",
              [operation.value.relation_id]
            );
          withdrawnRelationIds.add(relation.id);
          break;
        }
        const value = operation.value;
        if (value.world_id !== input.world_id)
          fail(
            "world_scope_mismatch",
            `${path}.value.world_id`,
            "Relation is outside the Change Set World"
          );
        const endpoints = requireRelationEndpoints(value, path);
        const source = relationEndpointEventInWorld(
          endpoints.source,
          value.world_id,
          events,
          timeSystems,
          `${path}.value.source_ref`
        );
        const target = relationEndpointEventInWorld(
          endpoints.target,
          value.world_id,
          events,
          timeSystems,
          `${path}.value.target_ref`
        );
        validateRelationEndpointKinds(value.type, source, target, path);
        if (endpointKey(endpoints.source) === endpointKey(endpoints.target))
          fail(
            "self_relation_not_allowed",
            path,
            "This Relation type does not allow a self relation",
            [endpointKey(endpoints.source)]
          );
        if (RELATION_REGISTRY[value.type].direction !== value.direction) {
          fail(
            "relation_direction_mismatch",
            `${path}.value.direction`,
            "Relation direction does not match the registry"
          );
        }
        relations.set(operation.entity_id, {
          id: operation.entity_id,
          world_id: value.world_id,
          canon_memberships: [],
          type: value.type,
          source_ref: endpoints.source,
          target_ref: endpoints.target,
          direction: value.direction,
          attributes: value.attributes
        });
        relationCanonMemberships.set(operation.entity_id, new Set());
        break;
      }
      case "relation_canon_membership": {
        const value = operation.value;
        const relation = relations.get(value.relation_id);
        const canon = canons.get(value.canon_id);
        if (!relation || !canon)
          fail(
            "dangling_reference",
            path,
            "Relation-Canon membership has a missing endpoint",
            [value.relation_id, value.canon_id]
          );
        if (
          relation.world_id !== input.world_id ||
          canon.world_id !== input.world_id
        )
          fail(
            "cross_world_canon_membership",
            path,
            "Relation and Canon membership must belong to the Change Set World",
            [value.relation_id, value.canon_id]
          );
        const memberships = relationCanonMemberships.get(value.relation_id)!;
        if (operation.kind === "add") {
          if (memberships.has(value.canon_id))
            fail(
              "duplicate_canon_membership",
              path,
              "Relation already participates in this Canon",
              [value.relation_id, value.canon_id]
            );
          memberships.add(value.canon_id);
        } else {
          if (!memberships.has(value.canon_id))
            fail(
              "relation_canon_membership_not_found",
              path,
              "Relation does not participate in this Canon",
              [value.relation_id, value.canon_id]
            );
          memberships.delete(value.canon_id);
        }
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
          if (!eventCanonMemberships.get(event.id)?.has(value.canon_id))
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
  for (const [eventId, memberships] of eventCanonMemberships) {
    if (withdrawnEventIds.has(eventId)) {
      if (memberships.size > 0) {
        fail(
          "event_canon_membership_required",
          "operations",
          "Withdrawing an Event requires removing all Canon memberships in the same Change Set",
          [eventId, ...memberships]
        );
      }
    } else if (memberships.size === 0) {
      fail(
        "event_canon_membership_required",
        "operations",
        "Every active Event must participate in at least one Canon",
        [eventId]
      );
    }
  }
  for (const relation of relations.values()) {
    const endpoints = canonicalRelationEndpoints(relation);
    if (!endpoints) continue;
    const memberships = relationCanonMemberships.get(relation.id) ?? new Set();
    if (withdrawnRelationIds.has(relation.id)) {
      if (memberships.size > 0)
        fail(
          "relation_canon_membership_required",
          "operations",
          "Withdrawing a Relation requires removing all Canon memberships in the same Change Set",
          [relation.id, ...memberships]
        );
      continue;
    }
    if (memberships.size === 0)
      fail(
        "relation_canon_membership_required",
        "operations",
        "Every active Relation must participate in at least one Canon",
        [relation.id]
      );
    for (const reference of [endpoints.source, endpoints.target])
      if (
        reference.kind === "event" &&
        withdrawnEventIds.has(reference.event_id)
      )
        fail(
          "dependent_content_active",
          `relations.${relation.id}`,
          "Active Relation cannot retain a withdrawn Event endpoint",
          [relation.id, reference.event_id]
        );
    for (const canonId of memberships) {
      const source = validateRelationReference(
        endpoints.source,
        canonId,
        events,
        eventCanonMemberships,
        timeSystems,
        canonTimeSystems.values(),
        `relations.${relation.id}.source_ref`,
        relation.id
      );
      const target = validateRelationReference(
        endpoints.target,
        canonId,
        events,
        eventCanonMemberships,
        timeSystems,
        canonTimeSystems.values(),
        `relations.${relation.id}.target_ref`,
        relation.id
      );
      if (
        relation.type === "contains" &&
        source &&
        target &&
        wouldCreateContainmentCycle(
          [...relations.values()].filter(
            (candidate) =>
              candidate.id !== relation.id &&
              relationCanonMemberships.get(candidate.id)?.has(canonId)
          ),
          source.id,
          target.id
        )
      )
        fail(
          "containment_cycle",
          `relations.${relation.id}`,
          "contains Relation would create a cycle",
          [source.id, target.id]
        );
    }
  }
  for (const narrative of narratives.values()) {
    if (narrative.scope_type !== "event") continue;
    const event = events.get(narrative.scope_id);
    if (
      !event ||
      !eventCanonMemberships.get(event.id)?.has(narrative.canon_id)
    ) {
      fail(
        "cross_canon_narrative",
        `narratives.${narrative.id}.scope_id`,
        "Narrative Event scope must remain a member of its Canon",
        [narrative.id, narrative.scope_id, narrative.canon_id]
      );
    }
  }
  const activeEvents = [...events.values()].filter(
    (event) => !withdrawnEventIds.has(event.id)
  );
  for (const canon of canons.values())
    temporalGraphFailure(
      [...relations.values()].filter(
        (relation) =>
          !withdrawnRelationIds.has(relation.id) &&
          relationCanonMemberships.get(relation.id)?.has(canon.id)
      ),
      activeEvents.filter((event) =>
        eventCanonMemberships.get(event.id)?.has(canon.id)
      ),
      [...timeSystems.values()]
    );
  return [];
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
