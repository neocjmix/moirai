import { expect, it } from "vitest";
import {
  selectRenderDensity,
  resolveRenderCompositeSpans
} from "./v5-render-density";
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

it("retains bounded offscreen paint without reducing visible density capacity", () => {
  const buffered = points.slice(0, 80).map((p, i) => ({
    ...p,
    id: `buffer-${i}`,
    entity: { ...p.entity, id: `buffer-${i}` },
    bounds: { minX: -0.25, maxX: -0.25, minY: 5, maxY: 5 }
  }));
  const far = {
    ...buffered[0]!,
    id: "far",
    bounds: { minX: -2, maxX: -2, minY: 5, maxY: 5 }
  };
  const previous = new Map([
    ["buffer-0", { pointScale: 0.35, opacity: 1, labelOpacity: 0 }]
  ]);
  const result = selectRenderDensity(
    [...points, ...buffered, far],
    box,
    previous
  );
  expect(result).toHaveLength(160);
  expect(result.filter((p) => p.id.startsWith("e"))).toHaveLength(128);
  expect(result.filter((p) => p.id.startsWith("buffer-"))).toHaveLength(32);
  expect(result.find((p) => p.id === "buffer-0")?.renderDensity).toEqual(
    previous.get("buffer-0")
  );
  expect(result.some((p) => p.id === "far")).toBe(false);
});

it.each([
  { scaleX: 1, scaleY: 1 },
  { scaleX: 2, scaleY: 0.5 }
])(
  "retains visible full labels beyond the point margin at independent scales %j",
  (camera) => {
    const viewport = {
      minX: 0,
      maxX: 390 / camera.scaleX,
      minY: 0,
      maxY: 664 / camera.scaleY
    };
    const point = (
      id: string,
      x: number,
      y: number,
      label: string
    ): RenderPrimitive => ({
      ...points[1]!,
      id,
      entity: { kind: "event", id },
      label,
      geometry: {
        kind: "point",
        xy: { x: x / camera.scaleX, y: y / camera.scaleY }
      },
      bounds: {
        minX: x / camera.scaleX,
        maxX: x / camera.scaleX,
        minY: y / camera.scaleY,
        maxY: y / camera.scaleY
      }
    });
    const input = [
      point(
        "left-title",
        -30,
        200,
        "화면 가장자리에서도 끝까지 읽을 수 있는 사건 이름"
      ),
      point(
        "far-left-title",
        -400,
        250,
        "화면 밖에서 시작해도 긴 제목의 끝은 화면 안에 계속 표시되어야 하는 사건 이름"
      ),
      point("short-outside", -50, 300, "짧음"),
      point("right-outside", 420, 200, "화면 밖 제목"),
      point("bottom-outside", 120, 710, "화면 밖 제목")
    ];
    const result = selectRenderDensity(
      input,
      viewport,
      new Map(),
      undefined,
      camera
    );
    expect(result.map((p) => p.id)).toEqual(["far-left-title", "left-title"]);
    expect(result.every((p) => p.renderDensity?.labelOpacity === 1)).toBe(true);
    expect(result[0]!.label).toBe(input[1]!.label);
  }
);

it("keeps the 32 offscreen budget while prioritizing glyphs already on screen", () => {
  const viewport = { minX: 0, maxX: 390, minY: 0, maxY: 664 };
  const input: RenderPrimitive[] = Array.from({ length: 80 }, (_, index) => {
    const x = index < 40 ? 395 : -40;
    return {
      ...points[1]!,
      id: `buffer-${index}`,
      entity: { kind: "event", id: `buffer-${index}` },
      label: "화면 가장자리의 긴 제목",
      geometry: { kind: "point", xy: { x, y: 200 } },
      bounds: { minX: x, maxX: x, minY: 200, maxY: 200 },
      visibility: {
        policy: "render-visibility/1",
        priority: String(index).padStart(3, "0")
      }
    };
  });
  const result = selectRenderDensity(input, viewport, new Map(), undefined, {
    scaleX: 1,
    scaleY: 1
  });
  expect(result).toHaveLength(32);
  expect(result.every((p) => p.bounds.minX === -40)).toBe(true);
});

it("retains an offscreen Composite title before its external hull is resolved", () => {
  const viewport = { minX: 0, maxX: 390, minY: 0, maxY: 664 };
  const bounds = { minX: -55, maxX: -30, minY: 180, maxY: 200 };
  const composite: RenderPrimitive = {
    ...points[0]!,
    geometry: {
      kind: "external",
      key: "geometry/edge-composite",
      sha256: "synthetic"
    },
    bounds,
    label: "화면 밖 컴포짓의 긴 이름도 화면 안까지 이어집니다",
    composite: {
      childEventIds: [],
      supportComplete: true,
      worldBounds: bounds,
      hullBounds: bounds,
      anchor: { x: -42.5, y: 190 }
    }
  };
  const result = selectRenderDensity(
    [composite],
    viewport,
    new Map(),
    undefined,
    { scaleX: 1, scaleY: 1 }
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    id: composite.id,
    geometry: composite.geometry,
    label: composite.label,
    renderDensity: { labelOpacity: 1 }
  });
});
it("retains a visible authored hull before individual leaf density ranks on cold restoration", () => {
  const parent: RenderPrimitive = {
    ...points[0]!,
    id: "life-hull",
    entity: { kind: "composite", id: "life" },
    visibility: { policy: "render-visibility/1", priority: "zzzz" },
    composite: {
      childEventIds: ["e1"],
      supportComplete: true,
      worldBounds: box,
      hullBounds: box
    },
    geometry: { kind: "external", key: "geometry/life", sha256: "life" }
  };
  const leaves = points.map((p) => ({
    ...p,
    entity: { kind: "event" as const, id: p.id }
  }));
  const result = selectRenderDensity(
    [...leaves, parent],
    box,
    new Map(),
    undefined,
    { scaleX: 4, scaleY: 0.5 }
  );
  expect(result).toHaveLength(128);
  expect(result[0]!.entity.id).toBe("life");
  expect(result[0]!.renderDensity?.opacity).toBe(1);
  expect(
    selectRenderDensity(
      [parent, ...leaves.toReversed()],
      box,
      new Map(),
      undefined,
      { scaleX: 4, scaleY: 0.5 }
    )
  ).toEqual(result);
});
it("retains the same Composite owner across hull, large point and small point density boundaries", () => {
  const parent: RenderPrimitive = {
    ...points[0]!,
    id: "life-hull",
    entity: { kind: "composite", id: "life" },
    visibility: { policy: "render-visibility/1", priority: "zzzz" },
    composite: {
      childEventIds: ["e1"],
      supportComplete: true,
      worldBounds: box,
      hullBounds: box
    }
  };
  const leaves = points.map((p) => ({
    ...p,
    entity: { kind: "event" as const, id: p.id }
  }));
  for (const span of [100, 44, 20, 13, 12, 10, 6, 2]) {
    const result = selectRenderDensity(
      [...leaves, parent],
      box,
      new Map(),
      undefined,
      { scaleX: span / 10, scaleY: span / 10 }
    );
    expect(result).toHaveLength(128);
    expect(result[0]!.entity.id).toBe("life");
  }
});

const owner = (
  id: string,
  bounds = box,
  parents: string[] = []
): RenderPrimitive => ({
  ...points[0]!,
  id: `${id}:hull`,
  entity: { kind: "composite", id },
  bounds,
  visibility: { policy: "render-visibility/1", priority: "zzzz" },
  parentCompositeIds: parents,
  ancestorCompositeIds: parents,
  composite: {
    childEventIds: [],
    supportComplete: true,
    worldBounds: bounds,
    hullBounds: bounds
  }
});

it("keeps a selected child and its low-priority ancestors within the same128 budget", () => {
  const parent = owner("parent");
  const child = {
    ...points[1]!,
    id: "selected",
    entity: { kind: "event" as const, id: "selected" },
    parentCompositeIds: ["parent"]
  };
  const result = selectRenderDensity(
    [...points, child, parent],
    box,
    new Map(),
    "selected",
    { scaleX: 1, scaleY: 1 }
  );
  expect(result).toHaveLength(128);
  expect(result.slice(0, 2).map((p) => p.entity.id)).toEqual([
    "parent",
    "selected"
  ]);
});

it("retains normal selected paint after a deep ancestor bundle consumes density ranks", () => {
  const ancestors = Array.from({ length: 110 }, (_, index) =>
    owner(`ancestor-${index}`, box, index ? [`ancestor-${index - 1}`] : [])
  );
  const selected: RenderPrimitive = {
    ...points[1]!,
    id: "selected-deep",
    entity: { kind: "event", id: "selected-deep" },
    parentCompositeIds: ["ancestor-109"]
  };
  const result = selectRenderDensity(
    [...points, selected, ...ancestors],
    box,
    new Map(),
    selected.entity.id,
    { scaleX: 1, scaleY: 1 }
  );
  expect(result).toHaveLength(128);
  expect(result.slice(0, 110).map((p) => p.entity.id)).toEqual(
    ancestors.map((p) => p.entity.id)
  );
  expect(
    result.find((p) => p.entity.id === selected.entity.id)?.renderDensity
  ).toEqual({ pointScale: 1, opacity: 1, labelOpacity: 1 });
});

it("orders admission by effective child support even when the parent's own bounds are tiny", () => {
  const parent = owner("parent", { minX: 0, maxX: 0.1, minY: 0, maxY: 0.1 });
  const child = owner("child", box, ["parent"]);
  const camera = { scaleX: 1, scaleY: 1 };
  const spans = resolveRenderCompositeSpans([child, parent], camera);
  expect(spans.get("parent")).toBeGreaterThan(spans.get("child")!);
  const leaves = points.map((p) => ({
    ...p,
    entity: { kind: "event" as const, id: p.id }
  }));
  const result = selectRenderDensity(
    [...leaves, child, parent],
    box,
    new Map(),
    undefined,
    camera
  );
  expect(result).toHaveLength(128);
  expect(result.slice(0, 2).map((p) => p.entity.id)).toEqual([
    "parent",
    "child"
  ]);
});

it("closes offscreen children over prepared parents without exceeding128+32", () => {
  const parent = owner("buffer-parent", {
    minX: -10,
    maxX: -9,
    minY: 4,
    maxY: 5
  });
  const children = Array.from({ length: 40 }, (_, i) => ({
    ...points[1]!,
    id: `buffer-child-${i}`,
    entity: { kind: "event" as const, id: `buffer-child-${i}` },
    bounds: { minX: -0.25, maxX: -0.25, minY: 5, maxY: 5 },
    parentCompositeIds: ["buffer-parent"]
  }));
  const result = selectRenderDensity(
    [...points, ...children, parent],
    box,
    new Map()
  );
  expect(result).toHaveLength(160);
  const buffer = result.slice(128);
  expect(buffer[0]!.entity.id).toBe("buffer-parent");
  expect(
    buffer.filter((p) => p.entity.id.startsWith("buffer-child"))
  ).toHaveLength(31);
});
