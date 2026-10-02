import { expect, it, vi } from "vitest";
import { graphReadLoader } from "./graph-read-loader";
import { createMoiraiGraphReadLoader } from "./moirai-graph-read-loader";

it("blocks queued legacy requests and aborts selected detail when its screen exits", async () => {
  const fetcher = vi.fn<typeof fetch>();
  let detailSignal!: AbortSignal;
  const loadEventDetail = vi.fn<typeof graphReadLoader.loadEventDetail>(
    (_locale, _id, signal) => {
      if (!signal) throw Error("missing read cancellation signal");
      detailSignal = signal;
      return new Promise<never>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        )
      );
    }
  );
  const loader = createMoiraiGraphReadLoader({
    sources: [],
    workspace: await graphReadLoader.loadWorkspace("ko"),
    loadEventDetail,
    fetcher
  });
  const selected = loader.loadEventDetail("ko", "event");
  loader.dispose?.();
  expect(detailSignal.aborted).toBe(true);
  await expect(selected).rejects.toMatchObject({ name: "AbortError" });
  await expect(loader.loadEventDetail("ko", "later")).rejects.toMatchObject({
    name: "AbortError"
  });
  await expect(
    loader.loadViewport("ko", {
      canonIds: [],
      bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      scale: 1,
      viewportWidth: 100,
      viewportHeight: 100,
      includeNeighbors: false
    })
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(loadEventDetail).toHaveBeenCalledOnce();
  expect(fetcher).not.toHaveBeenCalled();
});
