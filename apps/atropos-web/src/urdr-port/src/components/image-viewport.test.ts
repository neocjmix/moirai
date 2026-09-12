import { describe, expect, it } from "vitest";
import { addViewportPointer, createImageViewportState, getPinchSpanInfluence, moveViewportPointer, removeViewportPointer } from "./image-viewport";

describe("M4.6 copied pointer state machine", () => {
  it("pans without altering independent axis scales", () => {
    let state = createImageViewportState({ x: 20, y: 30, scaleX: 2, scaleY: 3 });
    state = addViewportPointer(state, 1, { x: 10, y: 20 });
    state = moveViewportPointer(state, 1, { x: 80, y: 110 });
    expect(state.view).toEqual({ x: 90, y: 120, scaleX: 2, scaleY: 3 });
  });

  it("keeps the original world anchor at the moving pinch centroid", () => {
    let state = createImageViewportState({ x: 20, y: 30, scaleX: 2, scaleY: 3 });
    state = addViewportPointer(state, 2, { x: 100, y: 100 });
    state = addViewportPointer(state, 1, { x: 400, y: 400 });
    const anchor = { x: (250 - 20) / 2, y: (250 - 30) / 3 };
    state = moveViewportPointer(state, 1, { x: 700, y: 1000 });
    expect(state.view.scaleX).toBe(4);
    expect(state.view.scaleY).toBe(9);
    expect(state.view.x + anchor.x * state.view.scaleX).toBeCloseTo(400);
    expect(state.view.y + anchor.y * state.view.scaleY).toBeCloseTo(550);
    const unchanged = addViewportPointer(state, 3, { x: 0, y: 0 });
    expect(unchanged).toBe(state);
    const before = state.view;
    state = removeViewportPointer(state, 1);
    state = moveViewportPointer(state, 2, { x: 110, y: 120 });
    expect(state.view).toEqual({ ...before, x: before.x + 10, y: before.y + 20 });
  });

  it("preserves logarithmic damping below the 300px span", () => {
    expect(getPinchSpanInfluence(0)).toBe(0);
    expect(getPinchSpanInfluence(150)).toBe(Math.log1p(6) / Math.log1p(12));
    expect(getPinchSpanInfluence(300)).toBe(1);
  });
});
