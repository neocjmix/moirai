import { describe, expect, it } from "vitest";
import { BoundedPublicationCache } from "./bounded-publication-cache";

describe("rebuildable Publication cache accounting", () => {
  it("evicts least recently used values by bytes and never retains an oversized value", () => {
    const cache = new BoundedPublicationCache<string>(
      3,
      12,
      (value) => value.length
    );
    cache.set("a", "1111");
    cache.set("b", "2222");
    expect(cache.get("a")).toBe("1111");
    cache.set("c", "3333");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("1111");
    cache.set("huge", "x".repeat(100));
    expect(cache.get("huge")).toBeUndefined();
    expect(cache.metrics().accounted_bytes).toBeLessThanOrEqual(12);
  });
  it("keeps World, Revision and query scope keys separate and rebuilds failed reads", async () => {
    const cache = new BoundedPublicationCache<string>(3, 1024);
    await expect(
      cache.read("world-a/revision-5/canon-a", async () => {
        throw Error("unavailable");
      })
    ).rejects.toThrow("unavailable");
    expect(
      await cache.read("world-a/revision-5/canon-a", async () => "old")
    ).toBe("old");
    expect(
      await cache.read("world-a/revision-6/canon-a", async () => "new")
    ).toBe("new");
    expect(
      await cache.read("world-b/revision-5/canon-a", async () => "other World")
    ).toBe("other World");
    expect(
      await cache.read("world-a/revision-5/canon-b", async () => "other Canon")
    ).toBe("other Canon");
    expect(cache.metrics().entries).toBe(3);
    expect(cache.metrics().pending).toBe(0);
  });
  it("coalesces one immutable read and clears pending state after success", async () => {
    const cache = new BoundedPublicationCache<string>(2, 1024);
    let calls = 0;
    let finish!: (value: string) => void;
    const build = () => {
      calls++;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const first = cache.read("world/revision/scope", build);
    const second = cache.read("world/revision/scope", build);
    finish("value");
    expect(await Promise.all([first, second])).toEqual(["value", "value"]);
    expect(calls).toBe(1);
    expect(cache.metrics().pending).toBe(0);
  });
});
