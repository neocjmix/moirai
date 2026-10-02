import { describe, expect, it } from "vitest";
import { addViewportPointer, createImageViewportState, getPinchSpanInfluence, moveViewportPointer, removeViewportPointer, resetViewportView } from "./image-viewport";

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

  it("keeps idle reset identity while applying an actual restored camera", () => {
    const initial = createImageViewportState();
    expect(resetViewportView(initial)).toBe(initial);
    const restored = resetViewportView(initial, {x: 20, y: 30, scaleX: 2, scaleY: 3});
    expect(restored.view).toEqual({x: 20, y: 30, scaleX: 2, scaleY: 3});
    expect(resetViewportView(restored, {...restored.view})).toBe(restored);
  });

  it("rebases an active pan even when reset keeps the same camera", () => {
    let state = addViewportPointer(createImageViewportState({scaleX: 2, scaleY: 3}), 1, {x: 10, y: 20});
    state = moveViewportPointer(state, 1, {x: 50, y: 70});
    const before = state;
    state = resetViewportView(state, {...state.view});
    expect(state).not.toBe(before);
    expect(state.view).toBe(before.view);
    expect(state.activePointers).toBe(before.activePointers);
    expect(state.gestureBaseline).not.toBe(before.gestureBaseline);
    expect(state.gestureBaseline?.view).toBe(state.view);
    state = moveViewportPointer(state, 1, {x: 60, y: 90});
    expect(state.view).toEqual({...before.view, x: before.view.x + 10, y: before.view.y + 20});
  });
});
