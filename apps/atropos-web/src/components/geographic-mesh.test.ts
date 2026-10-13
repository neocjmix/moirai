import { describe, expect, it } from "vitest";
import { flattenGeographicPath, geographicMesh } from "./geographic-mesh";

function filledArea(data: Float32Array) {
  let result = 0;
  for (let i = 0; i < data.length; i += 15) {
    result +=
      Math.abs(
        (data[i + 5]! - data[i]!) * (data[i + 11]! - data[i + 1]!) -
          (data[i + 6]! - data[i + 1]!) * (data[i + 10]! - data[i]!)
      ) / 2;
  }
  return result;
}

describe("authored background tessellation", () => {
  it("triangulates disconnected fixed fragments without filling their gap", () => {
    const result = geographicMesh(
      "M0 0 L10 0 L10 10 L0 10 Z M30 0 L40 0 L40 10 L30 10 Z"
    );
    expect(filledArea(result.fill)).toBe(200);
    for (let i = 0; i < result.fill.length; i += 15) {
      const xs = [result.fill[i]!, result.fill[i + 5]!, result.fill[i + 10]!];
      expect(Math.max(...xs) <= 10 || Math.min(...xs) >= 30).toBe(true);
    }
    expect(result.stroke.length).toBe(8 * 6 * 5);
    expect(() => geographicMesh("M0 0 L10 0 M30 0 L40 0 Z")).toThrow();
  });
  it("fills a concave polygon without the fan's false area, in both winding directions", () => {
    for (const path of [
      "M0 0 L10 0 L10 4 L4 4 L4 10 L0 10 Z",
      "M0 10 L4 10 L4 4 L10 4 L10 0 L0 0 Z"
    ])
      expect(filledArea(geographicMesh(path).fill)).toBeCloseTo(64);
  });
  it("flattens cubic curves and closes without a duplicate zero-length edge", () => {
    const points = flattenGeographicPath("M0 0 C0 10,10 10,10 0 L0 0 Z");
    expect(points.length).toBeGreaterThan(4);
    expect(points.at(-1)).not.toEqual(points[0]);
    expect(
      points.every((p) => p.x >= 0 && p.x <= 10 && p.y >= 0 && p.y <= 7.5)
    ).toBe(true);
  });
  it("keeps stroke extrusion separate from camera scale and discards collapsed fill", () => {
    const result = geographicMesh("M0 0 L10 0 Z");
    expect(result.fill.length).toBe(0);
    expect(result.stroke.length).toBe(60);
    expect(
      [...result.stroke]
        .filter((_, i) => i % 5 === 4)
        .every((side) => Math.abs(side) === 1)
    ).toBe(true);
  });
  it("keeps fill triangles unchanged when feather insets omit stroke allocation", () => {
    for (const path of [
      "M0 0 L10 0 L10 4 L4 4 L4 10 L0 10 Z",
      "M0 10 L4 10 L4 4 L10 4 L10 0 L0 0 Z",
      "M0 0 C0 10,10 10,10 0 L0 0 Z",
      "M0 0 L10 0 Z"
    ]) {
      const full = geographicMesh(path);
      const fillOnly = geographicMesh(path, { stroke: false });
      expect(fillOnly.fill).toEqual(full.fill);
      expect(fillOnly.stroke.byteLength).toBe(0);
      expect(full.stroke.byteLength).toBeGreaterThan(0);
    }
    expect(() =>
      geographicMesh("M0 0 L10 10 L0 10 L10 0 Z", { stroke: false })
    ).toThrow();
  });
  it("rejects unsupported or non-simple geometry instead of painting invented meaning", () => {
    expect(() => geographicMesh("M0 0 A10 10 0 0 0 20 20 Z")).toThrow();
    expect(() => geographicMesh("M0 0 L10 10 L0 10 L10 0 Z")).toThrow();
  });
});

it("triangulates even-odd holes, disconnected exteriors and nested islands independent of winding/order", () => {
  const rings = [
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 }
    ],
    [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 }
    ],
    [
      { x: 9, y: 9 },
      { x: 11, y: 9 },
      { x: 11, y: 11 },
      { x: 9, y: 11 }
    ],
    [
      { x: 30, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 30, y: 10 }
    ]
  ];
  const serialize = (contours: typeof rings) =>
    contours
      .map(
        (ring) =>
          ring
            .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
            .join(" ") + " Z"
      )
      .join(" ");
  for (const contours of [
    rings,
    [...rings].reverse().map((ring) => [...ring].reverse())
  ]) {
    const path = serialize(contours);
    const mesh = geographicMesh(path, { fillRule: "evenodd" });
    expect(filledArea(mesh.fill)).toBe(404);
    expect(mesh.stroke.length).toBe(16 * 6 * 5);
    expect(
      geographicMesh(path, { fillRule: "evenodd", stroke: false }).fill
    ).toEqual(mesh.fill);
    // Every stroke segment belongs to a supplied exterior/hole boundary; no
    // triangulation bridge or former tile boundary is introduced as a stroke.
    const edges = new Set(
      contours.flatMap((ring) =>
        ring.map((point, index) => {
          const next = ring[(index + 1) % ring.length]!;
          return [point, next]
            .map((p) => `${p.x},${p.y}`)
            .sort()
            .join("/");
        })
      )
    );
    for (let i = 0; i < mesh.stroke.length; i += 5) {
      const pair = [
        `${mesh.stroke[i]},${mesh.stroke[i + 1]}`,
        `${mesh.stroke[i + 2]},${mesh.stroke[i + 3]}`
      ]
        .sort()
        .join("/");
      expect(edges.has(pair)).toBe(true);
    }
    const cross = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      px: number,
      py: number
    ) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    for (let i = 0; i < mesh.fill.length; i += 15) {
      const p = mesh.fill;
      const signs = [
        cross(p[i]!, p[i + 1]!, p[i + 5]!, p[i + 6]!, 8, 8),
        cross(p[i + 5]!, p[i + 6]!, p[i + 10]!, p[i + 11]!, 8, 8),
        cross(p[i + 10]!, p[i + 11]!, p[i]!, p[i + 1]!, 8, 8)
      ];
      expect(
        signs.every((value) => value >= 0) || signs.every((value) => value <= 0)
      ).toBe(false);
    }
    // The legacy unflagged disjoint-fragment interpretation stays unchanged.
    expect(filledArea(geographicMesh(path).fill)).toBe(604);
  }
});

it("does not simplify precise final compound boundary vertices during tessellation", () => {
  const path = "M0 0 L0.0005 0 L0.0005 10 L0 10 Z";
  expect(flattenGeographicPath(path, { exact: true })).toHaveLength(4);
  expect(
    filledArea(geographicMesh(path, { fillRule: "evenodd" }).fill)
  ).toBeCloseTo(0.005, 8);
  expect(() =>
    geographicMesh("M0 0 C0 10 10 10 10 0 Z", { fillRule: "evenodd" })
  ).toThrow();
});

it("bounds denser exact compound rings separately while retaining the legacy vertex cap", () => {
  const path = (count: number) =>
    Array.from({ length: count }, (_, index) => {
      const angle = (2 * Math.PI * index) / count;
      return `${index ? "L" : "M"}${Math.cos(angle) * 10000} ${Math.sin(angle) * 10000}`;
    }).join(" ") + " Z";
  expect(flattenGeographicPath(path(5229), { exact: true })).toHaveLength(5229);
  expect(() => flattenGeographicPath(path(5229))).toThrow(
    "geographic_vertex_budget"
  );
  expect(() => flattenGeographicPath(path(8193), { exact: true })).toThrow(
    "geographic_vertex_budget"
  );
});
