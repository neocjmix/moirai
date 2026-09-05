export const TEMPORAL_SOLVER_VERSION = "event-relational-time/1";

export type TemporalCapability =
  | "canonicalize"
  | "equality"
  | "compare"
  | "boundary"
  | "difference"
  | "conversion";

export type TemporalComparison = -1 | 0 | 1;

export interface TemporalAdapter {
  readonly timeSystemId: string;
  readonly definitionVersion: string;
  readonly capabilities: ReadonlySet<TemporalCapability>;
  canonicalize(coordinate: string): string;
  equals(left: string, right: string): boolean;
  compare?(left: string, right: string): TemporalComparison;
  nextBoundary?(coordinate: string, granularity: string): string;
  difference?(start: string, end: string): TemporalDifference;
}

export interface TemporalDifference {
  readonly value: string;
  readonly unit: string;
}

export interface TimeEventReferenceInput {
  readonly kind: "time_event";
  readonly time_system_ref: { readonly time_system_id: string };
  readonly definition_version: string;
  readonly coordinate: string;
}

export interface ResolvedTimeEventReference extends TimeEventReferenceInput {
  readonly id: string;
  readonly persisted: false;
}

export type PersistedEventReference = {
  readonly kind: "event";
  readonly event_id: string;
};

export type TemporalEventReference =
  PersistedEventReference | TimeEventReferenceInput;

export type TemporalRelationType = "precedes" | "not_after" | "coincides";

export interface TemporalConstraint {
  readonly id: string;
  readonly type: TemporalRelationType;
  readonly source: TemporalEventReference;
  readonly target: TemporalEventReference;
}

export interface TemporalDiagnostic {
  readonly code:
    | "temporal_contradiction"
    | "invalid_composite_boundary"
    | "invalid_time_coordinate"
    | "unsupported_temporal_capability"
    | "unknown_time_system";
  readonly message: string;
  readonly constraint_ids: readonly string[];
  readonly event_refs: readonly string[];
  readonly required_capability?: TemporalCapability;
  readonly algorithm_version: string;
}

export interface TemporalBound {
  readonly time_event: ResolvedTimeEventReference;
  readonly inclusive: boolean;
  readonly constraint_ids: readonly string[];
}

export type TemporalProjection =
  | {
      readonly event_id: string;
      readonly kind: "exact";
      readonly time_event: ResolvedTimeEventReference;
      readonly source_constraint_ids: readonly string[];
      readonly algorithm_version: string;
    }
  | {
      readonly event_id: string;
      readonly kind: "bounded";
      readonly lower: TemporalBound | null;
      readonly upper: TemporalBound | null;
      readonly source_constraint_ids: readonly string[];
      readonly algorithm_version: string;
    }
  | {
      readonly event_id: string;
      readonly kind: "relative-only";
      readonly source_constraint_ids: readonly string[];
      readonly algorithm_version: string;
    }
  | {
      readonly event_id: string;
      readonly kind: "unresolved";
      readonly reason: string;
      readonly source_constraint_ids: readonly string[];
      readonly algorithm_version: string;
    };

export interface TemporalSolveResult {
  readonly valid: boolean;
  readonly normalized_constraints: readonly TemporalConstraint[];
  readonly virtual_time_events: readonly ResolvedTimeEventReference[];
  readonly projections: readonly TemporalProjection[];
  readonly diagnostics: readonly TemporalDiagnostic[];
  readonly algorithm_version: string;
}

export interface CompositeTemporalRelation {
  readonly id: string;
  readonly type: "contains" | "starts" | "ends";
  readonly source: TemporalEventReference;
  readonly target: TemporalEventReference;
}

export function validateCompleteCompositeBoundaries(
  compositeEventIds: readonly string[],
  relations: readonly CompositeTemporalRelation[]
): readonly TemporalDiagnostic[] {
  const diagnostics: TemporalDiagnostic[] = [];
  for (const compositeEventId of unique(compositeEventIds)) {
    const boundaryRelations = (type: "starts" | "ends") =>
      relations.filter(
        (relation) =>
          relation.type === type &&
          relation.target.kind === "event" &&
          relation.target.event_id === compositeEventId
      );
    const starts = boundaryRelations("starts");
    const ends = boundaryRelations("ends");
    for (const [name, boundaries] of [
      ["start", starts],
      ["end", ends]
    ] as const) {
      if (boundaries.length !== 1) {
        diagnostics.push({
          code: "invalid_composite_boundary",
          message: `Complete Composite Event must have exactly one ${name} boundary`,
          constraint_ids: boundaries.map((relation) => relation.id).sort(),
          event_refs: unique([
            compositeEventId,
            ...boundaries.map((relation) =>
              eventReferenceLabel(relation.source)
            )
          ]),
          algorithm_version: TEMPORAL_SOLVER_VERSION
        });
        continue;
      }
      const boundary = boundaries[0]!;
      const contained = relations.some(
        (relation) =>
          relation.type === "contains" &&
          relation.source.kind === "event" &&
          relation.source.event_id === compositeEventId &&
          eventReferenceKey(relation.target) ===
            eventReferenceKey(boundary.source)
      );
      if (!contained) {
        diagnostics.push({
          code: "invalid_composite_boundary",
          message: `Composite Event ${name} boundary must also be contained by the Composite Event`,
          constraint_ids: [boundary.id],
          event_refs: [compositeEventId, eventReferenceLabel(boundary.source)],
          algorithm_version: TEMPORAL_SOLVER_VERSION
        });
      }
    }
  }
  return diagnostics;
}

function strictEncodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function timeEventId(
  timeSystemId: string,
  definitionVersion: string,
  canonicalCoordinate: string
): string {
  return `time-event://${strictEncodeSegment(timeSystemId)}/${strictEncodeSegment(definitionVersion)}/${strictEncodeSegment(canonicalCoordinate)}`;
}

function adapterKey(timeSystemId: string, definitionVersion: string): string {
  return `${timeSystemId}\u0000${definitionVersion}`;
}

export class TemporalAdapterRegistry {
  readonly #adapters = new Map<string, TemporalAdapter>();

  constructor(adapters: readonly TemporalAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: TemporalAdapter): void {
    this.#adapters.set(
      adapterKey(adapter.timeSystemId, adapter.definitionVersion),
      adapter
    );
  }

  get(timeSystemId: string, definitionVersion: string): TemporalAdapter | null {
    return (
      this.#adapters.get(adapterKey(timeSystemId, definitionVersion)) ?? null
    );
  }

  require(timeSystemId: string, definitionVersion: string): TemporalAdapter {
    const adapter = this.get(timeSystemId, definitionVersion);
    if (!adapter) {
      throw new Error(
        `Unknown Time System adapter ${timeSystemId}@${definitionVersion}`
      );
    }
    return adapter;
  }
}

export function resolveTimeEvent(
  input: TimeEventReferenceInput,
  registry: TemporalAdapterRegistry
): ResolvedTimeEventReference {
  const adapter = registry.require(
    input.time_system_ref.time_system_id,
    input.definition_version
  );
  const coordinate = adapter.canonicalize(input.coordinate);
  return {
    kind: "time_event",
    time_system_ref: {
      time_system_id: input.time_system_ref.time_system_id
    },
    definition_version: input.definition_version,
    coordinate,
    id: timeEventId(
      input.time_system_ref.time_system_id,
      input.definition_version,
      coordinate
    ),
    persisted: false
  };
}

const GREGORIAN_COORDINATE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{12})Z$/;
const PICOSECONDS_PER_SECOND = 1_000_000_000_000n;
const SECONDS_PER_DAY = 86_400n;

interface GregorianParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fraction: bigint;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const values = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  return values[month - 1] ?? 0;
}

function parseGregorian(coordinate: string): GregorianParts {
  const match = GREGORIAN_COORDINATE.exec(coordinate);
  if (!match) {
    throw new Error(
      "Coordinate must be YYYY-MM-DDTHH:mm:ss.ffffffffffffZ with exactly 12 fractional digits"
    );
  }
  const values = match.slice(1, 7).map(Number);
  const [year, month, day, hour, minute, second] = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(
      "Coordinate is not a valid proleptic Gregorian UTC instant"
    );
  }
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction: BigInt(match[7]!)
  };
}

function formatGregorian(parts: GregorianParts): string {
  const pad = (value: number, width: number): string =>
    value.toString().padStart(width, "0");
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}T${pad(parts.hour, 2)}:${pad(parts.minute, 2)}:${pad(parts.second, 2)}.${parts.fraction.toString().padStart(12, "0")}Z`;
}

function daysBeforeYear(year: number): bigint {
  const value = BigInt(year);
  return (
    365n * value +
    (value + 3n) / 4n -
    (value + 99n) / 100n +
    (value + 399n) / 400n
  );
}

function dayOrdinal(parts: GregorianParts): bigint {
  let days = daysBeforeYear(parts.year);
  for (let month = 1; month < parts.month; month += 1) {
    days += BigInt(daysInMonth(parts.year, month));
  }
  return days + BigInt(parts.day - 1);
}

function gregorianPicoseconds(parts: GregorianParts): bigint {
  const seconds =
    dayOrdinal(parts) * SECONDS_PER_DAY +
    BigInt(parts.hour * 3600 + parts.minute * 60 + parts.second);
  return seconds * PICOSECONDS_PER_SECOND + parts.fraction;
}

function compareBigInt(left: bigint, right: bigint): TemporalComparison {
  return left < right ? -1 : left > right ? 1 : 0;
}

function incrementDay(parts: GregorianParts): GregorianParts {
  const maximum = daysInMonth(parts.year, parts.month);
  if (parts.day < maximum) return { ...parts, day: parts.day + 1 };
  if (parts.month < 12) return { ...parts, month: parts.month + 1, day: 1 };
  if (parts.year === 9999)
    throw new Error("Boundary exceeds adapter year range");
  return { ...parts, year: parts.year + 1, month: 1, day: 1 };
}

function addPicoseconds(parts: GregorianParts, amount: bigint): GregorianParts {
  let fraction = parts.fraction + amount;
  let second = parts.second;
  let minute = parts.minute;
  let hour = parts.hour;
  let result = parts;
  while (fraction >= PICOSECONDS_PER_SECOND) {
    fraction -= PICOSECONDS_PER_SECOND;
    second += 1;
  }
  if (second >= 60) {
    minute += Math.floor(second / 60);
    second %= 60;
  }
  if (minute >= 60) {
    hour += Math.floor(minute / 60);
    minute %= 60;
  }
  if (hour >= 24) {
    const days = Math.floor(hour / 24);
    hour %= 24;
    for (let index = 0; index < days; index += 1) result = incrementDay(result);
  }
  return { ...result, hour, minute, second, fraction };
}

export function createGregorianUtcAdapter(
  timeSystemId = "proleptic-gregorian-utc",
  definitionVersion = "1"
): TemporalAdapter {
  const canonicalize = (coordinate: string): string =>
    formatGregorian(parseGregorian(coordinate));
  return {
    timeSystemId,
    definitionVersion,
    capabilities: new Set<TemporalCapability>([
      "canonicalize",
      "equality",
      "compare",
      "boundary",
      "difference"
    ]),
    canonicalize,
    equals: (left, right) => canonicalize(left) === canonicalize(right),
    compare: (left, right) =>
      compareBigInt(
        gregorianPicoseconds(parseGregorian(left)),
        gregorianPicoseconds(parseGregorian(right))
      ),
    nextBoundary: (coordinate, granularity) => {
      const parts = parseGregorian(coordinate);
      switch (granularity) {
        case "year":
          if (parts.year === 9999)
            throw new Error("Boundary exceeds adapter year range");
          return formatGregorian({
            year: parts.year + 1,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
            fraction: 0n
          });
        case "month": {
          const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
          if (nextYear > 9999)
            throw new Error("Boundary exceeds adapter year range");
          return formatGregorian({
            year: nextYear,
            month: parts.month === 12 ? 1 : parts.month + 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
            fraction: 0n
          });
        }
        case "day":
          return formatGregorian(
            incrementDay({
              ...parts,
              hour: 0,
              minute: 0,
              second: 0,
              fraction: 0n
            })
          );
        case "millisecond":
          return formatGregorian(addPicoseconds(parts, 1_000_000_000n));
        case "picosecond":
          return formatGregorian(addPicoseconds(parts, 1n));
        default:
          throw new Error(`Unsupported Gregorian boundary '${granularity}'`);
      }
    },
    difference: (start, end) => ({
      value: (
        gregorianPicoseconds(parseGregorian(end)) -
        gregorianPicoseconds(parseGregorian(start))
      ).toString(),
      unit: "picosecond"
    })
  };
}

interface DecimalParts {
  readonly coefficient: bigint;
  readonly scale: number;
}

const DECIMAL = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

function parseDecimal(input: string): DecimalParts {
  const match = DECIMAL.exec(input);
  if (!match) throw new Error("Coordinate must be a canonical decimal string");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const whole = match[2]!;
  const negative = match[1] === "-";
  const digits = `${whole}${fraction}`;
  const coefficient = BigInt(digits) * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

function formatDecimal(parts: DecimalParts): string {
  if (parts.coefficient === 0n) return "0";
  const negative = parts.coefficient < 0n;
  const absolute = (negative ? -parts.coefficient : parts.coefficient)
    .toString()
    .padStart(parts.scale + 1, "0");
  const value =
    parts.scale === 0
      ? absolute
      : `${absolute.slice(0, -parts.scale)}.${absolute.slice(-parts.scale)}`;
  return negative ? `-${value}` : value;
}

function alignDecimals(
  left: DecimalParts,
  right: DecimalParts
): [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * 10n ** BigInt(scale - left.scale),
    right.coefficient * 10n ** BigInt(scale - right.scale),
    scale
  ];
}

export function createContinuousScalarAdapter(options: {
  readonly timeSystemId: string;
  readonly definitionVersion: string;
  readonly unit: string;
  readonly direction?: "ascending" | "descending";
  readonly supportsDifference?: boolean;
}): TemporalAdapter {
  const direction = options.direction ?? "ascending";
  const canonicalize = (coordinate: string): string =>
    formatDecimal(parseDecimal(coordinate));
  const adapter: TemporalAdapter = {
    timeSystemId: options.timeSystemId,
    definitionVersion: options.definitionVersion,
    capabilities: new Set<TemporalCapability>([
      "canonicalize",
      "equality",
      "compare",
      ...(options.supportsDifference === false ? [] : ["difference" as const])
    ]),
    canonicalize,
    equals: (left, right) => canonicalize(left) === canonicalize(right),
    compare: (left, right) => {
      const [leftValue, rightValue] = alignDecimals(
        parseDecimal(left),
        parseDecimal(right)
      );
      const result = compareBigInt(leftValue, rightValue);
      return direction === "ascending"
        ? result
        : result === 0
          ? 0
          : result === 1
            ? -1
            : 1;
    }
  };
  if (options.supportsDifference !== false) {
    return {
      ...adapter,
      difference: (start, end) => {
        const [startValue, endValue, scale] = alignDecimals(
          parseDecimal(start),
          parseDecimal(end)
        );
        const difference =
          direction === "ascending"
            ? endValue - startValue
            : startValue - endValue;
        return {
          value: formatDecimal({ coefficient: difference, scale }),
          unit: options.unit
        };
      }
    };
  }
  return adapter;
}

export function createOpaqueCustomAdapter(options: {
  readonly timeSystemId: string;
  readonly definitionVersion: string;
  readonly canonicalPattern: RegExp;
}): TemporalAdapter {
  return {
    timeSystemId: options.timeSystemId,
    definitionVersion: options.definitionVersion,
    capabilities: new Set<TemporalCapability>(["canonicalize", "equality"]),
    canonicalize: (coordinate) => {
      options.canonicalPattern.lastIndex = 0;
      if (!options.canonicalPattern.test(coordinate))
        throw new Error(
          "Coordinate does not match the custom Time System grammar"
        );
      return coordinate;
    },
    equals(left, right) {
      return this.canonicalize(left) === this.canonicalize(right);
    }
  };
}

function eventReferenceKey(reference: TemporalEventReference): string {
  if (reference.kind === "event") return `event:${reference.event_id}`;
  return timeEventId(
    reference.time_system_ref.time_system_id,
    reference.definition_version,
    reference.coordinate
  );
}

function eventReferenceLabel(reference: TemporalEventReference): string {
  return reference.kind === "event"
    ? reference.event_id
    : timeEventId(
        reference.time_system_ref.time_system_id,
        reference.definition_version,
        reference.coordinate
      );
}

class DisjointSet {
  readonly #parent = new Map<string, string>();

  add(value: string): void {
    if (!this.#parent.has(value)) this.#parent.set(value, value);
  }

  find(value: string): string {
    this.add(value);
    const parent = this.#parent.get(value)!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.#parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.#parent.set(rightRoot, leftRoot);
  }
}

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly strict: boolean;
  readonly constraintIds: readonly string[];
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function contradiction(
  message: string,
  constraintIds: readonly string[],
  eventRefs: readonly string[]
): TemporalDiagnostic {
  return {
    code: "temporal_contradiction",
    message,
    constraint_ids: unique(constraintIds),
    event_refs: unique(eventRefs),
    algorithm_version: TEMPORAL_SOLVER_VERSION
  };
}

export function solveTemporalConstraints(
  constraints: readonly TemporalConstraint[],
  registry: TemporalAdapterRegistry
): TemporalSolveResult {
  const diagnostics: TemporalDiagnostic[] = [];
  const virtualEvents = new Map<string, ResolvedTimeEventReference>();
  const normalized: TemporalConstraint[] = [];

  const normalizeReference = (
    reference: TemporalEventReference,
    constraintId: string
  ): TemporalEventReference => {
    if (reference.kind === "event") return reference;
    const adapter = registry.get(
      reference.time_system_ref.time_system_id,
      reference.definition_version
    );
    if (!adapter) {
      diagnostics.push({
        code: "unknown_time_system",
        message: `No adapter is registered for ${reference.time_system_ref.time_system_id}@${reference.definition_version}`,
        constraint_ids: [constraintId],
        event_refs: [eventReferenceLabel(reference)],
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      return reference;
    }
    let resolved: ResolvedTimeEventReference;
    try {
      resolved = resolveTimeEvent(reference, registry);
    } catch (error) {
      diagnostics.push({
        code: "invalid_time_coordinate",
        message: `Invalid coordinate '${reference.coordinate}': ${error instanceof Error ? error.message : "adapter rejected the coordinate"}`,
        constraint_ids: [constraintId],
        event_refs: [eventReferenceLabel(reference)],
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      return reference;
    }
    virtualEvents.set(resolved.id, resolved);
    return {
      kind: "time_event",
      time_system_ref: resolved.time_system_ref,
      definition_version: resolved.definition_version,
      coordinate: resolved.coordinate
    };
  };

  for (const constraint of [...constraints].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )) {
    let source = normalizeReference(constraint.source, constraint.id);
    let target = normalizeReference(constraint.target, constraint.id);
    if (
      constraint.type === "coincides" &&
      eventReferenceKey(source) > eventReferenceKey(target)
    ) {
      [source, target] = [target, source];
    }
    normalized.push({
      ...constraint,
      source,
      target
    });
  }

  if (diagnostics.length > 0) {
    return {
      valid: false,
      normalized_constraints: normalized,
      virtual_time_events: [...virtualEvents.values()],
      projections: unique(
        normalized.flatMap((constraint) =>
          [constraint.source, constraint.target].flatMap((reference) =>
            reference.kind === "event" ? [reference.event_id] : []
          )
        )
      ).map((eventId) => ({
        event_id: eventId,
        kind: "unresolved" as const,
        reason:
          "Coordinate resolution failed; no authoritative projection is available",
        source_constraint_ids: unique(
          normalized.map((constraint) => constraint.id)
        ),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      })),
      diagnostics,
      algorithm_version: TEMPORAL_SOLVER_VERSION
    };
  }

  for (const constraint of normalized) {
    if (
      constraint.type !== "coincides" &&
      constraint.source.kind === "time_event" &&
      constraint.target.kind === "time_event" &&
      (constraint.source.time_system_ref.time_system_id !==
        constraint.target.time_system_ref.time_system_id ||
        constraint.source.definition_version !==
          constraint.target.definition_version)
    ) {
      diagnostics.push({
        code: "unsupported_temporal_capability",
        message:
          "Direct cross-system coordinate ordering requires an explicit conversion adapter",
        constraint_ids: [constraint.id],
        event_refs: [
          eventReferenceLabel(constraint.source),
          eventReferenceLabel(constraint.target)
        ],
        required_capability: "conversion",
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
    }
  }

  const equality = new DisjointSet();
  for (const constraint of normalized) {
    equality.add(eventReferenceKey(constraint.source));
    equality.add(eventReferenceKey(constraint.target));
    if (constraint.type === "coincides") {
      equality.union(
        eventReferenceKey(constraint.source),
        eventReferenceKey(constraint.target)
      );
    }
  }

  const edges: Edge[] = [];
  const equalityEvidence = (root: string): string[] =>
    normalized
      .filter(
        (item) =>
          item.type === "coincides" &&
          equality.find(eventReferenceKey(item.source)) === root
      )
      .map((item) => item.id);
  for (const constraint of normalized) {
    if (constraint.type === "coincides") continue;
    edges.push({
      from: equality.find(eventReferenceKey(constraint.source)),
      to: equality.find(eventReferenceKey(constraint.target)),
      strict: constraint.type === "precedes",
      constraintIds: unique([
        constraint.id,
        ...equalityEvidence(
          equality.find(eventReferenceKey(constraint.source))
        ),
        ...equalityEvidence(equality.find(eventReferenceKey(constraint.target)))
      ])
    });
  }

  const roots = unique(
    normalized.flatMap((constraint) => [
      equality.find(eventReferenceKey(constraint.source)),
      equality.find(eventReferenceKey(constraint.target))
    ])
  );
  const reach = new Map<string, Map<string, Edge>>();
  for (const root of roots) reach.set(root, new Map());
  for (const edge of edges) {
    const existing = reach.get(edge.from)?.get(edge.to);
    reach.get(edge.from)?.set(edge.to, {
      ...edge,
      strict: edge.strict || (existing?.strict ?? false),
      constraintIds: unique([
        ...(existing?.constraintIds ?? []),
        ...edge.constraintIds
      ])
    });
  }
  for (const middle of roots) {
    for (const from of roots) {
      const left = reach.get(from)?.get(middle);
      if (!left) continue;
      for (const to of roots) {
        const right = reach.get(middle)?.get(to);
        if (!right) continue;
        const existing = reach.get(from)?.get(to);
        const candidate: Edge = {
          from,
          to,
          strict: left.strict || right.strict,
          constraintIds: unique([...left.constraintIds, ...right.constraintIds])
        };
        if (!existing || (candidate.strict && !existing.strict)) {
          reach.get(from)?.set(to, candidate);
        }
      }
    }
  }

  const referencesByRoot = new Map<string, TemporalEventReference[]>();
  for (const constraint of normalized) {
    for (const reference of [constraint.source, constraint.target]) {
      const root = equality.find(eventReferenceKey(reference));
      const values = referencesByRoot.get(root) ?? [];
      if (
        !values.some(
          (value) => eventReferenceKey(value) === eventReferenceKey(reference)
        )
      ) {
        values.push(reference);
        referencesByRoot.set(root, values);
      }
    }
  }

  for (const [root, references] of referencesByRoot) {
    const timeReferences = references.filter(
      (reference): reference is TimeEventReferenceInput =>
        reference.kind === "time_event"
    );
    const equalityConstraintIds = normalized
      .filter(
        (constraint) =>
          constraint.type === "coincides" &&
          equality.find(eventReferenceKey(constraint.source)) === root
      )
      .map((constraint) => constraint.id);
    for (let leftIndex = 0; leftIndex < timeReferences.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < timeReferences.length;
        rightIndex += 1
      ) {
        const left = timeReferences[leftIndex]!;
        const right = timeReferences[rightIndex]!;
        const sameSystem =
          left.time_system_ref.time_system_id ===
            right.time_system_ref.time_system_id &&
          left.definition_version === right.definition_version;
        if (!sameSystem) {
          diagnostics.push({
            code: "unsupported_temporal_capability",
            message:
              "Cross-system coincidence requires an explicit conversion adapter",
            constraint_ids: unique(equalityConstraintIds),
            event_refs: [eventReferenceLabel(left), eventReferenceLabel(right)],
            required_capability: "conversion",
            algorithm_version: TEMPORAL_SOLVER_VERSION
          });
          continue;
        }
        const adapter = registry.get(
          left.time_system_ref.time_system_id,
          left.definition_version
        );
        if (adapter && !adapter.equals(left.coordinate, right.coordinate)) {
          diagnostics.push(
            contradiction(
              "Coincident Events resolve to different fixed Time Event coordinates",
              equalityConstraintIds,
              [eventReferenceLabel(left), eventReferenceLabel(right)]
            )
          );
        }
      }
    }
  }

  for (const root of roots) {
    const self = reach.get(root)?.get(root);
    if (self?.strict) {
      diagnostics.push(
        contradiction(
          "Strict temporal ordering forms a cycle or occurs inside a coincident component",
          self.constraintIds,
          normalized
            .filter((item) => self.constraintIds.includes(item.id))
            .flatMap((item) => [
              eventReferenceLabel(item.source),
              eventReferenceLabel(item.target)
            ])
        )
      );
    }
  }

  const fixed = new Map<
    string,
    {
      readonly reference: TimeEventReferenceInput;
      readonly constraintIds: string[];
    }
  >();
  for (const constraint of normalized) {
    for (const reference of [constraint.source, constraint.target]) {
      if (reference.kind !== "time_event") continue;
      if (
        !registry.get(
          reference.time_system_ref.time_system_id,
          reference.definition_version
        )
      )
        continue;
      const root = equality.find(eventReferenceKey(reference));
      const item = fixed.get(root);
      if (!item) fixed.set(root, { reference, constraintIds: [constraint.id] });
      else item.constraintIds.push(constraint.id);
    }
  }

  for (const [leftRoot, left] of fixed) {
    for (const [rightRoot, right] of fixed) {
      const path = reach.get(leftRoot)?.get(rightRoot);
      const sameComponent = leftRoot === rightRoot;
      if (!path && !sameComponent) continue;
      const leftRef = left.reference;
      const rightRef = right.reference;
      const sameSystem =
        leftRef.time_system_ref.time_system_id ===
          rightRef.time_system_ref.time_system_id &&
        leftRef.definition_version === rightRef.definition_version;
      if (!sameSystem) {
        continue;
      }
      const adapter = registry.get(
        leftRef.time_system_ref.time_system_id,
        leftRef.definition_version
      );
      if (!adapter) continue;
      if (
        sameComponent &&
        !adapter.equals(leftRef.coordinate, rightRef.coordinate)
      ) {
        diagnostics.push(
          contradiction(
            "Coincident Events resolve to different fixed Time Event coordinates",
            unique([...left.constraintIds, ...right.constraintIds]),
            [eventReferenceLabel(leftRef), eventReferenceLabel(rightRef)]
          )
        );
        continue;
      }
      if (!path) continue;
      if (!adapter.compare) {
        if (path) {
          diagnostics.push({
            code: "unsupported_temporal_capability",
            message: "This Time System cannot compare coordinates",
            constraint_ids: unique([
              ...(path?.constraintIds ?? []),
              ...left.constraintIds,
              ...right.constraintIds
            ]),
            event_refs: [
              eventReferenceLabel(leftRef),
              eventReferenceLabel(rightRef)
            ],
            required_capability: "compare",
            algorithm_version: TEMPORAL_SOLVER_VERSION
          });
        }
        continue;
      }
      const comparison = adapter.compare(
        leftRef.coordinate,
        rightRef.coordinate
      );
      const violatesOrder = comparison > 0 || (comparison === 0 && path.strict);
      if (violatesOrder) {
        diagnostics.push(
          contradiction(
            "Authored temporal constraints conflict with fixed Time Event coordinates",
            unique([
              ...(path?.constraintIds ?? []),
              ...left.constraintIds,
              ...right.constraintIds
            ]),
            [eventReferenceLabel(leftRef), eventReferenceLabel(rightRef)]
          )
        );
      }
    }
  }

  const projections: TemporalProjection[] = [];
  const eventIds = unique(
    normalized.flatMap((constraint) =>
      [constraint.source, constraint.target]
        .filter(
          (reference): reference is PersistedEventReference =>
            reference.kind === "event"
        )
        .map((reference) => reference.event_id)
    )
  );
  const relationIdsForEvent = (eventId: string): string[] =>
    unique(
      normalized
        .filter(
          (constraint) =>
            (constraint.source.kind === "event" &&
              constraint.source.event_id === eventId) ||
            (constraint.target.kind === "event" &&
              constraint.target.event_id === eventId)
        )
        .map((constraint) => constraint.id)
    );

  for (const eventId of eventIds) {
    const eventRoot = equality.find(`event:${eventId}`);
    const coincidentTime = (referencesByRoot.get(eventRoot) ?? []).find(
      (reference): reference is TimeEventReferenceInput =>
        reference.kind === "time_event"
    );
    const sourceIds = relationIdsForEvent(eventId);
    if (diagnostics.length > 0) {
      projections.push({
        event_id: eventId,
        kind: "unresolved",
        reason:
          "The constraint set has validation diagnostics; no authoritative projection is available",
        source_constraint_ids: unique([
          ...sourceIds,
          ...diagnostics.flatMap((item) => item.constraint_ids)
        ]),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      continue;
    }
    const hasUnknownTimeSystem = normalized.some(
      (constraint) =>
        ((constraint.source.kind === "event" &&
          constraint.source.event_id === eventId) ||
          (constraint.target.kind === "event" &&
            constraint.target.event_id === eventId)) &&
        [constraint.source, constraint.target].some(
          (reference) =>
            reference.kind === "time_event" &&
            !registry.get(
              reference.time_system_ref.time_system_id,
              reference.definition_version
            )
        )
    );
    if (hasUnknownTimeSystem) {
      projections.push({
        event_id: eventId,
        kind: "unresolved",
        reason: "A source constraint uses an unknown Time System adapter",
        source_constraint_ids: unique([
          ...sourceIds,
          ...equalityEvidence(eventRoot)
        ]),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      continue;
    }
    if (coincidentTime) {
      const adapter = registry.get(
        coincidentTime.time_system_ref.time_system_id,
        coincidentTime.definition_version
      );
      if (!adapter) {
        projections.push({
          event_id: eventId,
          kind: "unresolved",
          reason: "The exact Time Event uses an unknown Time System adapter",
          source_constraint_ids: sourceIds,
          algorithm_version: TEMPORAL_SOLVER_VERSION
        });
        continue;
      }
      projections.push({
        event_id: eventId,
        kind: "exact",
        time_event: resolveTimeEvent(coincidentTime, registry),
        source_constraint_ids: unique([
          ...sourceIds,
          ...equalityEvidence(eventRoot)
        ]),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      continue;
    }

    const lowerCandidates: TemporalBound[] = [];
    const upperCandidates: TemporalBound[] = [];
    for (const [root, item] of fixed) {
      if (root === eventRoot) continue;
      const fromFixed = reach.get(root)?.get(eventRoot);
      if (fromFixed) {
        lowerCandidates.push({
          time_event: resolveTimeEvent(item.reference, registry),
          inclusive: !fromFixed.strict,
          constraint_ids: fromFixed.constraintIds
        });
      }
      const toFixed = reach.get(eventRoot)?.get(root);
      if (toFixed) {
        upperCandidates.push({
          time_event: resolveTimeEvent(item.reference, registry),
          inclusive: !toFixed.strict,
          constraint_ids: toFixed.constraintIds
        });
      }
    }
    const comparableBest = (
      candidates: TemporalBound[],
      chooseLater: boolean
    ): TemporalBound | null => {
      let best: TemporalBound | null = null;
      for (const candidate of candidates) {
        if (!best) {
          best = candidate;
          continue;
        }
        const left = best.time_event;
        const right = candidate.time_event;
        if (
          left.time_system_ref.time_system_id !==
            right.time_system_ref.time_system_id ||
          left.definition_version !== right.definition_version
        )
          continue;
        const adapter = registry.get(
          left.time_system_ref.time_system_id,
          left.definition_version
        );
        const comparison = adapter?.compare?.(
          left.coordinate,
          right.coordinate
        );
        if (
          comparison !== undefined &&
          ((chooseLater ? comparison < 0 : comparison > 0) ||
            (comparison === 0 && best.inclusive && !candidate.inclusive))
        ) {
          best = candidate;
        }
      }
      return best;
    };
    const candidates = [...lowerCandidates, ...upperCandidates];
    const systems = new Set(
      candidates.map((bound) =>
        adapterKey(
          bound.time_event.time_system_ref.time_system_id,
          bound.time_event.definition_version
        )
      )
    );
    const cannotCompare = candidates.some(
      (bound) =>
        !registry.get(
          bound.time_event.time_system_ref.time_system_id,
          bound.time_event.definition_version
        )?.compare
    );
    if (systems.size > 1 || cannotCompare) {
      projections.push({
        event_id: eventId,
        kind: "unresolved",
        reason:
          systems.size > 1
            ? "Bounds belong to different Time Systems; no common coordinate is inferred"
            : "The Time System does not support bound comparison",
        source_constraint_ids: unique(
          candidates.flatMap((bound) => bound.constraint_ids)
        ),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
      continue;
    }
    const lower = comparableBest(lowerCandidates, true);
    const upper = comparableBest(upperCandidates, false);
    if (lower || upper) {
      projections.push({
        event_id: eventId,
        kind: "bounded",
        lower,
        upper,
        source_constraint_ids: unique([
          ...(lower?.constraint_ids ?? []),
          ...(upper?.constraint_ids ?? [])
        ]),
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
    } else {
      projections.push({
        event_id: eventId,
        kind: "relative-only",
        source_constraint_ids: sourceIds,
        algorithm_version: TEMPORAL_SOLVER_VERSION
      });
    }
  }

  return {
    valid: diagnostics.length === 0,
    normalized_constraints: normalized,
    virtual_time_events: [...virtualEvents.values()].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    projections,
    diagnostics,
    algorithm_version: TEMPORAL_SOLVER_VERSION
  };
}

export function calculateTemporalDifference(
  start: TimeEventReferenceInput,
  end: TimeEventReferenceInput,
  registry: TemporalAdapterRegistry
): TemporalDifference | TemporalDiagnostic {
  const sameSystem =
    start.time_system_ref.time_system_id ===
      end.time_system_ref.time_system_id &&
    start.definition_version === end.definition_version;
  if (!sameSystem) {
    return {
      code: "unsupported_temporal_capability",
      message: "Cross-system duration requires an explicit conversion adapter",
      constraint_ids: [],
      event_refs: [eventReferenceLabel(start), eventReferenceLabel(end)],
      required_capability: "conversion",
      algorithm_version: TEMPORAL_SOLVER_VERSION
    };
  }
  const adapter = registry.get(
    start.time_system_ref.time_system_id,
    start.definition_version
  );
  if (!adapter?.difference) {
    return {
      code: "unsupported_temporal_capability",
      message: "This Time System cannot calculate coordinate differences",
      constraint_ids: [],
      event_refs: [eventReferenceLabel(start), eventReferenceLabel(end)],
      required_capability: "difference",
      algorithm_version: TEMPORAL_SOLVER_VERSION
    };
  }
  return adapter.difference(
    adapter.canonicalize(start.coordinate),
    adapter.canonicalize(end.coordinate)
  );
}
