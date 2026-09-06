import {
  CONTRACT_VERSION,
  TEMPORAL_CONTRACT_VERSION,
  TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  type CanonicalEventReference,
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
export * from "./temporal-legacy.js";
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
  if (
    input.contract_version !== CONTRACT_VERSION &&
    input.contract_version !== TEMPORAL_CONTRACT_VERSION
  ) {
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
    input.contract_version === TEMPORAL_CONTRACT_VERSION &&
    input.world_id !== TEMPORAL_EXPRESSIVENESS_WORLD_ID
  ) {
    fail(
      "temporal_write_not_enabled",
      "world_id",
      "TS-010 canonical write is enabled only for the approved Temporal Expressiveness Observatory World",
      [input.world_id, TEMPORAL_EXPRESSIVENESS_WORLD_ID]
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
    if (
      input.contract_version === TEMPORAL_CONTRACT_VERSION &&
      operation.entity_type === "event_temporal_placement"
    ) {
      fail(
        "legacy_placement_not_allowed",
        path,
        "Temporal Change Plans express time through Event Relations; Placement is not a second canonical write path"
      );
    }
    if (operation.entity_type === "relation") {
      const value = operation.value;
      if (
        input.contract_version !== TEMPORAL_CONTRACT_VERSION &&
        (value.type === "not_after" || value.type === "coincides")
      ) {
        fail(
          "relation_endpoint_contract_mismatch",
          `${path}.value.type`,
          "This Relation requires temporal contract version 2"
        );
      }
      const hasLegacyEndpoints =
        value.source_event_id !== undefined ||
        value.target_event_id !== undefined;
      const hasTemporalEndpoints =
        value.source_ref !== undefined || value.target_ref !== undefined;
      const expectsTemporal =
        input.contract_version === TEMPORAL_CONTRACT_VERSION;
      if (
        (expectsTemporal &&
          (!value.source_ref || !value.target_ref || hasLegacyEndpoints)) ||
        (!expectsTemporal &&
          (!value.source_event_id ||
            !value.target_event_id ||
            hasTemporalEndpoints))
      ) {
        fail(
          "relation_endpoint_contract_mismatch",
          `${path}.value`,
          expectsTemporal
            ? "Temporal Change Plans require source_ref and target_ref only"
            : "Legacy Change Plans require source_event_id and target_event_id only"
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
  input: CreateChangeSet,
  value: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
  path: string
): Record<string, unknown> {
  if (input.contract_version === TEMPORAL_CONTRACT_VERSION) {
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
    if (
      value.type === "coincides" &&
      endpointKey(source) > endpointKey(target)
    ) {
      [source, target] = [target, source];
    }
    return {
      ...value,
      canon_id: resolveReferenceId(value.canon_id, mapping, `${path}.canon_id`),
      source_ref: source,
      target_ref: target
    };
  }
  const sourceEventId = resolveReferenceId(
    value.source_event_id,
    mapping,
    `${path}.source_event_id`
  );
  const targetEventId = resolveReferenceId(
    value.target_event_id,
    mapping,
    `${path}.target_event_id`
  );
  let source = { kind: "event" as const, event_id: sourceEventId };
  let target = { kind: "event" as const, event_id: targetEventId };
  if (value.type === "coincides" && endpointKey(source) > endpointKey(target)) {
    [source, target] = [target, source];
  }
  return {
    ...value,
    canon_id: resolveReferenceId(value.canon_id, mapping, `${path}.canon_id`),
    source_event_id: source.event_id,
    target_event_id: target.event_id,
    source_ref: source,
    target_ref: target
  };
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
      value:
        operation.entity_type === "relation"
          ? resolveRelationValue(
              input,
              operation.value as unknown as Record<string, unknown>,
              mapping,
              `operations.${index}.value`
            )
          : resolveValue(operation.value, mapping, `operations.${index}.value`)
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

function validateTimeSystemDefinition(
  definition: Readonly<Record<string, unknown>>,
  contractVersion: CreateChangeSet["contract_version"],
  path: string
): void {
  if (contractVersion === CONTRACT_VERSION) {
    if (definition.coordinate !== "integer") {
      fail(
        "unsupported_time_definition",
        `${path}.coordinate`,
        "Legacy Change Plans require the versioned integer coordinate adapter"
      );
    }
    return;
  }
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
    if (event.canon_id !== canonId) {
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
    if (!sourceEvent) {
      fail(
        "relation_endpoint_kind_invalid",
        path,
        "contains requires a persisted Event as its source"
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
        const endpoints = requireRelationEndpoints(value, path);
        const source = validateRelationReference(
          endpoints.source,
          value.canon_id,
          events,
          timeSystems,
          canonTimeSystems.values(),
          input.contract_version === TEMPORAL_CONTRACT_VERSION
            ? `${path}.value.source_ref`
            : path,
          operation.entity_id
        );
        const target = validateRelationReference(
          endpoints.target,
          value.canon_id,
          events,
          timeSystems,
          canonTimeSystems.values(),
          input.contract_version === TEMPORAL_CONTRACT_VERSION
            ? `${path}.value.target_ref`
            : path,
          operation.entity_id
        );
        if (input.contract_version === TEMPORAL_CONTRACT_VERSION)
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
        if (
          value.type === "contains" &&
          source &&
          target &&
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
          canon_id: value.canon_id,
          type: value.type,
          source_ref: endpoints.source,
          target_ref: endpoints.target,
          source_event_id: endpointEventId(endpoints.source),
          target_event_id: endpointEventId(endpoints.target),
          direction: value.direction,
          attributes: value.attributes
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
  if (input.contract_version === TEMPORAL_CONTRACT_VERSION) {
    temporalGraphFailure(
      [...relations.values()],
      [...events.values()],
      [...timeSystems.values()]
    );
  }
  const warnings: ValidationIssue[] = [];
  for (const event of events.values()) {
    if (event.kind === "composite" && event.roles.includes("process")) {
      const hasChildren = [...relations.values()].some((relation) => {
        const endpoints = canonicalRelationEndpoints(relation);
        return (
          relation.type === "contains" &&
          endpoints?.source.kind === "event" &&
          endpoints.source.event_id === event.id
        );
      });
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
