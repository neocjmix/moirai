import { describe, expect, it } from "vitest";
import {
  GRAPH_SESSION_KEY,
  graphEntryResumeHref,
  lastGraphWorld,
  readWorldGraphState,
  rememberGraphWorld,
  workspaceWorldId
} from "./graph-session-state";
import {
  GRAPH_SHELL_LOCAL_STATE_KEY,
  serializeGraphShellLocalState
} from "../urdr-port/src/components/graph-shell-share-state";

const worldA = "01a107fb-4018-7fcb-8390-836a40fa91cc";
const worldB = "01995c2a-7b00-7000-8000-000000000101";
const size = { width: 390, height: 700 };
const state = (world: string, y: number) => ({
  shell: { selectedTimelineId: "gregorian", enabledCanonIds: [world] },
  viewport: { centerX: 25, centerY: y, spanX: 1500, spanY: 9000 }
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

describe("World-scoped graph restoration", () => {
  it("keeps each World camera while switching and remembers the latest World", () => {
    const store = storage();
    rememberGraphWorld(store, worldA, state(worldA, 220099));
    rememberGraphWorld(store, worldB, state(worldB, 100));
    rememberGraphWorld(store, worldA);
    expect(lastGraphWorld(store)).toBe(worldA);
    expect(readWorldGraphState(store, worldA, size)).toEqual(
      state(worldA, 220099)
    );
    expect(readWorldGraphState(store, worldB, size)).toEqual(
      state(worldB, 100)
    );
    expect(workspaceWorldId(`v5:${worldA}:51`)).toBe(worldA);
    expect(workspaceWorldId(`v5:${worldA}:52`)).toBe(worldA);
  });

  it("uses the legacy camera only for its own World", () => {
    const store = storage();
    store.setItem(
      GRAPH_SHELL_LOCAL_STATE_KEY,
      JSON.stringify(serializeGraphShellLocalState(state(worldA, 220099)))
    );
    expect(readWorldGraphState(store, worldA, size)?.viewport?.centerY).toBe(
      220099
    );
    expect(readWorldGraphState(store, worldB, size)).toBeNull();
  });

  it("does not let stored state override explicit World, coordinates or shared Event URLs", () => {
    expect(graphEntryResumeHref("", worldA, worldB)).toBe(
      `/graph/v5?world=${worldA}`
    );
    for (const query of [
      "world=" + worldB,
      "gsViewport=0,1,2,3",
      "mq=shared",
      "event=123",
      "collection=123",
      "gsEvent=123"
    ]) {
      expect(graphEntryResumeHref("?" + query, worldA, worldB)).toBeNull();
    }
    expect(graphEntryResumeHref("", worldA, worldA)).toBeNull();
    expect(graphEntryResumeHref("", "https://example.com")).toBeNull();
  });

  it("ignores malformed or blocked storage without breaking navigation", () => {
    const store = storage();
    store.setItem(GRAPH_SESSION_KEY, "{");
    expect(lastGraphWorld(store)).toBeNull();
    rememberGraphWorld(store, worldA, state(worldA, 220099));
    expect(lastGraphWorld(store)).toBe(worldA);
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {}
    };
    expect(() =>
      rememberGraphWorld(blocked, worldA, state(worldA, 220099))
    ).not.toThrow();
    expect(readWorldGraphState(blocked, worldA, size)).toBeNull();
    expect(lastGraphWorld(blocked)).toBeNull();
  });

  it("rejects a damaged saved camera and bounds retained Worlds", () => {
    const store = storage();
    rememberGraphWorld(store, worldA, {
      ...state(worldA, 1),
      viewport: { centerX: 0, centerY: 0, spanX: -1, spanY: 10 }
    });
    expect(readWorldGraphState(store, worldA, size)).toBeNull();
    for (let i = 0; i < 20; i++)
      rememberGraphWorld(
        store,
        `01995c2a-7b00-7000-8000-${String(i).padStart(12, "0")}`
      );
    expect(
      Object.keys(JSON.parse(store.getItem(GRAPH_SESSION_KEY)!).worlds)
    ).toHaveLength(12);
  });
});
