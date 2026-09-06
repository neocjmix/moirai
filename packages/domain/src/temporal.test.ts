import { describe, expect, it } from "vitest";

import {
  TEMPORAL_SOLVER_VERSION,
  TemporalAdapterRegistry,
  calculateTemporalDifference,
  createContinuousScalarAdapter,
  createGregorianUtcAdapter,
  createOpaqueCustomAdapter,
  resolveTimeEvent,
  solveTemporalConstraints,
  timeEventId,
  validateCompleteCompositeBoundaries,
  type TemporalConstraint,
  type TimeEventReferenceInput
} from "./temporal.js";

const GREGORIAN_ID = "019f3b00-0000-7000-8000-000000000003";
const gregorian = createGregorianUtcAdapter(GREGORIAN_ID, "1");
const registry = new TemporalAdapterRegistry([gregorian]);

const coordinates = {
  yearStart: "0220-01-01T00:00:00.000000000000Z",
  yearEnd: "0221-01-01T00:00:00.000000000000Z",
  monthStart: "1969-07-01T00:00:00.000000000000Z",
  monthEnd: "1969-08-01T00:00:00.000000000000Z",
  dayStart: "1969-07-20T00:00:00.000000000000Z",
  dayEnd: "1969-07-21T00:00:00.000000000000Z",
  millisecondStart: "2026-09-05T08:13:21.123000000000Z",
  millisecondEnd: "2026-09-05T08:13:21.124000000000Z",
  picosecondStart: "2026-09-05T08:13:21.123456789012Z",
  picosecondEnd: "2026-09-05T08:13:21.123456789013Z",
  windowStart: "2026-09-05T08:13:22.000000000000Z",
  windowEnd: "2026-09-05T08:13:24.000000000000Z"
} as const;

function time(
  coordinate: string,
  systemId = GREGORIAN_ID
): TimeEventReferenceInput {
  return {
    kind: "time_event",
    time_system_ref: { time_system_id: systemId },
    definition_version: "1",
    coordinate
  };
}

function bounded(
  eventId: string,
  lower: string,
  upper: string
): readonly TemporalConstraint[] {
  return [
    {
      id: `${eventId}:lower`,
      type: "not_after",
      source: time(lower),
      target: { kind: "event", event_id: eventId }
    },
    {
      id: `${eventId}:upper`,
      type: "precedes",
      source: { kind: "event", event_id: eventId },
      target: time(upper)
    }
  ];
}

describe("proleptic Gregorian UTC adapter", () => {
  it("derives every accepted half-open corpus boundary without number coercion", () => {
    expect(gregorian.nextBoundary?.(coordinates.yearStart, "year")).toBe(
      coordinates.yearEnd
    );
    expect(gregorian.nextBoundary?.(coordinates.monthStart, "month")).toBe(
      coordinates.monthEnd
    );
    expect(gregorian.nextBoundary?.(coordinates.dayStart, "day")).toBe(
      coordinates.dayEnd
    );
    expect(
      gregorian.nextBoundary?.(coordinates.millisecondStart, "millisecond")
    ).toBe(coordinates.millisecondEnd);
    expect(
      gregorian.nextBoundary?.(coordinates.picosecondStart, "picosecond")
    ).toBe(coordinates.picosecondEnd);
  });

  it("preserves picoseconds and validates calendar rules", () => {
    expect(gregorian.canonicalize(coordinates.picosecondStart)).toBe(
      coordinates.picosecondStart
    );
    expect(
      gregorian.compare?.(
        coordinates.picosecondStart,
        coordinates.picosecondEnd
      )
    ).toBe(-1);
    expect(() =>
      gregorian.canonicalize("2026-09-05T08:13:21.1234567890120Z")
    ).toThrow(/12/);
    expect(() =>
      gregorian.canonicalize("2026-02-29T00:00:00.000000000000Z")
    ).toThrow(/valid/);
    expect(gregorian.canonicalize("2000-02-29T00:00:00.000000000000Z")).toBe(
      "2000-02-29T00:00:00.000000000000Z"
    );
  });

  it("is idempotent, order preserving and JSON lossless across sample coordinates", () => {
    const samples = Object.values(coordinates);
    for (const coordinate of samples) {
      const canonical = gregorian.canonicalize(coordinate);
      expect(gregorian.canonicalize(canonical)).toBe(canonical);
      expect(JSON.parse(JSON.stringify({ coordinate }))).toEqual({
        coordinate
      });
    }
    for (let index = 1; index < samples.length; index += 1) {
      const left = samples[index - 1]!;
      const right = samples[index]!;
      if (left < right) expect(gregorian.compare?.(left, right)).toBe(-1);
    }
  });

  it("checks canonicalization and ordering properties over generated picosecond samples", () => {
    for (let value = 0; value < 400; value += 1) {
      const coordinate = `2026-09-05T08:13:21.${value.toString().padStart(12, "0")}Z`;
      const next = `2026-09-05T08:13:21.${(value + 1).toString().padStart(12, "0")}Z`;
      const canonical = gregorian.canonicalize(coordinate);
      expect(gregorian.canonicalize(canonical)).toBe(canonical);
      expect(gregorian.compare?.(coordinate, next)).toBe(-1);
      expect(JSON.parse(JSON.stringify(coordinate))).toBe(coordinate);
    }
  });

  it("calculates explicit boundary duration with picosecond precision", () => {
    expect(
      calculateTemporalDifference(
        time(coordinates.windowStart),
        time(coordinates.windowEnd),
        registry
      )
    ).toEqual({ value: "2000000000000", unit: "picosecond" });
  });
});

describe("virtual Time Event resolution", () => {
  it("matches the accepted deterministic ID and remains explicitly non-persistent", () => {
    const first = resolveTimeEvent(time(coordinates.picosecondStart), registry);
    const second = resolveTimeEvent(
      time(coordinates.picosecondStart),
      registry
    );
    expect(first).toEqual(second);
    expect(first).toEqual({
      kind: "time_event",
      id: "time-event://019f3b00-0000-7000-8000-000000000003/1/2026-09-05T08%3A13%3A21.123456789012Z",
      time_system_ref: { time_system_id: GREGORIAN_ID },
      definition_version: "1",
      coordinate: coordinates.picosecondStart,
      persisted: false
    });
  });

  it("RFC 3986-encodes slashes and reserved characters inside every segment", () => {
    expect(timeEventId("system/one", "v1!", "A/B C")).toBe(
      "time-event://system%2Fone/v1%21/A%2FB%20C"
    );
  });
});

describe("event-relational constraint solver", () => {
  it("rejects malformed coordinates with original input and relation evidence", () => {
    const invalid = "2026-09-05T08:13:21.1234567890120Z";
    const result = solveTemporalConstraints(
      bounded("bad", invalid, coordinates.picosecondEnd),
      registry
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid_time_coordinate",
        constraint_ids: ["bad:lower"],
        message: expect.stringContaining(invalid)
      })
    );
    expect(result.projections[0]?.kind).toBe("unresolved");
  });

  it("does not collapse incomparable bound systems into one interval", () => {
    const other = createContinuousScalarAdapter({
      timeSystemId: "other",
      definitionVersion: "1",
      unit: "tick"
    });
    const result = solveTemporalConstraints(
      [
        {
          id: "lower",
          type: "not_after",
          source: time(coordinates.dayStart),
          target: { kind: "event", event_id: "x" }
        },
        {
          id: "upper",
          type: "precedes",
          source: { kind: "event", event_id: "x" },
          target: time("5", "other")
        }
      ],
      new TemporalAdapterRegistry([gregorian, other])
    );
    expect(result.valid).toBe(true);
    expect(result.projections[0]).toMatchObject({
      kind: "unresolved",
      source_constraint_ids: ["lower", "upper"]
    });
  });

  it("projects the accepted year, month, day, millisecond and picosecond buckets", () => {
    const cases = [
      ["te-year-220", coordinates.yearStart, coordinates.yearEnd],
      ["te-month-1969-07", coordinates.monthStart, coordinates.monthEnd],
      ["te-day-1969-07-20", coordinates.dayStart, coordinates.dayEnd],
      ["te-ms-123", coordinates.millisecondStart, coordinates.millisecondEnd],
      ["te-ps-012", coordinates.picosecondStart, coordinates.picosecondEnd]
    ] as const;
    const result = solveTemporalConstraints(
      cases.flatMap(([id, lower, upper]) => bounded(id, lower, upper)),
      registry
    );
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.algorithm_version).toBe(TEMPORAL_SOLVER_VERSION);
    for (const [id, lower, upper] of cases) {
      expect(result.projections).toContainEqual(
        expect.objectContaining({
          event_id: id,
          kind: "bounded",
          lower: expect.objectContaining({
            inclusive: true,
            time_event: expect.objectContaining({ coordinate: lower })
          }),
          upper: expect.objectContaining({
            inclusive: false,
            time_event: expect.objectContaining({ coordinate: upper })
          })
        })
      );
    }
  });

  it("distinguishes an exact coincidence from a relative-only ordering", () => {
    const result = solveTemporalConstraints(
      [
        {
          id: "exact-at-ps",
          type: "coincides",
          source: { kind: "event", event_id: "te-exact-observation" },
          target: time(coordinates.picosecondStart)
        },
        {
          id: "relative-order",
          type: "precedes",
          source: { kind: "event", event_id: "te-relative-a" },
          target: { kind: "event", event_id: "te-relative-b" }
        }
      ],
      registry
    );
    expect(result.projections).toContainEqual(
      expect.objectContaining({
        event_id: "te-exact-observation",
        kind: "exact",
        time_event: expect.objectContaining({
          coordinate: coordinates.picosecondStart,
          persisted: false
        })
      })
    );
    expect(result.projections).toContainEqual(
      expect.objectContaining({
        event_id: "te-relative-a",
        kind: "relative-only"
      })
    );
    expect(result.projections).toContainEqual(
      expect.objectContaining({
        event_id: "te-relative-b",
        kind: "relative-only"
      })
    );
  });

  it("allows non-strict equality but explains strict cycles using relation and Event IDs", () => {
    const nonStrict = solveTemporalConstraints(
      [
        {
          id: "a-not-after-b",
          type: "not_after",
          source: { kind: "event", event_id: "a" },
          target: { kind: "event", event_id: "b" }
        },
        {
          id: "b-not-after-a",
          type: "not_after",
          source: { kind: "event", event_id: "b" },
          target: { kind: "event", event_id: "a" }
        }
      ],
      registry
    );
    expect(nonStrict.valid).toBe(true);

    const strict = solveTemporalConstraints(
      [
        {
          id: "a-before-b",
          type: "precedes",
          source: { kind: "event", event_id: "a" },
          target: { kind: "event", event_id: "b" }
        },
        {
          id: "b-before-a",
          type: "precedes",
          source: { kind: "event", event_id: "b" },
          target: { kind: "event", event_id: "a" }
        }
      ],
      registry
    );
    expect(strict.valid).toBe(false);
    expect(strict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "temporal_contradiction",
        constraint_ids: ["a-before-b", "b-before-a"]
      })
    );
    expect(strict.diagnostics.flatMap((item) => item.event_refs)).toEqual(
      expect.arrayContaining(["a", "b"])
    );
  });

  it("rejects a reversed fixed boundary with the source relation IDs", () => {
    const result = solveTemporalConstraints(
      [
        {
          id: "bad-start-coordinate",
          type: "coincides",
          source: { kind: "event", event_id: "start" },
          target: time(coordinates.windowEnd)
        },
        {
          id: "bad-end-coordinate",
          type: "coincides",
          source: { kind: "event", event_id: "end" },
          target: time(coordinates.windowStart)
        },
        {
          id: "start-precedes-end",
          type: "precedes",
          source: { kind: "event", event_id: "start" },
          target: { kind: "event", event_id: "end" }
        }
      ],
      registry
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "temporal_contradiction",
        constraint_ids: expect.arrayContaining([
          "bad-start-coordinate",
          "bad-end-coordinate",
          "start-precedes-end"
        ])
      })
    );
  });

  it("accepts one same-instant coordinate and rejects conflicting coincidence", () => {
    const sameInstant = solveTemporalConstraints(
      [
        {
          id: "event-a-at-t",
          type: "coincides",
          source: { kind: "event", event_id: "event-a" },
          target: time(coordinates.picosecondStart)
        },
        {
          id: "event-b-at-t",
          type: "coincides",
          source: { kind: "event", event_id: "event-b" },
          target: time(coordinates.picosecondStart)
        },
        {
          id: "events-coincide",
          type: "coincides",
          source: { kind: "event", event_id: "event-a" },
          target: { kind: "event", event_id: "event-b" }
        }
      ],
      registry
    );
    expect(sameInstant.valid).toBe(true);

    const conflict = solveTemporalConstraints(
      [
        {
          id: "event-at-start",
          type: "coincides",
          source: { kind: "event", event_id: "event" },
          target: time(coordinates.picosecondStart)
        },
        {
          id: "event-at-end",
          type: "coincides",
          source: { kind: "event", event_id: "event" },
          target: time(coordinates.picosecondEnd)
        }
      ],
      registry
    );
    expect(conflict.valid).toBe(false);
    expect(
      conflict.projections.every((item) => item.kind === "unresolved")
    ).toBe(true);
    expect(conflict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "temporal_contradiction",
        constraint_ids: ["event-at-end", "event-at-start"]
      })
    );
  });
});

describe("Composite Event boundary validation", () => {
  it("accepts unique contained boundaries and explains duplicate starts", () => {
    const composite = { kind: "event" as const, event_id: "window" };
    const start = time(coordinates.windowStart);
    const end = time(coordinates.windowEnd);
    expect(
      validateCompleteCompositeBoundaries(
        ["window"],
        [
          {
            id: "contains-start",
            type: "contains",
            source: composite,
            target: start
          },
          {
            id: "contains-end",
            type: "contains",
            source: composite,
            target: end
          },
          {
            id: "starts-window",
            type: "starts",
            source: start,
            target: composite
          },
          { id: "ends-window", type: "ends", source: end, target: composite }
        ]
      )
    ).toEqual([]);

    const duplicate = validateCompleteCompositeBoundaries(
      ["window"],
      [
        { id: "start-one", type: "starts", source: start, target: composite },
        {
          id: "start-two",
          type: "starts",
          source: time("2026-09-05T08:13:22.500000000000Z"),
          target: composite
        },
        { id: "end-one", type: "ends", source: end, target: composite }
      ]
    );
    expect(duplicate).toContainEqual(
      expect.objectContaining({
        code: "invalid_composite_boundary",
        constraint_ids: ["start-one", "start-two"],
        event_refs: expect.arrayContaining(["window"])
      })
    );
  });
});

describe("non-Gregorian Time System conformance", () => {
  it("preserves a fictional calendar coordinate and refuses invented conversion", () => {
    const fictional = createOpaqueCustomAdapter({
      timeSystemId: "star-wars-galactic-calendar",
      definitionVersion: "1",
      canonicalPattern: /^\d+ ABY\/Cycle-\d+$/
    });
    const customRegistry = new TemporalAdapterRegistry([fictional, gregorian]);
    const coordinate = "4 ABY/Cycle-7";
    const resolved = resolveTimeEvent(
      time(coordinate, fictional.timeSystemId),
      customRegistry
    );
    expect(resolved.coordinate).toBe(coordinate);
    expect(resolved.id).toContain("4%20ABY%2FCycle-7");
    expect(
      calculateTemporalDifference(
        time(coordinate, fictional.timeSystemId),
        time(coordinates.dayStart),
        customRegistry
      )
    ).toEqual(
      expect.objectContaining({
        code: "unsupported_temporal_capability",
        required_capability: "conversion"
      })
    );
  });

  it("compares arbitrary-precision elapsed time immediately after the Big Bang", () => {
    const cosmic = createContinuousScalarAdapter({
      timeSystemId: "big-bang-elapsed-seconds",
      definitionVersion: "1",
      unit: "second"
    });
    const earlier = "0.0000000000000000000000000000000000000000001";
    const later = "0.0000000000000000000000000000000000000000002";
    expect(cosmic.canonicalize(earlier)).toBe(earlier);
    expect(cosmic.compare?.(earlier, later)).toBe(-1);
    expect(cosmic.difference?.(earlier, later)).toEqual({
      value: "0.0000000000000000000000000000000000000000001",
      unit: "second"
    });
  });

  it("orders geological before-present ranges without a Gregorian timestamp", () => {
    const geology = createContinuousScalarAdapter({
      timeSystemId: "megaannum-before-present",
      definitionVersion: "1",
      unit: "Ma",
      direction: "descending",
      supportsDifference: false
    });
    const geologicalRegistry = new TemporalAdapterRegistry([geology]);
    expect(geology.compare?.("66.1", "65.9")).toBe(-1);
    const result = solveTemporalConstraints(
      [
        ...boundedWithSystem(
          "chicxulub-impact",
          "66.05",
          "65.95",
          geology.timeSystemId
        ),
        ...boundedWithSystem(
          "non-avian-extinction",
          "66.0",
          "65.8",
          geology.timeSystemId
        ),
        {
          id: "impact-before-extinction",
          type: "precedes" as const,
          source: { kind: "event" as const, event_id: "chicxulub-impact" },
          target: { kind: "event" as const, event_id: "non-avian-extinction" }
        }
      ],
      geologicalRegistry
    );
    expect(result.valid).toBe(true);
    expect(result.projections).toContainEqual(
      expect.objectContaining({ event_id: "chicxulub-impact", kind: "bounded" })
    );
    expect(
      calculateTemporalDifference(
        time("66.05", geology.timeSystemId),
        time("65.95", geology.timeSystemId),
        geologicalRegistry
      )
    ).toEqual(
      expect.objectContaining({
        code: "unsupported_temporal_capability",
        required_capability: "difference"
      })
    );
  });

  it("keeps authored ordering between ordinary Events independent of conversion", () => {
    const result = solveTemporalConstraints(
      [
        {
          id: "cross-system-authored-fact",
          type: "precedes",
          source: { kind: "event", event_id: "fictional-event" },
          target: { kind: "event", event_id: "earth-event" }
        }
      ],
      new TemporalAdapterRegistry()
    );
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.projections.every((item) => item.kind === "relative-only")
    ).toBe(true);
  });

  it("keeps cross-system Event ordering valid even when both Events have coordinates", () => {
    const fictional = createOpaqueCustomAdapter({
      timeSystemId: "fictional-era",
      definitionVersion: "1",
      canonicalPattern: /^Era-\d+$/
    });
    const customRegistry = new TemporalAdapterRegistry([fictional, gregorian]);
    const result = solveTemporalConstraints(
      [
        {
          id: "fictional-position",
          type: "coincides",
          source: { kind: "event", event_id: "fictional-event" },
          target: time("Era-7", fictional.timeSystemId)
        },
        {
          id: "earth-position",
          type: "coincides",
          source: { kind: "event", event_id: "earth-event" },
          target: time(coordinates.dayStart)
        },
        {
          id: "authored-cross-system-order",
          type: "precedes",
          source: { kind: "event", event_id: "fictional-event" },
          target: { kind: "event", event_id: "earth-event" }
        }
      ],
      customRegistry
    );
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects cross-system coordinate equality without a conversion adapter", () => {
    const fictional = createOpaqueCustomAdapter({
      timeSystemId: "fictional-era",
      definitionVersion: "1",
      canonicalPattern: /^Era-\d+$/
    });
    const customRegistry = new TemporalAdapterRegistry([fictional, gregorian]);
    const result = solveTemporalConstraints(
      [
        {
          id: "fictional-to-observation",
          type: "coincides",
          source: { kind: "event", event_id: "observation" },
          target: time("Era-7", fictional.timeSystemId)
        },
        {
          id: "gregorian-to-observation",
          type: "coincides",
          source: { kind: "event", event_id: "observation" },
          target: time(coordinates.dayStart)
        }
      ],
      customRegistry
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "unsupported_temporal_capability",
        required_capability: "conversion",
        constraint_ids: ["fictional-to-observation", "gregorian-to-observation"]
      })
    );
  });

  it("rejects a direct cross-system coordinate ordering claim", () => {
    const fictional = createOpaqueCustomAdapter({
      timeSystemId: "fictional-era",
      definitionVersion: "1",
      canonicalPattern: /^Era-\d+$/
    });
    const result = solveTemporalConstraints(
      [
        {
          id: "coordinate-derived-cross-system-order",
          type: "precedes",
          source: time(coordinates.dayStart),
          target: time("Era-7", fictional.timeSystemId)
        }
      ],
      new TemporalAdapterRegistry([fictional, gregorian])
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        required_capability: "conversion",
        constraint_ids: ["coordinate-derived-cross-system-order"]
      })
    );
  });

  it("returns an explainable unresolved projection for an unknown adapter", () => {
    const result = solveTemporalConstraints(
      boundedWithSystem(
        "unknown-clock-event",
        "cycle:1",
        "cycle:2",
        "missing-clock"
      ),
      new TemporalAdapterRegistry()
    );
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unknown_time_system" })
    );
    expect(result.projections).toContainEqual(
      expect.objectContaining({
        event_id: "unknown-clock-event",
        kind: "unresolved"
      })
    );
  });
});

function boundedWithSystem(
  eventId: string,
  lower: string,
  upper: string,
  systemId: string
): readonly TemporalConstraint[] {
  return [
    {
      id: `${eventId}:lower`,
      type: "not_after",
      source: time(lower, systemId),
      target: { kind: "event", event_id: eventId }
    },
    {
      id: `${eventId}:upper`,
      type: "precedes",
      source: { kind: "event", event_id: eventId },
      target: time(upper, systemId)
    }
  ];
}
