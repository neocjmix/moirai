import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stableStringify } from "@moirai/domain";
import { stableDigest } from "./stable-digest.js";

describe("streamed projection digest", () => {
  it("keeps the existing digest bytes across nested values and Unicode token boundaries", () => {
    const sparse = Array<unknown>(3);
    sparse[0] = undefined;
    sparse[2] = null;
    const values = [
      null,
      true,
      12,
      -0,
      NaN,
      { z: [1, "한글 🚀", null], a: { c: 3, b: 2 } },
      { é: 1, e: 2, 가: 3, A: 4 },
      { array: sparse, value: undefined },
      Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        narrative: "한글 🚀".repeat(40),
        refs: ["a", "b"]
      }))
    ];
    for (const value of values)
      expect(stableDigest(value)).toBe(
        createHash("sha256").update(stableStringify(value)).digest("hex")
      );
  });
  it("keeps semantic identity independent of insertion order", () => {
    expect(stableDigest({ b: 2, a: 1 })).toBe(stableDigest({ a: 1, b: 2 }));
    expect(stableDigest([1, 2])).not.toBe(stableDigest([2, 1]));
  });
});
