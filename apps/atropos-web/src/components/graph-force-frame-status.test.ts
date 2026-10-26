import { describe, expect, it } from "vitest";
import { isGraphFramePending } from "./graph-force-frame-status";

const frame = {
  sessionId: "run",
  frameId: 5,
  requestId: 2,
  state: { tick: 100 }
};
const ready = {
  enabled: true,
  loading: false,
  error: null,
  requestId: 2,
  requestedTick: 100,
  frame,
  paintedFrame: frame
};

describe("graph frame command completion", () => {
  it("does not mark a stop settled merely because an older frame has painted", () => {
    expect(isGraphFramePending({ ...ready, requestId: 3 })).toBe(true);
    const final = { ...frame, frameId: 6, requestId: 3, state: { tick: 120 } };
    expect(
      isGraphFramePending({
        ...ready,
        requestId: 3,
        requestedTick: 120,
        frame: final
      })
    ).toBe(true);
    expect(
      isGraphFramePending({
        ...ready,
        requestId: 3,
        requestedTick: 120,
        frame: final,
        paintedFrame: final
      })
    ).toBe(false);
  });

  it("requires exact requested tick after intermediate seek frames", () => {
    expect(isGraphFramePending({ ...ready, requestedTick: 1000 })).toBe(true);
    expect(isGraphFramePending(ready)).toBe(false);
  });

  it("rejects a reused frame number from an older Worker session", () => {
    expect(
      isGraphFramePending({
        ...ready,
        paintedFrame: { ...frame, sessionId: "old-run" }
      })
    ).toBe(true);
  });

  it("distinguishes loading from disabled or failed execution", () => {
    expect(isGraphFramePending({ ...ready, loading: true })).toBe(true);
    expect(isGraphFramePending({ ...ready, enabled: false })).toBe(false);
    expect(isGraphFramePending({ ...ready, error: "invalid import" })).toBe(
      false
    );
  });
});
