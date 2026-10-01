import { expect, it } from "vitest";
import { selectRenderDensity } from "./v5-render-density";
import type { RenderPrimitive } from "@moirai/graph-presentation/server";
const box = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
const points: RenderPrimitive[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `e${i}`,
  entity: { kind: i % 2 ? "event" : "composite", id: `e${i}` },
  geometry: { kind: "point", xy: { x: 1, y: 1 } },
  bounds: box,
  label: `Event ${i}`,
  collectionIds: ["a"],
  visibility: {
    policy: "render-visibility/1",
    priority: i.toString().padStart(6, "0")
  },
  lod: { visible: [-8, 3], groupId: `e${i}` }
}));
it("bounds both Event and Composite states without count clusters", () => {
  const result = selectRenderDensity(points, box, new Map());
  expect(result).toHaveLength(128);
  expect(
    result.filter((p) => p.renderDensity?.labelOpacity === 1)
  ).toHaveLength(64);
  expect(
    result.filter((p) => p.renderDensity?.pointScale === 0.35)
  ).toHaveLength(33);
  expect(result.at(-1)!.renderDensity?.opacity).toBe(0);
  expect(result.every((p) => p.entity.kind !== "cluster")).toBe(true);
});
it("selected identities survive priority and stable ordering does not depend on input order", () => {
  expect(
    selectRenderDensity(points, box, new Map(), "e999")[0]!.entity.id
  ).toBe("e999");
  expect(selectRenderDensity([...points].reverse(), box, new Map())).toEqual(
    selectRenderDensity(points, box, new Map())
  );
});
it("applies hysteresis in a bounded band and restores sparse points", () => {
  const old = new Map([
    ["e68", { pointScale: 1, opacity: 1, labelOpacity: 1 }],
    ["e60", { pointScale: 0.35, opacity: 1, labelOpacity: 0 }]
  ]);
  const result = selectRenderDensity(points, box, old);
  expect(result.find((p) => p.id === "e68")!.renderDensity?.labelOpacity).toBe(
    1
  );
  expect(result.find((p) => p.id === "e60")!.renderDensity?.labelOpacity).toBe(
    0
  );
  expect(
    selectRenderDensity(points.slice(60, 62), box, old).every(
      (p) => p.renderDensity?.labelOpacity === 1
    )
  ).toBe(true);
});
