import { describe, expect, it } from "vitest";
import { renderReadyAt } from "./render-coalescing.js";

describe("Render coalescing", () => {
  const time = (second: number) => new Date(1_700_000_000_000 + second * 1_000);

  it("waits for quiet and caps continuous changes at thirty seconds", () => {
    expect(renderReadyAt({ firstDirtyAt: time(0), lastDirtyAt: time(2) })).toBe(
      time(7).getTime()
    );
    expect(
      renderReadyAt({ firstDirtyAt: time(0), lastDirtyAt: time(29) })
    ).toBe(time(30).getTime());
  });

  it("rejects invalid time and configuration", () => {
    expect(() =>
      renderReadyAt({ firstDirtyAt: time(2), lastDirtyAt: time(1) })
    ).toThrow();
    expect(() =>
      renderReadyAt({
        firstDirtyAt: time(0),
        lastDirtyAt: time(0),
        quietMs: 31_000
      })
    ).toThrow();
  });
});
