import { describe, expect, it } from "vitest";
import type { GeographicRenderFrame, GeographicRenderScene } from "./contract";
import { createScenePreparer, parseGeographicColor } from "./scene";

const view = { x: 0, y: 0, scaleX: 2, scaleY: 3 };
const size = { width: 200, height: 300 };
const density = { radius: 4, strokeWidth: 1, opacity: 1 };
const frame: GeographicRenderFrame = {
  now: 0,
  dpr: 1,
  reducedMotion: true,
  pointFill: [0.1, 0.2, 0.3, 1],
  pointStroke: [1, 1, 1, 1],
  edgeStrategy: "native"
};
function scene(): GeographicRenderScene {
  return {
    view,
    size,
    regions: [
      {
        id: "hull",
        path: "M100 150 L120 150 L120 180 L100 180 Z",
        paintView: view,
        paintViewport: size,
        renderedOpacity: 1,
        surfaceOpacity: 1,
        pointDisplay: density,
        representation: {
          hullOpacity: 1,
          hullStrokeOpacity: 0,
          pointOpacity: 0
        }
      }
    ],
    points: [
      {
        id: "event",
        x: 110,
        y: 165,
        opacity: 1,
        pointDisplay: density,
        paintView: view,
        paintViewport: size
      }
    ],
    colors: new Map([["hull", { fill: "hsl(118 54% 56%)", label: "#765" }]]),
    fillOpacity: 0.4,
    strokeOpacity: 0.15
  };
}

describe("renderer-neutral scene preparation", () => {
  it("keeps meshes and World point values stable through pan and viewport changes", () => {
    const prepare = createScenePreparer();
    const initial = scene();
    const before = prepare.prepare(initial, frame);
    expect(before.points[0]).toMatchObject({ x: 5, y: 5 });
    const nextView = { ...view, x: 27, y: -19 };
    const nextSize = { width: 240, height: 320 };
    const after = prepare.prepare(
      {
        ...initial,
        view: nextView,
        size: nextSize,
        regions: [
          {
            ...initial.regions[0]!,
            paintView: nextView,
            paintViewport: nextSize,
            pathTransform: "translate(47 -9)"
          }
        ],
        points: [
          {
            ...initial.points[0]!,
            x: 157,
            y: 156,
            paintView: nextView,
            paintViewport: nextSize
          }
        ]
      },
      { ...frame, now: 20 }
    );
    expect(after.hulls[0]!.geometry).toBe(before.hulls[0]!.geometry);
    expect(after.hulls[0]!.transform).toEqual([1, 1, 47, -9]);
    expect(after.points[0]).toEqual(before.points[0]);
    expect(after.camera).toEqual([2, 3, 147, 141]);
    expect(after.meshBuilds).toBe(1);
    prepare.dispose();
  });

  it("shares a bounded zoom mesh but invalidates an authored contour change", () => {
    const prepare = createScenePreparer();
    const initial = scene();
    const first = prepare.prepare(initial, frame);
    const nextView = { ...view, scaleX: 2.2, scaleY: 3.3 };
    const zoomed = {
      ...initial,
      view: nextView,
      regions: [
        {
          ...initial.regions[0]!,
          paintView: nextView,
          path: "M100 150 L122 150 L122 183 L100 183 Z"
        }
      ]
    };
    const next = prepare.prepare(zoomed, frame);
    expect(next.hulls[0]!.geometry).toBe(first.hulls[0]!.geometry);
    expect(next.hulls[0]!.transform[0]).toBeCloseTo(1.1);
    const changed = prepare.prepare(
      {
        ...zoomed,
        regions: [
          {
            ...zoomed.regions[0]!,
            path: "M100 150 L132 150 L132 183 L100 183 Z"
          }
        ]
      },
      frame
    );
    expect(changed.hulls[0]!.geometry.key).not.toBe(
      first.hulls[0]!.geometry.key
    );
    expect(changed.meshBuilds).toBe(2);
    // Backends get xy fill triangles and separately reusable stroke extrusion.
    expect(changed.hulls[0]!.geometry.fill.length).toBe(12);
    expect(changed.hulls[0]!.geometry.stroke.length).toBe(120);
  });

  it("finishes hull and point fades and prunes old identity state", () => {
    const prepare = createScenePreparer();
    const initial = scene();
    prepare.prepare(initial, { ...frame, reducedMotion: false });
    prepare.prepare(initial, { ...frame, now: 200, reducedMotion: false });
    const exiting = {
      ...initial,
      regions: [{ ...initial.regions[0]!, renderedOpacity: 0 }],
      points: [{ ...initial.points[0]!, opacity: 0 }]
    };
    const start = prepare.prepare(exiting, {
      ...frame,
      now: 210,
      reducedMotion: false
    });
    expect(start.animating).toBe(true);
    expect(start.hulls).toHaveLength(1);
    const done = prepare.prepare(exiting, {
      ...frame,
      now: 500,
      reducedMotion: false
    });
    expect(done.animating).toBe(false);
    expect(done.hulls).toHaveLength(0);
    expect(done.points).toHaveLength(0);
    prepare.prepare({ ...initial, regions: [], points: [] }, frame);
    const fresh = prepare.prepare(initial, frame);
    expect(fresh.meshBuilds).toBe(2);
  });

  it("represents Composite and Event points independently with authored color", () => {
    const prepare = createScenePreparer();
    const initial = scene();
    const prepared = prepare.prepare(
      {
        ...initial,
        regions: [
          {
            ...initial.regions[0]!,
            representation: {
              point: { x: 120, y: 180 },
              hullOpacity: 0,
              hullStrokeOpacity: 0,
              pointOpacity: 1
            }
          }
        ]
      },
      frame
    );
    expect(prepared.hulls).toHaveLength(0);
    expect(
      prepared.points.map((point) => [point.id, point.x, point.y])
    ).toEqual([
      ["composite:hull", 10, 10],
      ["event:event", 5, 5]
    ]);
    expect(prepared.points[0]!.fill).toEqual(
      parseGeographicColor("hsl(118 54% 56%)")
    );
  });

  it("parses graph palette colors without a browser or readback", () => {
    expect(parseGeographicColor("#765")).toEqual([
      119 / 255,
      102 / 255,
      85 / 255,
      1
    ]);
    expect(parseGeographicColor("rgba(255, 128, 0, 0.5)")).toEqual([
      1,
      128 / 255,
      0,
      0.5
    ]);
    expect(parseGeographicColor("hsl(120 100% 50%)")).toEqual([0, 1, 0, 1]);
    expect(() => parseGeographicColor("url(secret)")).toThrow(
      "unsupported_geographic_palette_color"
    );
  });
});
