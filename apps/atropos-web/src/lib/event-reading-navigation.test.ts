import { describe, expect, it } from "vitest";
import {
  graphEventHref,
  withGraphReturnContext,
  graphReaderState
} from "./event-reading-navigation";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const eventId = "019f5b00-0000-7000-8000-000000000100";
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
    const search = new URL(
      graphEventHref({ worldId, eventId, revision: 7, graphSearch: origin }),
      "https://atropos.invalid"
    ).searchParams;
    expect(search.get("revision")).toBe("7");
    expect(search.get("mq")).toBe(mq);
    expect(search.get("gsViewport")).toBe("10,20,390,844");
    expect(search.get("readerFind")).toBe("황산");
    expect(search.has("gsEvent")).toBe(false);
    expect(search.has("gsStage")).toBe(false);
    expect(search.has("token")).toBe(false);
  });
  it("never overwrites the server-selected revision or canonical focus from browser extras", () => {
    const stable = graphEventHref({
      worldId,
      eventId,
      revision: 7,
      graphSearch: new URLSearchParams({ mq }).toString()
    });
    const href = withGraphReturnContext(stable, `${origin}&revision=99`);
    const result = new URL(href, "https://atropos.invalid");
    expect(result.searchParams.get("revision")).toBe("7");
    expect(result.searchParams.get("gsViewport")).toBe("10,20,390,844");
    expect(result.searchParams.get("mq")).toBe(mq);
    expect(result.searchParams.has("gsEvent")).toBe(false);
    expect(result.searchParams.has("gsStage")).toBe(false);
    expect(() =>
      withGraphReturnContext("https://outside.invalid/", origin)
    ).toThrow();
  });
  it("builds the canonical full drawer URL without duplicate drawer state", () => {
    const href = graphEventHref({
      worldId,
      eventId,
      revision: 7,
      canonId: "019f5b00-0000-7000-8000-000000000002",
      graphSearch: origin
    });
    const result = new URL(href, "https://atropos.invalid");
    expect(result.pathname).toBe(`/graph/events/${worldId}/${eventId}`);
    expect(result.searchParams.get("revision")).toBe("7");
    expect(result.searchParams.get("canon")).toBe(
      "019f5b00-0000-7000-8000-000000000002"
    );
    expect(result.searchParams.has("gsEvent")).toBe(false);
    expect(result.searchParams.has("gsStage")).toBe(false);
  });
  it("rejects invalid revisions and discards oversized or absent graph context", () => {
    expect(() => graphEventHref({ worldId, eventId, revision: 0 })).toThrow();
    expect(() =>
      graphEventHref({ worldId, eventId, revision: Number.NaN })
    ).toThrow();
    const search = new URL(
      graphEventHref({
        worldId,
        eventId,
        revision: 3,
        graphSearch: new URLSearchParams({
          mq,
          readerFind: "x".repeat(513)
        }).toString()
      }),
      "https://atropos.invalid"
    ).searchParams;
    expect(search.has("readerFind")).toBe(false);
  });
});
