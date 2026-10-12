import { describe, expect, it } from "vitest";
import {
  projectTstlSemantics,
  tstlSignatures,
  validateTstlGeometry,
  validateTstlWorldGeometry,
  validateTstlIncidence,
  validateTstlRenderCommands,
  validateTstlTemporal,
  type TstlGeometryInput,
  type TstlPoint,
  type TstlTemporalRecord
} from "./tstl-validator.js";

const rectangle = (
  x0: number,
  y0: number,
  x1: number,
  y1: number
): TstlPoint[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
];
const fixture = (edges: [string, string][], extra: string[] = []) =>
  projectTstlSemantics({
    events: [...new Set([...edges.flat(), ...extra])].map((id) => ({ id })),
    contains: edges.map(([parentId, childId]) => ({ parentId, childId })),
    complete: true
  });
const baseGeometry = (): TstlGeometryInput => ({
  complete: true,
  carrierIds: ["a"],
  placedCarrierIds: ["a"],
  members: { A: ["a"] },
  padding: 1,
  glyphs: [{ eventId: "a", support: { minX: 4, maxX: 6, minY: 4, maxY: 6 } }],
  patches: [
    {
      id: "p",
      minY: 0,
      maxY: 20,
      areaCompositeIds: ["A"],
      modeCue: true,
      regions: [
        { id: "A-p", compositeId: "A", points: rectangle(0, 0, 10, 10) }
      ]
    }
  ]
});
const codes = (input: TstlGeometryInput) =>
  validateTstlGeometry(input).diagnostics.map((d) => d.code);

describe("independent TSTL semantic projection", () => {
  it("deduplicates diamond reachability while preserving authored parents and equal leaf sets", () => {
    const p = fixture([
      ["P", "A"],
      ["P", "B"],
      ["A", "e"],
      ["B", "e"]
    ]);
    expect(p.status).toBe("COMPLETE");
    expect(p.descendants.P).toEqual(["A", "B", "e"]);
    expect(p.leafMembers.P).toEqual(["e"]);
    expect(p.ancestors.A).toEqual(["P"]);
    expect(tstlSignatures(p, ["P", "A", "B"])).toEqual([
      { compositeIds: ["A", "B", "P"], eventIds: ["e"], count: 1 }
    ]);
    expect(tstlSignatures(p, ["P", "A", "B"], ["A"])[0]?.compositeIds).toEqual([
      "P"
    ]);
    const equal = fixture([
      ["P", "C"],
      ["C", "e"]
    ]);
    expect(equal.leafMembers.P).toEqual(equal.leafMembers.C);
    const accidental = fixture([
      ["A", "e"],
      ["B", "e"],
      ["B", "f"]
    ]);
    expect(accidental.parents.A).toEqual([]);
    expect(accidental.descendants.B).not.toContain("A");
  });
  it("rejects cycles, duplicate identities/edges, missing references and cross-World edges", () => {
    expect(
      fixture([
        ["a", "b"],
        ["b", "a"]
      ]).status
    ).toBe("INPUT_ERROR");
    expect(
      projectTstlSemantics({
        events: [{ id: "a" }, { id: "a" }],
        contains: [],
        complete: true
      }).status
    ).toBe("INPUT_ERROR");
    expect(
      fixture([
        ["a", "b"],
        ["a", "b"]
      ]).diagnostics[0]?.code
    ).toBe("DUPLICATE_CONTAINS_EDGE");
    expect(
      projectTstlSemantics({
        events: [{ id: "a" }],
        contains: [{ parentId: "a", childId: "b" }],
        complete: true
      }).status
    ).toBe("INPUT_ERROR");
    expect(
      projectTstlSemantics({
        events: [
          { id: "a", worldId: "1" },
          { id: "b", worldId: "2" }
        ],
        contains: [{ parentId: "a", childId: "b" }],
        complete: true
      }).status
    ).toBe("INPUT_ERROR");
  });
  it("matches pairwise brute-force graph reachability across 200 seeded small DAGs", () => {
    let seed = 8675309;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let sample = 0; sample < 200; sample++) {
      const count = 2 + Math.floor(random() * 7);
      const ids = Array.from({ length: count }, (_, i) => String(i));
      const edges: [string, string][] = [];
      for (let i = 0; i < count; i++)
        for (let j = i + 1; j < count; j++)
          if (random() < 0.4) edges.push([String(i), String(j)]);
      const p = fixture(edges, ids);
      const reachable = (from: string, to: string): boolean => {
        const pending = edges.filter(([a]) => a === from).map(([, b]) => b);
        const seen = new Set<string>();
        while (pending.length) {
          const at = pending.pop()!;
          if (at === to) return true;
          if (seen.has(at)) continue;
          seen.add(at);
          for (const [a, b] of edges) if (a === at) pending.push(b);
        }
        return false;
      };
      for (const id of ids) {
        expect(p.descendants[id], `seed sample ${sample}/${id}`).toEqual(
          ids.filter((other) => reachable(id, other))
        );
        expect(p.ancestors[id]).toEqual(
          ids.filter((other) => reachable(other, id))
        );
      }
      const scope = p.compositeIds.filter(() => random() > 0.3);
      const atoms = tstlSignatures(p, scope);
      expect(atoms.reduce((sum, atom) => sum + atom.count, 0)).toBe(
        p.leafIds.length
      );
      for (const atom of atoms)
        for (const id of atom.eventIds)
          expect(atom.compositeIds).toEqual(
            scope.filter((c) => reachable(c, id))
          );
    }
  });
  it("validates all-event ancestor lists, typed ports, unique counts and actual reveal references", () => {
    const p = fixture([
      ["P", "C"],
      ["C", "e"]
    ]);
    const input = {
      memberships: p.ancestors,
      ports: [{ eventId: "C", compositeId: "P" }],
      hitTargets: [{ eventId: "e", hitTargetId: "event:e" }],
      omitted: ["P", "C"].map((eventId) => ({
        eventId,
        reason: "path-collapsed",
        revealRoute: `#event=${eventId}`
      }))
    };
    expect(validateTstlIncidence(p, input).valid).toBe(true);
    expect(
      validateTstlIncidence(p, {
        ...input,
        memberships: { ...p.ancestors, C: [] }
      }).valid
    ).toBe(false);
    expect(
      validateTstlIncidence(p, {
        ...input,
        ports: [{ eventId: "P", compositeId: "C" }]
      }).diagnostics.some((d) => d.code === "FALSE_MEMBERSHIP_PORT")
    ).toBe(true);
    expect(
      validateTstlIncidence(p, {
        ...input,
        hitTargets: [...input.hitTargets, ...input.hitTargets]
      }).valid
    ).toBe(false);
    expect(validateTstlIncidence(p, { ...input, omitted: [] }).valid).toBe(
      false
    );
  });
});

describe("lossless temporal eligibility gate", () => {
  const records: TstlTemporalRecord[] = [
    {
      eventId: "e",
      sourceY: 5,
      descriptors: [
        {
          kind: "uncertain-instant",
          minY: 1,
          maxY: 9,
          lowerInclusive: true,
          upperInclusive: false,
          source: {
            knowledge_span: ["start", "end"],
            constraint_ids: ["c1", "c2"]
          }
        },
        {
          kind: "duration",
          minY: 0,
          maxY: 20,
          source: { kind: "explicit_boundaries", start: "s", end: "f" }
        }
      ]
    },
    {
      eventId: "unknown",
      sourceY: null,
      descriptors: [
        {
          kind: "unplaced",
          minY: null,
          maxY: null,
          source: { status: "unresolved" },
          reason: "unknown"
        }
      ]
    },
    {
      eventId: "open",
      sourceY: null,
      descriptors: [
        {
          kind: "unplaced",
          minY: 7,
          maxY: null,
          source: { lower: "t", upper: null },
          reason: "open-boundary"
        }
      ]
    }
  ];
  it("preserves occurrence uncertainty separately from real duration and unknown/open time", () => {
    const result = validateTstlTemporal(records, structuredClone(records));
    expect(result).toMatchObject({
      valid: true,
      semanticFillEligible: true,
      unplacedCount: 2
    });
    const moved = structuredClone(records);
    moved[0]!.sourceY = 6;
    expect(validateTstlTemporal(records, moved).valid).toBe(false);
    const changed = structuredClone(records);
    changed[0]!.descriptors = [
      { ...changed[0]!.descriptors[0]!, upperInclusive: true }
    ];
    expect(validateTstlTemporal(records, changed).valid).toBe(false);
  });
  it("never invents temporal precision from scalar extents or open boundaries", () => {
    const legacy: TstlTemporalRecord[] = [
      {
        eventId: "a",
        sourceY: 5,
        descriptors: [{ kind: "legacy-scalar-only", minY: 1, maxY: 9 }]
      }
    ];
    expect(validateTstlTemporal(legacy, legacy)).toMatchObject({
      valid: true,
      semanticFillEligible: false,
      legacyCount: 1
    });
    const open: TstlTemporalRecord[] = [
      {
        eventId: "a",
        sourceY: 5,
        descriptors: [
          {
            kind: "uncertain-instant",
            minY: 1,
            maxY: null,
            source: {},
            lowerInclusive: true,
            upperInclusive: false
          }
        ]
      }
    ];
    expect(validateTstlTemporal(open, open).semanticFillEligible).toBe(false);
    const absentEvidence: TstlTemporalRecord[] = [
      {
        eventId: "a",
        sourceY: 5,
        descriptors: [{ kind: "exact-point", minY: 5, maxY: 5 }]
      }
    ];
    expect(
      validateTstlTemporal(absentEvidence, absentEvidence).semanticFillEligible
    ).toBe(false);
  });
});

describe("exact serialized orthogonal arrangement", () => {
  it("certifies full padded support and round-tripped polygons, rather than center probes", () => {
    const input = baseGeometry();
    expect(
      validateTstlGeometry(
        JSON.parse(JSON.stringify(input)) as TstlGeometryInput
      )
    ).toMatchObject({
      geometryValid: true,
      level: "EXACT_SERIALIZED",
      zones: [{ signature: ["A"], witnessEventIds: ["a"] }]
    });
    input.glyphs[0]!.support.maxX = 10;
    expect(codes(input)).toContain("MEMBER_EXCLUSION");
  });
  it("rejects nonmember support intrusion even when its center is outside the region", () => {
    const input = baseGeometry();
    input.carrierIds = ["a", "b"];
    input.placedCarrierIds = ["a", "b"];
    input.glyphs = [
      ...input.glyphs,
      { eventId: "b", support: { minX: 9, maxX: 15, minY: 3, maxY: 7 } }
    ];
    expect(codes(input)).toContain("NONMEMBER_INCLUSION");
  });
  it("rejects an unsupported triple atom despite three observed pairwise intersections", () => {
    const input: TstlGeometryInput = {
      complete: true,
      carrierIds: ["ab", "ac", "bc"],
      placedCarrierIds: ["ab", "ac", "bc"],
      members: { A: ["ab", "ac"], B: ["ab", "bc"], C: ["ac", "bc"] },
      padding: 1,
      glyphs: [
        { eventId: "ab", support: { minX: 2, maxX: 4, minY: 4, maxY: 6 } },
        { eventId: "ac", support: { minX: 12, maxX: 14, minY: 4, maxY: 6 } },
        { eventId: "bc", support: { minX: 7, maxX: 9, minY: 4, maxY: 6 } }
      ],
      patches: [
        {
          id: "p",
          minY: 0,
          maxY: 20,
          areaCompositeIds: ["A", "B", "C"],
          modeCue: true,
          regions: ["A", "B", "C"].map((compositeId) => ({
            id: compositeId,
            compositeId,
            points: rectangle(0, 0, 16, 10)
          }))
        }
      ]
    };
    expect(codes(input)).toContain("FALSE_ATOM");
    // The counterexample is same-Y AB/AC/BC; no Y movement can repair it.
    expect(new Set(input.glyphs.map((g) => g.support.minY)).size).toBe(1);
  });
  it("requires a placed witness in each interior-connected zone, including one-unit slivers", () => {
    const input = baseGeometry();
    input.patches[0]!.regions = [
      ...input.patches[0]!.regions,
      { id: "unwitnessed", compositeId: "A", points: rectangle(10, 10, 11, 11) }
    ];
    expect(codes(input)).toContain("UNWITNESSED_ZONE"); // corner contact is not interior connectivity
    expect(validateTstlGeometry(input).zones).toHaveLength(2);
  });
  it("equal-leaf P→C boundaries may coincide, but inflated parent-only atoms fail", () => {
    const input = baseGeometry();
    input.members = { P: ["a"], C: ["a"] };
    input.patches[0]!.areaCompositeIds = ["P", "C"];
    input.patches[0]!.regions = ["P", "C"].map((compositeId) => ({
      id: compositeId,
      compositeId,
      points: rectangle(0, 0, 10, 10)
    }));
    expect(validateTstlGeometry(input).geometryValid).toBe(true);
    input.patches[0]!.regions = [
      { id: "P", compositeId: "P", points: rectangle(-1, 0, 11, 11) },
      input.patches[0]!.regions[1]!
    ];
    expect(codes(input)).toContain("FALSE_ATOM");
  });
  it("reconnects artificial same-mode seams and clips long glyph support across a real hybrid transition", () => {
    const input = baseGeometry();
    input.glyphs[0]!.support = { minX: 4, maxX: 6, minY: 2, maxY: 8 };
    input.members = { A: ["a"], B: ["a"] };
    input.patches = [
      {
        id: "top",
        minY: 0,
        maxY: 5,
        modeCue: true,
        areaCompositeIds: ["A"],
        regions: [
          { id: "topA", compositeId: "A", points: rectangle(0, 0, 10, 5) }
        ]
      },
      {
        id: "bottom",
        minY: 5,
        maxY: 10,
        modeCue: true,
        areaCompositeIds: ["A"],
        regions: [
          { id: "bottomA", compositeId: "A", points: rectangle(0, 5, 10, 10) }
        ]
      }
    ];
    expect(validateTstlGeometry(input).zones).toEqual([
      { signature: ["A"], witnessEventIds: ["a"], cellCount: 12 }
    ]);
    expect(validateTstlGeometry(input).geometryValid).toBe(true);
    input.patches[1]!.areaCompositeIds = ["A", "B"];
    input.patches[1]!.regions = [
      ...input.patches[1]!.regions,
      { id: "bottomB", compositeId: "B", points: rectangle(0, 5, 10, 10) }
    ];
    expect(validateTstlGeometry(input).geometryValid).toBe(true);
    expect(validateTstlGeometry(input).zones).toHaveLength(2);
    input.patches[1]!.modeCue = false;
    expect(codes(input)).toContain("MISSING_MODE_CUE");
  });
  it("fails closed for incomplete source, non-integer/sloped/self-intersecting geometry and resource bounds", () => {
    const input = baseGeometry();
    expect(validateTstlGeometry({ ...input, complete: false }).level).toBe(
      "UNRESOLVED"
    );
    expect(validateTstlGeometry({ ...input, maxCells: 1 }).level).toBe(
      "UNRESOLVED"
    );
    input.patches[0]!.regions[0]!.points = rectangle(0.5, 0, 10, 10);
    expect(codes(input)).toContain("UNSUPPORTED_GEOMETRY");
    input.patches[0]!.regions[0]!.points = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(codes(input)).toContain("UNSUPPORTED_GEOMETRY");
    input.patches[0]!.regions[0]!.points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: -2 },
      { x: 0, y: -2 }
    ];
    expect(codes(input)).toContain("INVALID_RING");
  });
});

describe("final renderer command contract", () => {
  it("detects contour replacement, stroke/support expansion, unverified fills and duplicate semantic targets", () => {
    const geometry = baseGeometry();
    const source = {
      regions: geometry.patches[0]!.regions,
      glyphs: geometry.glyphs.map((glyph) => ({
        ...glyph,
        anchor: { x: 5, y: 5 }
      })),
      semanticFillEligible: false
    };
    const commands = {
      pipeline: "svg-linear" as const,
      clipping: "viewport-only" as const,
      regions: [
        {
          regionId: "A-p",
          points: source.regions[0]!.points,
          fill: "none" as const,
          strokeWidth: 1
        }
      ],
      glyphs: [
        {
          eventId: "a",
          hitTargetId: "event:a",
          body: { minX: 4.5, maxX: 5.5, minY: 4.5, maxY: 5.5 },
          strokeWidth: 1
        }
      ]
    };
    expect(validateTstlRenderCommands(source, commands).valid).toBe(true);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        regions: [{ ...commands.regions[0]!, points: rectangle(0, 0, 11, 10) }]
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        regions: [{ ...commands.regions[0]!, fill: "semantic" }]
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        glyphs: [{ ...commands.glyphs[0]!, strokeWidth: 2 }]
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        glyphs: [...commands.glyphs, ...commands.glyphs]
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        pipeline: "mesh" as "svg-linear"
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(source, {
        ...commands,
        clipping: "geometric" as "viewport-only"
      }).valid
    ).toBe(false);
    expect(
      validateTstlRenderCommands(
        { ...source, semanticFillEligible: true },
        {
          ...commands,
          regions: [
            { ...commands.regions[0]!, fill: "semantic", strokeWidth: 0 }
          ]
        }
      ).valid
    ).toBe(true);
  });
});

describe("source binding and review regressions", () => {
  it("rejects artifact-edited membership and missing temporal ID coverage", () => {
    const projection = fixture([["A", "a"]]);
    const temporal: TstlTemporalRecord[] = ["A", "a"].map((eventId) => ({
      eventId,
      sourceY: 5,
      descriptors: [
        {
          kind: "exact-point",
          minY: 5,
          maxY: 5,
          source: { coordinate: "5", constraints: ["source"] }
        }
      ]
    }));
    const input = baseGeometry();
    expect(
      validateTstlWorldGeometry(projection, temporal, temporal, input)
        .semanticFillEligible
    ).toBe(true);
    const changed = { ...input, members: { A: [] } };
    expect(
      validateTstlWorldGeometry(
        projection,
        temporal,
        temporal,
        changed
      ).diagnostics.some((d) => d.code === "MEMBERSHIP_SOURCE_MISMATCH")
    ).toBe(true);
    expect(
      validateTstlWorldGeometry(
        projection,
        temporal.slice(1),
        temporal.slice(1),
        input
      ).semanticFillEligible
    ).toBe(false);
    expect(validateTstlTemporal([], []).semanticFillEligible).toBe(false);
  });
  it("rejects disconnected cross-World inputs, duplicate ports, and a placed uncertainty anchor outside its bounds", () => {
    expect(
      projectTstlSemantics({
        events: [
          { id: "A", worldId: "1" },
          { id: "B", worldId: "2" }
        ],
        contains: [],
        complete: true
      }).status
    ).toBe("INPUT_ERROR");
    const projection = fixture([["A", "a"]]);
    const port = { eventId: "a", compositeId: "A" };
    expect(
      validateTstlIncidence(projection, {
        memberships: projection.ancestors,
        ports: [port, port],
        hitTargets: projection.eventIds.map((eventId) => ({
          eventId,
          hitTargetId: eventId
        })),
        omitted: []
      }).valid
    ).toBe(false);
    const records: TstlTemporalRecord[] = [
      {
        eventId: "a",
        sourceY: 20,
        descriptors: [
          {
            kind: "uncertain-instant",
            minY: 1,
            maxY: 5,
            lowerInclusive: true,
            upperInclusive: false,
            source: { constraints: ["c"] }
          }
        ]
      }
    ];
    expect(validateTstlTemporal(records, records).semanticFillEligible).toBe(
      false
    );
  });
  it("rejects rendered anchor movement even inside a broad conservative support", () => {
    const source = {
      semanticFillEligible: false,
      regions: [],
      glyphs: [
        {
          eventId: "a",
          support: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
          anchor: { x: 0, y: 0 }
        }
      ]
    };
    const commands = {
      pipeline: "svg-linear" as const,
      clipping: "viewport-only" as const,
      regions: [],
      glyphs: [
        {
          eventId: "a",
          hitTargetId: "a",
          body: { minX: 8, maxX: 10, minY: 8, maxY: 10 },
          strokeWidth: 0
        }
      ]
    };
    expect(
      validateTstlRenderCommands(source, commands).diagnostics.some(
        (d) => d.code === "RENDER_ANCHOR_MISMATCH"
      )
    ).toBe(true);
  });
});

it("binds conservative reference support to source Y and interval endpoints before certifying", () => {
  const projection = fixture([["A", "a"]]);
  const temporal: TstlTemporalRecord[] = ["A", "a"].map((eventId) => ({
    eventId,
    sourceY: 5,
    descriptors: [
      { kind: "exact-point", minY: 5, maxY: 5, source: { coordinate: "5" } }
    ]
  }));
  const input = baseGeometry();
  input.glyphs[0]!.support = { minX: 4, maxX: 6, minY: 54, maxY: 56 };
  input.patches[0]!.minY = 50;
  input.patches[0]!.maxY = 70;
  input.patches[0]!.regions[0]!.points = rectangle(0, 50, 10, 60);
  expect(validateTstlGeometry(input).geometryValid).toBe(true);
  expect(
    validateTstlWorldGeometry(projection, temporal, temporal, input)
      .semanticFillEligible
  ).toBe(false);
  expect(
    validateTstlWorldGeometry(
      projection,
      temporal,
      temporal,
      input
    ).diagnostics.some((d) => d.code === "GEOMETRY_SOURCE_Y_MISMATCH")
  ).toBe(true);
  const malformed: TstlTemporalRecord[] = [
    {
      eventId: "a",
      sourceY: null,
      descriptors: [
        {
          kind: "unplaced",
          minY: NaN,
          maxY: null,
          reason: "unknown",
          source: {}
        }
      ]
    }
  ];
  expect(validateTstlTemporal(malformed, malformed).valid).toBe(false);
});

it("indexed cell support checks agree with a brute rectangle oracle over 80 varied layouts", () => {
  let seed = 71013;
  const integer = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let sample = 0; sample < 80; sample++) {
    const ids = ["a", "b", "c", "d"];
    const memberIds = ids.filter(() => integer(2) === 1);
    const x0 = integer(15) - 10;
    const y0 = integer(15) - 10;
    const x1 = x0 + 2 + integer(12);
    const y1 = y0 + 2 + integer(12);
    const glyphs = ids.map((eventId) => {
      const x = integer(30) - 15;
      const y = integer(30) - 15;
      return {
        eventId,
        support: { minX: x, maxX: x + 2, minY: y, maxY: y + 2 }
      };
    });
    const input: TstlGeometryInput = {
      complete: true,
      carrierIds: ids,
      placedCarrierIds: ids,
      members: { A: memberIds },
      glyphs,
      padding: 1,
      patches: [
        {
          id: "p",
          minY: -30,
          maxY: 30,
          modeCue: true,
          areaCompositeIds: ["A"],
          regions: [
            { id: "A", compositeId: "A", points: rectangle(x0, y0, x1, y1) }
          ]
        }
      ]
    };
    const actual = validateTstlGeometry(input);
    for (const glyph of glyphs) {
      const box = {
        minX: glyph.support.minX - 1,
        maxX: glyph.support.maxX + 1,
        minY: glyph.support.minY - 1,
        maxY: glyph.support.maxY + 1
      };
      const contained =
        box.minX >= x0 && box.maxX <= x1 && box.minY >= y0 && box.maxY <= y1;
      const intrudes =
        box.minX < x1 && box.maxX > x0 && box.minY < y1 && box.maxY > y0;
      const has = (code: string) =>
        actual.diagnostics.some(
          (d) => d.code === code && d.eventId === glyph.eventId
        );
      expect(has("MEMBER_EXCLUSION")).toBe(
        memberIds.includes(glyph.eventId) && !contained
      );
      expect(has("NONMEMBER_INCLUSION")).toBe(
        !memberIds.includes(glyph.eventId) && intrudes
      );
    }
  }
});

it("bounds indexed support work before allocation and keeps empty area modes vacuous", () => {
  const glyphs = Array.from({ length: 200 }, (_, index) => ({
    eventId: String(index),
    support: {
      minX: -100 - index,
      maxX: 100 + index,
      minY: -100 - index,
      maxY: 100 + index
    }
  }));
  const input: TstlGeometryInput = {
    complete: true,
    carrierIds: glyphs.map((g) => g.eventId),
    placedCarrierIds: glyphs.map((g) => g.eventId),
    members: { A: glyphs.map((g) => g.eventId) },
    glyphs,
    padding: 1,
    patches: [
      {
        id: "p",
        minY: -500,
        maxY: 500,
        modeCue: true,
        areaCompositeIds: ["A"],
        regions: [
          { id: "A", compositeId: "A", points: rectangle(-400, -400, 400, 400) }
        ]
      }
    ]
  };
  expect(
    validateTstlGeometry(input).diagnostics.some(
      (d) => d.code === "ARRANGEMENT_INCIDENCE_BUDGET"
    )
  ).toBe(true);
  input.patches[0]!.areaCompositeIds = [];
  input.patches[0]!.regions = [];
  expect(validateTstlGeometry(input)).toMatchObject({
    geometryValid: true,
    checkedCells: 0,
    zones: []
  });
  input.glyphs[0]!.support.maxY = 900;
  expect(codes(input)).toContain("UNCOVERED_GLYPH_SUPPORT");
});
