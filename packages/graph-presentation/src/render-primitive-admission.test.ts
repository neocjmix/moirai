import { expect, it } from "vitest";
import type { RenderPrimitive } from "./v5-render-publication.js";
import { selectRenderPrimitiveClosure } from "./render-primitive-admission.js";

const primitive = (id: string, parents: string[] = []): RenderPrimitive => ({
  id,
  entity: { kind: "composite", id },
  geometry: { kind: "point", xy: { x: 0, y: 0 } },
  bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  label: id,
  collectionIds: ["selected"],
  parentCompositeIds: parents,
  lod: { visible: [0, 12], groupId: id }
});

it("admits a selected descendant with its complete available ancestry first", () => {
  const root = primitive("root");
  const middle = primitive("middle", ["root"]);
  const selected = primitive("selected", ["middle"]);
  const other = primitive("other");
  expect(
    selectRenderPrimitiveClosure([selected, other, middle, root], 3)
  ).toEqual([root, middle, selected]);
  // A bundle that cannot fit does not leave an orphan; smaller owners still fit.
  expect(
    selectRenderPrimitiveClosure([selected, other, middle, root], 2)
  ).toEqual([other, root]);
});

it("shares ancestry across the visible and offscreen budgets without duplicates", () => {
  const root = primitive("root");
  const a = primitive("a", ["root"]);
  const b = primitive("b", ["root"]);
  expect(
    selectRenderPrimitiveClosure([a, b], 2, {
      available: [root, a, b],
      already: [root]
    })
  ).toEqual([a, b]);
});

it("keeps available transitive owners when an inactive Collection removes a middle parent", () => {
  const root = primitive("root");
  const child = {
    ...primitive("child", ["inactive"]),
    ancestorCompositeIds: ["root", "inactive"]
  };
  expect(
    selectRenderPrimitiveClosure([child], 2, { available: [child, root] })
  ).toEqual([root, child]);
});

it("fails closed on malformed cyclic ancestry without recursive traversal", () => {
  const a = primitive("a", ["b"]),
    b = primitive("b", ["a"]);
  expect(() => selectRenderPrimitiveClosure([a, b], 128)).toThrow(
    "render_admission_contains_cycle"
  );
});
