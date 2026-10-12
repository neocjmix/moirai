import { describe, expect, it } from "vitest";
import { projectTstlSemantics } from "../../packages/graph-presentation/src/tstl-validator.js";
import {
  exactSignatureRows,
  inspectView,
  pathKey,
  reachableThroughOpenPaths,
  revealEvent,
  switchComparison,
  type TstlViewState
} from "./view-state.js";

const projection = projectTstlSemantics({
  complete: true,
  events: ["K", "J", "C", "war", "pair", "triple"].map((id) => ({ id })),
  contains: [
    ["K", "war"],
    ["J", "war"],
    ["war", "pair"],
    ["war", "triple"],
    ["C", "triple"]
  ].map(([parentId, childId]) => ({ parentId: parentId!, childId: childId! }))
});
const state: TstlViewState = {
  mode: "A",
  camera: { x: 3, y: 4, spanX: 100, spanY: 200 },
  selectedEventId: "war",
  activeCollectionIds: ["collection"],
  scopeCompositeIds: ["K", "J", "C"],
  collapsedPathKeys: [],
  shownEventIds: [],
  hiddenEventIds: []
};
const event = {
  eventId: "triple",
  x: 8,
  referenceY: 9,
  collectionIds: ["collection"]
};

describe("TSTL immutable comparison view", () => {
  it("preserves camera, selection and dormant path intent through A→B0→A", () => {
    const original = { ...state, collapsedPathKeys: [pathKey("K", "war")] };
    const restored = switchComparison(switchComparison(original, "B0"), "A");
    expect(restored).toEqual(original);
    expect(restored.camera).toBe(original.camera);
    expect(restored.collapsedPathKeys).toBe(original.collapsedPathKeys);
  });
  it("keeps shared descendants reachable until every parent path closes", () => {
    expect(
      reachableThroughOpenPaths(projection, [pathKey("K", "war")]).has("pair")
    ).toBe(true);
    const closed = [pathKey("K", "war"), pathKey("J", "war")];
    const reached = reachableThroughOpenPaths(projection, closed);
    expect(reached.has("pair")).toBe(false);
    expect(reached.has("triple")).toBe(true);
  });
  it("all-off remains empty even with selection and manual show intent", () => {
    const off = {
      ...state,
      activeCollectionIds: [],
      shownEventIds: [event.eventId]
    };
    expect(inspectView([event], projection, off)[0]?.reasons).toEqual([
      "scope-filtered"
    ]);
  });
  it("each omitted ID has a reveal route which restores access and identity", () => {
    const hidden = {
      ...state,
      activeCollectionIds: [],
      hiddenEventIds: [event.eventId],
      camera: { ...state.camera, x: -500 }
    };
    const omitted = inspectView([event], projection, hidden)[0]!;
    expect(omitted.reasons).toEqual([
      "scope-filtered",
      "user-hidden",
      "outside-viewport"
    ]);
    expect(omitted.revealRoute).toBe("event:triple");
    const restored = revealEvent(hidden, event);
    expect(inspectView([event], projection, restored)[0]?.visible).toBe(true);
    expect(restored.selectedEventId).toBe("triple");
    expect(event).toEqual({
      eventId: "triple",
      x: 8,
      referenceY: 9,
      collectionIds: ["collection"]
    });
  });
  it("changes exact signature question when C is hidden without adding Events", () => {
    const three = exactSignatureRows(projection, ["K", "J", "C"]);
    const two = exactSignatureRows(projection, ["K", "J"]);
    expect(three.find((row) => row.signature.length === 2)?.eventIds).toEqual([
      "pair"
    ]);
    expect(two).toEqual([
      { signature: ["J", "K"], eventIds: ["pair", "triple"], count: 2 }
    ]);
    expect(projection.parents.war).toEqual(["J", "K"]);
  });
});
