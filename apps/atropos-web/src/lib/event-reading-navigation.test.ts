import { describe, expect, it } from "vitest";
import {
  eventReadingSearch,
  graphReturnHref,
  withGraphReturnContext,
  graphReaderState
} from "./event-reading-navigation";

const event =
  "/worlds/01995c2a-7b00-7000-8000-000000000101/events/019f5b00-0000-7000-8000-000000000100";
const mq = JSON.stringify({ version: 1, query: { sources: [] }, focus: null });
const origin = new URLSearchParams({
  mq,
  gsViewport: "10,20,390,844",
  gsEvent: "event-1",
  gsStage: "peek",
  readerTab: "search",
  readerFind: "황산",
  token: "must-not-propagate"
}).toString();

describe("revision-pinned reader navigation", () => {
  it("restores the reader from bounded server route inputs before client hydration", () => {
    expect(
      graphReaderState({ readerTab: "search", readerFind: "황산" })
    ).toEqual({ tab: "search", search: "황산" });
    expect(
      graphReaderState({ readerTab: ["search"], readerFind: "x".repeat(513) })
    ).toEqual({ tab: "sources", search: "" });
  });
  it("carries only bounded graph reading context through Event routes", () => {
    const search = new URLSearchParams(eventReadingSearch(7, origin));
    expect(search.get("revision")).toBe("7");
    expect(search.get("mq")).toBe(mq);
    expect(search.get("gsViewport")).toBe("10,20,390,844");
    expect(search.get("readerFind")).toBe("황산");
    expect(search.has("token")).toBe(false);
    expect(graphReturnHref(search.toString())).toBe(
      `/graph?${new URLSearchParams({ mq, gsViewport: "10,20,390,844", gsEvent: "event-1", gsStage: "peek", readerTab: "search", readerFind: "황산" })}`
    );
  });
  it("never overwrites the server-selected revision or canonical focus from browser extras", () => {
    const stable = `${event}${eventReadingSearch(7, new URLSearchParams({ mq }).toString())}`;
    const href = withGraphReturnContext(stable, `${origin}&revision=99`);
    const result = new URL(href, "https://atropos.invalid");
    expect(result.searchParams.get("revision")).toBe("7");
    expect(result.searchParams.get("gsViewport")).toBe("10,20,390,844");
    expect(result.searchParams.get("mq")).toBe(mq);
    expect(() =>
      withGraphReturnContext("https://outside.invalid/", origin)
    ).toThrow();
  });
  it("rejects invalid revisions and discards oversized or absent graph context", () => {
    expect(() => eventReadingSearch(0)).toThrow();
    expect(() => eventReadingSearch(Number.NaN)).toThrow();
    expect(graphReturnHref("gsViewport=1,2,3,4")).toBeNull();
    expect(
      graphReturnHref(new URLSearchParams({ mq: "x".repeat(65537) }).toString())
    ).toBeNull();
    const search = new URLSearchParams(
      eventReadingSearch(
        3,
        new URLSearchParams({ mq, readerFind: "x".repeat(513) }).toString()
      )
    );
    expect(search.has("readerFind")).toBe(false);
  });
});
