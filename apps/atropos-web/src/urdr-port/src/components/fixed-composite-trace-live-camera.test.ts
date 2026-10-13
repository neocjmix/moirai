import { expect, it } from "vitest";
import { prepareLiveSvg } from "../../../components/geographic-renderer/live-svg";
import { createCompositePanGeometryCache } from "./composite-pan-geometry";
import { retainedCompositePaintTransform } from "./graph-shell-composite";
import { DEFAULT_COMPOSITE_SPLINE_TUNING as tuning } from "./graph-shell-region-geometry";

type Point = {x: number; y: number};
function applyMatrix(transform: string, point: Point) {
  const [a, b, c, d, e, f] = transform.slice(7, -1).split(" ").map(Number);
  return {x: a! * point.x + c! * point.y + e!, y: b! * point.x + d! * point.y + f!};
}

it("keeps cached open traces aligned with fills through retained and live independent-axis camera frames", () => {
  const worldPoint = {x: 117.123456789, y: -401.7654321};
  const traces = [{kind: "spine" as const, points: [worldPoint, {x: worldPoint.x, y: 800}]}];
  const rings = [[{x: 100, y: -410}, {x: 130, y: -410}, {x: 130, y: -390}, {x: 100, y: -390}]];
  const size = {width: 390, height: 844};
  const original = {x: 11, y: -17, scaleX: 1.125, scaleY: 0.371};
  const painted = {...original, x: 25.5, y: -30.25};
  const request = {id: "owner", points: [...rings.flat(), ...traces[0]!.points], fixedRings: rings, fixedTraces: traces, view: original, viewport: size, padding: 100, tuning};
  const cache = createCompositePanGeometryCache();
  cache.project(request);
  const geometry = cache.project({...request, view: painted});
  const tokens = geometry.tracePaths![0]!.path.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)!.map(Number);
  const cachedPoint = {x: tokens[0]! + painted.x - original.x, y: tokens[1]! + painted.y - original.y};
  const committed = {...painted, x: 28, y: -15, scaleX: 0.75, scaleY: 0.92};
  const committedPoint = applyMatrix(retainedCompositePaintTransform(painted, size, committed, size), cachedPoint);
  const groupAttributes = new Map<string, string>();
  const traceAttributes = new Map<string, string>();
  const traceNode = {setAttribute: (name: string, value: string) => traceAttributes.set(name, value)};
  const group = {
    querySelectorAll: (selector: string) => selector === "text, circle" ? [] : [traceNode],
    setAttribute: (name: string, value: string) => groupAttributes.set(name, value),
    removeAttribute: (name: string) => groupAttributes.delete(name),
  } as unknown as SVGGElement;
  const painter = prepareLiveSvg(group, committed, size);
  expect(traceAttributes.get("vector-effect")).toBe("non-scaling-stroke");
  for (const live of [
    {...committed, x: -59, scaleX: 2.8},
    {...committed, y: 93.5, scaleY: 0.12},
    {...committed, x: 107.3, y: -282, scaleX: 0.19, scaleY: 2.19},
  ]) {
    painter.apply(live);
    const screen = applyMatrix(groupAttributes.get("transform")!, committedPoint);
    expect(screen.x).toBeCloseTo(size.width / 2 + live.x + worldPoint.x * live.scaleX, 9);
    expect(screen.y).toBeCloseTo(size.height / 2 + live.y + worldPoint.y * live.scaleY, 9);
    expect(geometry.tracePaths![0]!.path).not.toMatch(/[ZCQ]/);
  }
  painter.restore();
  expect(groupAttributes.has("transform")).toBe(false);
});
