import { describe, expect, it } from "vitest";
import { createPanInertiaTracker, panInertiaFrame } from "./pan-inertia";

describe("touch pan inertia", () => {
  it("uses the recent release direction, caps speed, and decelerates without changing axes", () => {
    const tracker = createPanInertiaTracker();
    tracker.start(1, { x: 0, y: 0 }, 0, "touch");
    tracker.move(1, { x: -200, y: 0 }, 100);
    tracker.move(1, { x: -200, y: 0 }, 250);
    tracker.move(1, { x: 100, y: 150 }, 300);
    const velocity = tracker.end(1, 300, true)!;
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(1.6);
    expect(velocity.x / velocity.y).toBeCloseTo(2);
    const first = panInertiaFrame(velocity, 100);
    const second = panInertiaFrame(velocity, 200);
    expect(first.x).toBeGreaterThan(second.x - first.x);
    expect(first.x / first.y).toBeCloseTo(2);
    expect(panInertiaFrame(velocity, 1200)).toEqual(
      panInertiaFrame(velocity, 10000)
    );
    expect(panInertiaFrame(velocity, 1200).done).toBe(true);
  });

  it("has a stable endpoint across frame rates and no reverse movement", () => {
    const velocity = { x: -0.6, y: 0.3 };
    for (const step of [1000 / 30, 1000 / 60, 1000 / 120, 400]) {
      let elapsed = 0;
      let previous = panInertiaFrame(velocity, 0);
      while (!previous.done) {
        elapsed += step;
        const next = panInertiaFrame(velocity, elapsed);
        expect(next.x).toBeLessThanOrEqual(previous.x);
        expect(next.y).toBeGreaterThanOrEqual(previous.y);
        previous = next;
      }
      expect(previous).toEqual(panInertiaFrame(velocity, 2000));
    }
  });

  it.each(["mouse", "touch", "pen"])(
    "does not coast on a tap, paused release, or canceled %s contact",
    (pointerType) => {
      const tracker = createPanInertiaTracker();
      tracker.start(1, { x: 0, y: 0 }, 0, pointerType);
      tracker.move(1, { x: 2, y: 1 }, 20);
      expect(tracker.end(1, 20, true)).toBeNull();
      tracker.start(1, { x: 0, y: 0 }, 100, pointerType);
      tracker.move(1, { x: 60, y: 0 }, 150);
      expect(tracker.end(1, 240, true)).toBeNull();
      tracker.start(1, { x: 0, y: 0 }, 300, pointerType);
      tracker.move(1, { x: 60, y: 0 }, 350);
      expect(tracker.end(1, 350, false)).toBeNull();
    }
  );

  it("suppresses pinch releases and starts fresh after all contacts end", () => {
    const tracker = createPanInertiaTracker();
    tracker.start(1, { x: 0, y: 0 }, 0, "touch");
    tracker.start(2, { x: 100, y: 100 }, 10, "touch");
    tracker.move(1, { x: 50, y: 0 }, 50);
    expect(tracker.end(2, 60, true)).toBeNull();
    tracker.move(1, { x: 100, y: 0 }, 80);
    expect(tracker.end(1, 80, true)).toBeNull();
    tracker.start(3, { x: 0, y: 0 }, 100, "touch");
    tracker.move(3, { x: 25, y: 0 }, 150);
    expect(tracker.end(3, 150, true)).toEqual({ x: 0.5, y: 0 });
    // The following lostpointercapture is the same completed contact.
    expect(tracker.end(3, 151, false)).toBeNull();
  });

  it("drops all old samples on navigation cancellation", () => {
    const tracker = createPanInertiaTracker();
    tracker.start(1, { x: 0, y: 0 }, 0, "touch");
    tracker.move(1, { x: 60, y: 0 }, 50);
    tracker.cancel();
    expect(tracker.end(1, 50, true)).toBeNull();
    expect(panInertiaFrame({ x: 0, y: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
      done: true
    });
  });

  it("keeps interrupted contacts releasable and leaves mouse drags direct", () => {
    const tracker = createPanInertiaTracker();
    tracker.start(1, { x: 0, y: 0 }, 0, "touch");
    tracker.move(1, { x: 60, y: 0 }, 50);
    tracker.suppress();
    expect(tracker.has(1)).toBe(true);
    tracker.move(1, { x: 120, y: 0 }, 100);
    expect(tracker.end(1, 100, true)).toBeNull();
    expect(tracker.has(1)).toBe(false);
    tracker.start(2, { x: 0, y: 0 }, 200, "mouse");
    tracker.move(2, { x: 100, y: 0 }, 250);
    expect(tracker.end(2, 250, true)).toBeNull();
    tracker.start(3, { x: 0, y: 0 }, 300, "pen");
    tracker.move(3, { x: 25, y: 0 }, 350);
    expect(tracker.end(3, 350, true)).toEqual({ x: 0.5, y: 0 });
  });
});
