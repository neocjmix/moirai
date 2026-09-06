import type {
  CanonicalEventReference,
  PublicRelation,
  PublicTimeSystem,
  ResolvedEventReference
} from "@moirai/contracts";

import {
  createContinuousScalarAdapter,
  createGregorianUtcAdapter,
  createIntegerOrdinalAdapter,
  createOpaqueCustomAdapter,
  resolveTimeEvent,
  type TemporalAdapter,
  TemporalAdapterRegistry
} from "./temporal.js";

export interface CanonicalRelationEndpoints {
  readonly source: CanonicalEventReference;
  readonly target: CanonicalEventReference;
}

type RelationEndpointShape = Pick<
  PublicRelation,
  "source_ref" | "target_ref" | "source_event_id" | "target_event_id"
>;

/**
 * Return the authoritative tagged endpoints. Old rows are adapted at the
 * boundary so callers never have to invent a virtual Event row.
 */
export function canonicalRelationEndpoints(
  relation: RelationEndpointShape
): CanonicalRelationEndpoints | null {
  if (relation.source_ref && relation.target_ref) {
    return { source: relation.source_ref, target: relation.target_ref };
  }
  if (relation.source_event_id && relation.target_event_id) {
    return {
      source: { kind: "event", event_id: relation.source_event_id },
      target: { kind: "event", event_id: relation.target_event_id }
    };
  }
  return null;
}

export function endpointEventId(
  reference: CanonicalEventReference
): string | null {
  return reference.kind === "event" ? reference.event_id : null;
}

export function endpointKey(reference: CanonicalEventReference): string {
  return reference.kind === "event"
    ? `event:${reference.event_id}`
    : `time:${reference.time_system_ref.time_system_id}:${reference.definition_version}:${reference.coordinate}`;
}

/** Adds the read-only identity fields only at an API/read boundary. */
export function resolveEventReference(
  reference: CanonicalEventReference,
  registry: TemporalAdapterRegistry
): ResolvedEventReference {
  return reference.kind === "event"
    ? reference
    : resolveTimeEvent(reference, registry);
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function opaqueCycleAdapter(timeSystem: PublicTimeSystem): TemporalAdapter {
  const coordinate = /^cycle:[0-9]{6}$/;
  const canonicalize = (value: string): string => {
    if (!coordinate.test(value)) {
      throw new Error("Coordinate must match cycle:000001");
    }
    return value;
  };
  const supportsCompare = strings(timeSystem.definition.capabilities).includes(
    "compare"
  );
  const adapter: TemporalAdapter = {
    timeSystemId: timeSystem.id,
    definitionVersion: timeSystem.definition_version,
    capabilities: new Set(
      supportsCompare
        ? (["canonicalize", "equality", "compare"] as const)
        : (["canonicalize", "equality"] as const)
    ),
    canonicalize,
    equals: (left, right) => canonicalize(left) === canonicalize(right)
  };
  if (!supportsCompare) return adapter;
  return {
    ...adapter,
    compare: (left, right) => {
      const leftValue = BigInt(canonicalize(left).slice("cycle:".length));
      const rightValue = BigInt(canonicalize(right).slice("cycle:".length));
      return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    }
  };
}

/**
 * Build only adapters whose declared codec has a safe, versioned meaning.
 * Unknown custom systems remain storable, but a Time Event cannot silently
 * acquire comparison semantics without an adapter.
 */
export function temporalAdapterForTimeSystem(
  timeSystem: PublicTimeSystem
): TemporalAdapter | null {
  const definition = timeSystem.definition;
  const codec = string(definition.coordinate_codec);
  if (
    codec === "yyyy-iso-fields-fraction12-z-v1" &&
    timeSystem.kind === "calendar" &&
    definition.calendar === "proleptic-gregorian" &&
    definition.timezone === "UTC" &&
    definition.fractional_digits === 12 &&
    definition.leap_second_policy === "reject" &&
    definition.interval_policy === "half-open"
  ) {
    return createGregorianUtcAdapter(
      timeSystem.id,
      timeSystem.definition_version
    );
  }
  if (definition.coordinate === "integer") {
    return createIntegerOrdinalAdapter({
      timeSystemId: timeSystem.id,
      definitionVersion: timeSystem.definition_version,
      unit: string(definition.unit) ?? "ordinal"
    });
  }
  if (codec === "continuous-decimal-v1") {
    const unit = string(definition.unit);
    const direction = definition.direction;
    if (!unit || (direction !== "ascending" && direction !== "descending")) {
      return null;
    }
    return createContinuousScalarAdapter({
      timeSystemId: timeSystem.id,
      definitionVersion: timeSystem.definition_version,
      unit,
      direction,
      supportsDifference: strings(definition.capabilities).includes(
        "difference"
      )
    });
  }
  if (codec === "opaque-cycle-v1") return opaqueCycleAdapter(timeSystem);
  if (codec === "opaque-token-v1") {
    return createOpaqueCustomAdapter({
      timeSystemId: timeSystem.id,
      definitionVersion: timeSystem.definition_version,
      canonicalPattern: /^[A-Za-z][A-Za-z0-9._:/-]{0,255}$/
    });
  }
  return null;
}

export function temporalAdapterRegistry(
  timeSystems: Iterable<PublicTimeSystem>
): TemporalAdapterRegistry {
  return new TemporalAdapterRegistry(
    [...timeSystems].flatMap((timeSystem) => {
      const adapter = temporalAdapterForTimeSystem(timeSystem);
      return adapter ? [adapter] : [];
    })
  );
}
