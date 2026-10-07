import { expect, it } from "vitest";
import { areaPathsD, FillRule, intersectD } from "clipper2-ts";
import { createCompositePanGeometryCache } from "./composite-pan-geometry";
import {
  buildClosedSplinePath,
  DEFAULT_COMPOSITE_SPLINE_TUNING as tuning,
  expandPolygon,
  resolveCompositeEdgeLabelPlacement
} from "./graph-shell-region-geometry";

const points = [{x: -95, y: -120}, {x: 105, y: -90}, {x: 115, y: 110}, {x: -100, y: 120}];
const viewport = {width: 390, height: 664};
const view = {x: 0, y: 0, scaleX: 1, scaleY: 1};
const request = {id: "composite", points, view, viewport, padding: 16, tuning};
const viewportPolygon = [{x: 0, y: 0}, {x: viewport.width, y: 0}, {x: viewport.width, y: viewport.height}, {x: 0, y: viewport.height}];
const project = (point: {x: number; y: number}, camera = view, size = viewport) => ({
  x: size.width / 2 + camera.x + point.x * camera.scaleX,
  y: size.height / 2 + camera.y + point.y * camera.scaleY
});

it("keeps the same padded hull and spline during repeated camera translation", () => {
  const cache = createCompositePanGeometryCache();
  const initial = cache.project(request);
  const expanded = expandPolygon(points.map(point => project(point)), request.padding);
  expect(initial.projectedPoints).toEqual(expanded);
  expect(initial.path).toBe(buildClosedSplinePath(expanded, tuning));
  expect(initial.pathTransform).toBeUndefined();
  for (let frame = 1; frame <= 600; frame++) {
    const camera = {...view, x: frame / 4, y: -frame / 8};
    const actual = cache.project({...request, view: camera});
    expect(actual.path).toBe(initial.path);
    expect(actual.pathTransform).toBe(`translate(${camera.x} ${camera.y})`);
    expect(actual.projectedHullPoints).toEqual(points.map(point => project(point, camera)));
    expect(actual.projectedPoints).toEqual(expanded.map(point => ({x: point.x + camera.x, y: point.y + camera.y})));
  }
  expect(cache.inspect()).toMatchObject({entries: 1, builds: 1, hits: 600});
});

it("preserves screen clipping and label ownership across fractional pans", () => {
  const cache = createCompositePanGeometryCache();
  let cachedLabel;
  let rebuiltLabel;
  for (const offset of [0, 0.001, 0.0003, 12.3456, -12.3456, 100.121, -120.135, 0]) {
    const camera = {...view, x: offset, y: offset / 3};
    const cached = cache.project({...request, view: camera});
    const rebuilt = expandPolygon(points.map(point => project(point, camera)), request.padding);
    expect(cached.projectedPoints).toHaveLength(rebuilt.length);
    for (let i = 0; i < rebuilt.length; i++) {
      expect(Math.abs(cached.projectedPoints[i]!.x - rebuilt[i]!.x)).toBeLessThan(0.003);
      expect(Math.abs(cached.projectedPoints[i]!.y - rebuilt[i]!.y)).toBeLessThan(0.003);
    }
    const cachedArea = Math.abs(areaPathsD(intersectD([cached.projectedPoints], [viewportPolygon], FillRule.NonZero, 6)));
    const rebuiltArea = Math.abs(areaPathsD(intersectD([rebuilt], [viewportPolygon], FillRule.NonZero, 6)));
    expect(Math.abs(cachedArea - rebuiltArea) / (viewport.width * viewport.height)).toBeLessThan(0.00001);
    cachedLabel = resolveCompositeEdgeLabelPlacement(cached.projectedPoints, 72, 18, viewport, 10, 6, [], cachedLabel);
    rebuiltLabel = resolveCompositeEdgeLabelPlacement(rebuilt, 72, 18, viewport, 10, 6, [], rebuiltLabel);
    expect(cachedLabel.edgeIndex).toBe(rebuiltLabel.edgeIndex);
    expect(Math.abs(cachedLabel.labelX - rebuiltLabel.labelX)).toBeLessThan(0.01);
    expect(Math.abs(cachedLabel.labelY - rebuiltLabel.labelY)).toBeLessThan(0.01);
  }
});

it("reuses equal fetched support but rebuilds when geometry, scale or styling changes", () => {
  const cache = createCompositePanGeometryCache();
  cache.project(request);
  cache.project({...request, points: points.map(point => ({...point})), viewport: {width: 500, height: 720}});
  expect(cache.inspect()).toMatchObject({builds: 1, hits: 1});
  for (const changed of [
    {...request, points: points.map((point, index) => ({...point, x: point.x + index}))},
    {...request, view: {...view, scaleX: 2}},
    {...request, view: {...view, scaleY: 2}},
    {...request, padding: 20},
    {...request, tuning: {...tuning, smoothing: 0.5}},
    {...request, tuning: {...tuning, cornerFloor: 0.5}},
    {...request, tuning: {...tuning, balanceFloor: 0.5}}
  ]) {
    const before = cache.inspect().builds;
    const actual = cache.project(changed);
    expect(cache.inspect().builds).toBe(before + 1);
    expect(actual.pathTransform).toBeUndefined();
    expect(actual.projectedPoints).toEqual(expandPolygon(changed.points.map(point => project(point, changed.view)), changed.padding));
  }
});

it("reuses label contours while preserving current clipping, density and edge decisions", () => {
  for (const polygon of [points, [...points].reverse(), [{x:-2000,y:-90},{x:2000,y:-89},{x:2000,y:90},{x:-2000,y:89}],
    [{x:-120,y:-100},{x:0,y:-30},{x:120,y:-100},{x:100,y:120},{x:-100,y:120}]]) {
    for (const labelWidth of [72,196,360]) {
      const cache = createCompositePanGeometryCache();
      let cachedPrevious;
      let baselinePrevious;
      for (const scale of [{scaleX:1,scaleY:1},{scaleX:.7,scaleY:1.3}]) {
        let prepared;
        for (const offset of [0,.0003,.0005,-.0005,4.5,-25.1,100.121,280.9,-120.135,0]) {
          const camera = {...view,...scale,x:offset,y:offset/3};
          const shape = cache.project({...request,points:polygon,view:camera,labelHeight:14,labelGap:6});
          if (prepared) expect(shape.labelPathFrame!.prepared).toBe(prepared);
          prepared = shape.labelPathFrame!.prepared;
          const nearby = Array.from({length:30},(_,i) => project({x:(i*37)%350-175,y:(i*61)%600-300},camera));
          const baseline = resolveCompositeEdgeLabelPlacement(shape.projectedPoints,labelWidth,14,viewport,10,6,nearby,baselinePrevious);
          const actual = resolveCompositeEdgeLabelPlacement(shape.projectedPoints,labelWidth,14,viewport,10,6,nearby,cachedPrevious,shape.labelPathFrame);
          expect(actual.edgeIndex).toBe(baseline.edgeIndex);
          expect(actual.side).toBe(baseline.side);
          expect(actual.labelX).toBeCloseTo(baseline.labelX,6);
          expect(actual.labelY).toBeCloseTo(baseline.labelY,6);
          expect(actual.labelAngle).toBeCloseTo(baseline.labelAngle,6);
          expect(actual.textPathStartOffset).toBe(baseline.textPathStartOffset);
          expect(actual.pathPoints).toHaveLength(baseline.pathPoints.length);
          for (let i=0;i<actual.pathPoints.length;i++) {
            expect(actual.pathPoints[i]!.x).toBeCloseTo(baseline.pathPoints[i]!.x,6);
            expect(actual.pathPoints[i]!.y).toBeCloseTo(baseline.pathPoints[i]!.y,6);
            if (actual.pathFrame) {
              expect(actual.pathFrame.points[i]!.x + actual.pathFrame.offset.x).toBeCloseTo(baseline.pathPoints[i]!.x,6);
              expect(actual.pathFrame.points[i]!.y + actual.pathFrame.offset.y).toBeCloseTo(baseline.pathPoints[i]!.y,6);
            }
          }
          baselinePrevious=baseline;cachedPrevious=actual;
        }
      }
      expect(cache.inspect()).toMatchObject({labelPathBuilds:2,labelPathHits:18});
    }
  }
});

it("prepares label contours only when compact geometry becomes a hull label owner", () => {
  const cache = createCompositePanGeometryCache();
  const labeled = {...request, labelHeight: 18, labelGap: 4};
  for (const scale of [0.02, 0.03, 0.04]) {
    const compact = cache.project({...labeled, view: {...view, scaleX: scale, scaleY: scale}});
    // The compact branch reads live support, hull path and point coordinates,
    // but never requests an edge-label frame.
    expect(compact.path).not.toBe("");
    expect(compact.projectedHullPoints).toHaveLength(points.length);
  }
  expect(cache.inspect()).toMatchObject({builds: 3, labelPathBuilds: 0, labelPathHits: 0, labelPathPoints: 0});

  const hull = cache.project(labeled);
  expect(cache.inspect().labelPathBuilds).toBe(0);
  const frame = hull.labelPathFrame!;
  expect(hull.labelPathFrame).toBe(frame);
  expect(cache.inspect()).toMatchObject({labelPathBuilds: 1, labelPathHits: 0});

  const panned = cache.project({...labeled, view: {...view, x: 12, y: -7}});
  expect(cache.inspect()).toMatchObject({labelPathBuilds: 1, labelPathHits: 0});
  expect(panned.labelPathFrame!.prepared).toBe(frame.prepared);
  expect(panned.labelPathFrame!.offset).toEqual({x: 12, y: -7});
  expect(panned.labelPathFrame).toBe(panned.labelPathFrame);
  expect(cache.inspect()).toMatchObject({labelPathBuilds: 1, labelPathHits: 1});
});

it("keeps lazy label frames tied to their geometry and label dimensions", () => {
  const labeled = {...request, labelHeight: 18, labelGap: 4};
  for (const changed of [
    {...labeled, points: points.map((point, index) => ({...point, x: point.x + index}))},
    {...labeled, view: {...view, scaleX: 0.7, scaleY: 1.3}},
    {...labeled, padding: 20},
    {...labeled, paddingProfile: [{minY: -120, maxY: 120, depth: 2}]},
    {...labeled, tuning: {...tuning, smoothing: 0.5}},
    {...labeled, labelHeight: 20},
    {...labeled, labelGap: 6}
  ]) {
    const cache = createCompositePanGeometryCache();
    const original = cache.project(labeled);
    const next = cache.project(changed);
    expect(cache.inspect().labelPathBuilds).toBe(0);
    const currentFrame = next.labelPathFrame!;
    expect(cache.inspect().labelPathBuilds).toBe(1);
    // Deferred reads must retain the original projection even if another
    // request has already replaced its geometry or label dimensions.
    const originalFrame = original.labelPathFrame!;
    expect(originalFrame.prepared).not.toBe(currentFrame.prepared);
    expect(originalFrame.prepared.labelHeight).toBe(18);
    expect(originalFrame.prepared.labelGap).toBe(4);
    expect(original.labelPathFrame).toBe(originalFrame);
    expect(next.labelPathFrame).toBe(currentFrame);
    expect(cache.inspect().labelPathBuilds).toBe(2);
  }
});

it("bounds visited regions and drops oversized geometry from the cache", () => {
  const cache = createCompositePanGeometryCache({maxEntries: 2});
  for (const id of ["a", "b", "a", "c", "a"]) cache.project({...request, id});
  expect(cache.inspect()).toMatchObject({entries: 2, builds: 3, hits: 2, evictions: 1});
  cache.project({...request, id: "b"});
  expect(cache.inspect()).toMatchObject({entries: 2, builds: 4, evictions: 2});
  cache.clear();
  expect(cache.inspect()).toMatchObject({entries: 0, vertices: 0, pathCharacters: 0});

  for (const budget of [{maxVertices: 1}, {maxPathCharacters: 1}, {maxEntries: 0}]) {
    const small = createCompositePanGeometryCache(budget);
    const first = small.project(request);
    expect(small.project(request)).toEqual(first);
    expect(small.inspect()).toMatchObject({entries: 0, vertices: 0, pathCharacters: 0, builds: 2, hits: 0});
  }

  const measured = createCompositePanGeometryCache();
  measured.project(request);
  const size = measured.inspect();
  for (const budget of [{maxVertices: size.vertices + 1}, {maxPathCharacters: size.pathCharacters + 1}]) {
    const bounded = createCompositePanGeometryCache(budget);
    for (let visit = 0; visit < 30; visit++) bounded.project({...request, id: `visit:${visit}`});
    expect(bounded.inspect()).toMatchObject({entries: 1, vertices: size.vertices, pathCharacters: size.pathCharacters, builds: 30, evictions: 29});
  }
});
