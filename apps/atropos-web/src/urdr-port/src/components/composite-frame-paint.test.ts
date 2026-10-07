import { expect, it } from "vitest";
import {
  hasVisiblePaintLifetime,
  needsCompositePaintFrame as needsFrame,
  reconcileCompositeFramePaint as paint
} from "./composite-frame-paint";
import { retainedCompositePaintTransform } from "./graph-shell-composite";
import { retainPointPaint, POINT_PAINT_FADE_MS } from "./point-paint-presence";

const region = (id: string, pan = 0, opacity = 1) => ({
  id,
  opacity,
  labelX: 100 + pan,
  labelY: 150 + pan,
  labelPath: `M ${100 + pan} ${150 + pan} L ${200 + pan} ${150 + pan}`,
  path: "M 100 100 L 200 100 L 200 200 Z",
  pathTransform: `translate(${pan} ${pan})`,
  paintView: {x: pan, y: pan, scaleX: 1, scaleY: 1},
  paintViewport: {width: 390, height: 664}
});

it("uses current coordinates and opacity on all 600 steady camera passes without another frame", () => {
  let scene = paint([], [region("a")], 0);
  expect(scene[0]?.renderedOpacity).toBe(0);
  expect(needsFrame(scene)).toBe(true);
  scene = paint(scene, [region("a")], 16, true);
  for (let frame = 1; frame <= 600; frame++) {
    const current = region("a", frame / 4, frame % 2 ? 0.35 : 1);
    scene = paint(scene, [current], frame * 16);
    expect(scene[0]).toEqual({...current, renderedOpacity: current.opacity, visibilityState: "present"});
    expect(scene[0]?.paintView).toBe(current.paintView);
    expect(needsFrame(scene)).toBe(false);
  }
});

it("starts each new identity after its own committed enter, including a response arriving with a tick", () => {
  let scene = paint([], [region("a")], 0);
  scene = paint(scene, [region("a", 1), region("b", 1)], 16, true);
  expect(scene[0]).toMatchObject({renderedOpacity: 1, visibilityState: "present", labelX: 101});
  expect(scene[1]).toMatchObject({renderedOpacity: 0, visibilityState: "entering", labelX: 101});
  expect(needsFrame(scene)).toBe(true);
  scene = paint(scene, [region("a", 2), region("b", 2)], 32, true);
  expect(scene.every(item => item.visibilityState === "present")).toBe(true);
  expect(needsFrame(scene)).toBe(false);
});

it("retains exit geometry and starts its deadline once while current targets continue moving", () => {
  let scene = paint([], [region("a")], 0);
  scene = paint(scene, [region("a", 4)], 16, true);
  const lastPaint = scene[0]!;
  scene = paint(scene, [], 32);
  expect(scene[0]).toEqual({...lastPaint, visibilityState: "exiting"});
  expect(needsFrame(scene)).toBe(true);
  scene = paint(scene, [], 48, true);
  const exit = scene[0]!;
  expect(exit).toMatchObject({renderedOpacity: 0, visibilityState: "exiting", exitStartedAt: 48});
  expect(exit.paintView).toBe(lastPaint.paintView);
  expect(exit.labelPath).toBe(lastPaint.labelPath);
  expect(retainedCompositePaintTransform(exit.paintView, exit.paintViewport, {...exit.paintView, x: 20}, exit.paintViewport))
    .toBe("matrix(1 0 0 1 16 0)");
  for (const now of [64, 100, 267]) {
    scene = paint(scene, [], now);
    expect(scene[0]).toBe(exit);
    expect(needsFrame(scene)).toBe(false);
  }
  expect(paint(scene, [], 268)).toEqual([]);
});

it("reverses a retained exit immediately without resetting identity or retaining its deadline", () => {
  let scene = paint([], [region("a")], 0);
  scene = paint(scene, [region("a")], 16, true);
  scene = paint(scene, [], 32);
  scene = paint(scene, [], 48, true);
  const returned = region("a", 9, 0.7);
  scene = paint(scene, [returned], 100);
  expect(scene[0]).toEqual({...returned, renderedOpacity: 0.7, visibilityState: "present"});
  expect(scene[0]?.exitStartedAt).toBeUndefined();
  expect(needsFrame(scene)).toBe(false);
  expect(paint(scene, [returned], 1_000)[0]?.id).toBe("a");
});

it("prunes old coverage during continuous changes and clears an all-off scene", () => {
  let scene = paint([], [region("0")], 0);
  scene = paint(scene, [region("0")], 1, true);
  for (let frame = 1; frame <= 600; frame++) {
    const incoming = [region(String(frame), frame)];
    scene = paint(scene, incoming, frame * 16);
    scene = paint(scene, incoming, frame * 16 + 1, true);
    expect(scene.length).toBeLessThanOrEqual(15);
    expect(new Set(scene.map(item => item.id)).size).toBe(scene.length);
    expect(scene.find(item => item.id === String(frame))?.labelX).toBe(100 + frame);
  }
  scene = paint(scene, [], 10_000);
  scene = paint(scene, [], 10_016, true);
  scene = paint(scene, [], 10_236);
  expect(scene).toEqual([]);
  expect(needsFrame(scene)).toBe(false);
});
it("paints a newly admitted parent immediately when an authored child is already visible",()=>{
  let scene=paint([], [{...region("child"),contains:[]}],0);
  scene=paint(scene,[{...region("child"),contains:[]}],16,true);
  const parent={...region("parent"),contains:["child"]};
  const next=paint(scene,[parent,{...region("child"),contains:[]}],32);
  expect(next.find(item=>item.id==="parent")).toMatchObject({renderedOpacity:1,visibilityState:"present"});
  expect(next.find(item=>item.id==="child")?.renderedOpacity).toBe(1);
  const leafParent=paint([], [{...region("leaf-parent"),contains:["leaf"]}],32,false,220,new Set(["leaf"]));
  expect(leafParent[0]?.renderedOpacity).toBe(1);
});
it("cold parent and child scenes enter together without replaying an old zoom",()=>{
  const incoming=[{...region("parent"),contains:["child"]},{...region("child"),contains:[]}];
  const cold=paint([],incoming,0);
  expect(cold.map(item=>item.renderedOpacity)).toEqual([0,0]);
  const next=paint(cold,incoming,16,true);
  expect(next.map(item=>item.renderedOpacity)).toEqual([1,1]);
});

it("a new parent owns retained Composite exits until their paint deadline", () => {
  const child = {...region("child"), contains: []};
  let scene = paint([], [child], 0);
  scene = paint(scene, [child], 16, true);
  scene = paint(scene, [], 32);
  scene = paint(scene, [], 48, true);
  expect(scene[0]).toMatchObject({renderedOpacity: 0, exitStartedAt: 48});
  const parent = {...region("parent"), contains: ["child"]};
  const incoming = paint(scene, [parent], 64);
  expect(incoming.find(item => item.id === "parent")).toMatchObject({renderedOpacity: 1, visibilityState: "present"});
  expect(incoming.find(item => item.id === "child")?.exitStartedAt).toBe(48);
  // A spent history entry cannot keep the immediate-ownership exception alive.
  const expired = paint(scene, [parent], 268);
  expect(expired).toHaveLength(1);
  expect(expired[0]).toMatchObject({renderedOpacity: 0, visibilityState: "entering"});
});

it("a new parent owns a fading retained leaf without extending its lifetime", () => {
  const retained = retainPointPaint<{id: string; opacity: number}>([{id: "leaf", opacity: 1}], [], 48);
  expect(retained[0]).toMatchObject({opacity: 0, exitStartedAt: 48});
  const parent = {...region("parent"), contains: ["leaf"]};
  const pointIds = (now: number) => new Set(retained.filter(point => hasVisiblePaintLifetime(point.opacity, point.exitStartedAt, now, POINT_PAINT_FADE_MS)).map(point => point.id));
  expect(paint([], [parent], 64, false, 220, pointIds(64))[0]?.renderedOpacity).toBe(1);
  expect(paint([], [parent], 268, false, 220, pointIds(268))[0]?.renderedOpacity).toBe(0);
  expect(retainPointPaint(retained, [], 268)).toEqual([]);
});
