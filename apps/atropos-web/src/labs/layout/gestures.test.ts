import { describe, expect, it } from "vitest";
import {
  addViewportPointer,
  createImageViewportState,
  moveViewportPointer,
  removeViewportPointer
} from "../../urdr-port/src/components/image-viewport";
import {
  addLabPointer,
  cameraToView,
  createLabGesture,
  moveLabPointer,
  removeLabPointer,
  resetLabGesture,
  viewToCamera
} from "./gestures";

const size = { width: 390, height: 320 };
const camera = { x: -170, y: 222_789, spanX: 1234, spanY: 333 };
const point = (x: number, y: number) => ({ x, y });
const closeCamera = (actual: typeof camera, expected: typeof camera) => {
  for (const key of Object.keys(camera) as (keyof typeof camera)[])
    expect(actual[key]).toBeCloseTo(expected[key], 7);
};

describe("Lab adapter of Atropos pointer geometry", () => {
  it("round trips negative X, historical Y and independent scales", () => {
    closeCamera(viewToCamera(cameraToView(camera, size), size), camera);
    const precise = { ...camera, spanY: 0.00001 };
    closeCamera(viewToCamera(cameraToView(precise, size), size), precise);
  });
  it("matches the actual Atropos engine through pan, pinch, remaining-finger pan and release", () => {
    let lab = createLabGesture(camera, size);
    let atropos = createImageViewportState(cameraToView(camera, size));
    for (const [operation, id, p] of [
      ["add", 4, point(70, 90)],
      ["move", 4, point(90, 120)],
      ["add", 9, point(230, 240)],
      ["move", 9, point(280, 285)],
      ["remove", 9, point(0, 0)],
      ["move", 4, point(95, 130)],
      ["remove", 4, point(0, 0)]
    ] as const) {
      lab =
        operation === "add"
          ? addLabPointer(lab, id, p)
          : operation === "move"
            ? moveLabPointer(lab, id, p)
            : removeLabPointer(lab, id);
      atropos =
        operation === "add"
          ? addViewportPointer(atropos, id, p)
          : operation === "move"
            ? moveViewportPointer(atropos, id, p)
            : removeViewportPointer(atropos, id);
      expect(lab).toEqual(atropos);
    }
    expect(lab.activePointers).toEqual({});
    expect(lab.gestureBaseline).toBeNull();
  });
  it.each(["x", "y"] as const)(
    "zooms only %s for an axis-aligned pinch, and returns through the same threshold",
    (axis) => {
      let state = createLabGesture(camera, size);
      const first = point(60, 60);
      const second = axis === "x" ? point(230, 60) : point(60, 230);
      const moved = axis === "x" ? point(290, 60) : point(60, 290);
      state = addLabPointer(addLabPointer(state, 1, first), 2, second);
      state = moveLabPointer(state, 2, moved);
      const zoomed = viewToCamera(state.view, size);
      expect(zoomed[axis === "x" ? "spanX" : "spanY"]).toBeLessThan(
        camera[axis === "x" ? "spanX" : "spanY"]
      );
      expect(zoomed[axis === "x" ? "spanY" : "spanX"]).toBeCloseTo(
        camera[axis === "x" ? "spanY" : "spanX"]
      );
      closeCamera(
        viewToCamera(moveLabPointer(state, 2, second).view, size),
        camera
      );
    }
  );
  it("keeps the world point under the moving pinch center", () => {
    let state = createLabGesture(camera, size);
    state = addLabPointer(
      addLabPointer(state, 1, point(50, 70)),
      2,
      point(230, 220)
    );
    const initialCenter = point(140, 145);
    const world = point(
      (initialCenter.x - state.view.x) / state.view.scaleX,
      (initialCenter.y - state.view.y) / state.view.scaleY
    );
    state = moveLabPointer(
      moveLabPointer(state, 1, point(35, 60)),
      2,
      point(295, 280)
    );
    expect(world.x * state.view.scaleX + state.view.x).toBeCloseTo(165);
    expect(world.y * state.view.scaleY + state.view.y).toBeCloseTo(170);
  });
  it("rebases after a finger lifts without a jump and retains every move in a burst", () => {
    let state = addLabPointer(
      addLabPointer(createLabGesture(camera, size), 1, point(30, 50)),
      2,
      point(240, 230)
    );
    state = moveLabPointer(state, 2, point(280, 270));
    const pinchView = state.view;
    state = removeLabPointer(state, 2);
    expect(state.view).toEqual(pinchView);
    for (let i = 1; i <= 20; i++)
      state = moveLabPointer(state, 1, point(30 + i, 50 + i * 2));
    expect(state.view.x).toBeCloseTo(pinchView.x + 20);
    expect(state.view.y).toBeCloseTo(pinchView.y + 40);
    state = removeLabPointer(state, 1);
    expect(state.gestureBaseline).toBeNull();
    expect(moveLabPointer(state, 1, point(100, 100))).toBe(state);
  });
  it("ignores a third finger, handles cancellation, and starts the next gesture cleanly", () => {
    let state = addLabPointer(
      addLabPointer(createLabGesture(camera, size), 1, point(50, 50)),
      2,
      point(200, 200)
    );
    expect(addLabPointer(state, 3, point(100, 100))).toBe(state);
    state = removeLabPointer(removeLabPointer(state, 1), 2);
    state = addLabPointer(state, 7, point(100, 100));
    closeCamera(viewToCamera(state.view, size), camera);
    expect(Object.keys(state.activePointers)).toEqual(["7"]);
  });
  it("keeps a finite camera while fingers cross an initially wide axis", () => {
    let state = addLabPointer(
      addLabPointer(createLabGesture(camera, size), 1, point(10, 60)),
      2,
      point(350, 60)
    );
    state = moveLabPointer(state, 2, point(10, 60));
    closeCamera(viewToCamera(state.view, size), camera);
    state = moveLabPointer(state, 2, point(250, 60));
    expect(viewToCamera(state.view, size).spanX).toBeGreaterThan(camera.spanX);
  });
  it("rebases an external preset/camera change while a contact is still down", () => {
    let state = addLabPointer(createLabGesture(camera, size), 1, point(50, 60));
    const restored = { ...camera, spanX: 300, x: 210 };
    state = resetLabGesture(state, restored, size);
    closeCamera(
      viewToCamera(moveLabPointer(state, 1, point(50, 60)).view, size),
      restored
    );
  });
});
