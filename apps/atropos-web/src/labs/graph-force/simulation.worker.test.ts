import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createXSimulation,
  DEFAULT_CONFIG,
  MAX_TICK
} from "@moirai/layout-simulation";
import type { LayoutV2Snapshot } from "../../lib/layout-v2-types";
import type { Frame, WorkerRequest, WorkerResponse } from "./protocol";

const input = {
  nodes: [
    { id: "a", x: 0, y: 10 },
    { id: "b", x: 3, y: 10 }
  ],
  links: []
};
// Exercise the actual Worker scheduling and real physics without rendering a
// browser scene. Projection shape is deliberately irrelevant to these races.
vi.mock("../../lib/layout-v2-adapter", () => ({
  prepareGraphSimulation: () => ({ input, config: DEFAULT_CONFIG }),
  projectGraphSimulation: () => ({ entities: [], regions: [], edges: [] })
}));

let messages: WorkerResponse[];
let context: {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};
const send = (data: WorkerRequest) => context.onmessage!({ data });
const frames = () =>
  messages.filter((message): message is Frame => message.type === "frame");
const lastFrame = () => frames().at(-1)!;
const acknowledge = () => send({ type: "ack", frameId: lastFrame().frameId });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  messages = [];
  context = {
    onmessage: null,
    postMessage: (message) => messages.push(structuredClone(message))
  };
  vi.stubGlobal("self", context);
  await import("./simulation.worker");
  send({
    type: "init",
    sessionId: "run-one",
    snapshot: {} as LayoutV2Snapshot,
    scope: { collectionIds: [], relationTypes: [] }
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GraphShell Worker paint backpressure", () => {
  it("acknowledges a same-tick command and a stop after pending computation", async () => {
    acknowledge();
    send({ type: "target", requestId: 1, tick: 0 });
    await vi.runAllTimersAsync();
    expect(lastFrame().requestId).toBe(1);
    expect(lastFrame().state.tick).toBe(0);
    send({ type: "target", requestId: 2, tick: 20 });
    await vi.runAllTimersAsync();
    send({ type: "play", requestId: 3, enabled: false });
    acknowledge();
    expect(lastFrame().requestId).toBe(3);
    expect(lastFrame().state.tick).toBe(20);
    acknowledge();
    const count = frames().length;
    await vi.runAllTimersAsync();
    expect(frames()).toHaveLength(count);
  });

  it("computes behind one pending frame and publishes only the latest result on ack", async () => {
    send({ type: "target", requestId: 1, tick: 100 });
    await vi.runAllTimersAsync();
    expect(frames()).toHaveLength(1);
    expect(lastFrame().state.tick).toBe(0);
    acknowledge();
    expect(frames()).toHaveLength(2);
    expect(lastFrame().state).toEqual(createXSimulation(input).tick(100));
    expect(lastFrame().sessionId).toBe("run-one");
    // Export is the graph's acknowledged result, not unseen computed physics.
    send({ type: "export" });
    const exported = messages.at(-1)!;
    expect(exported.type).toBe("export");
    if (exported.type === "export") expect(exported.run.tick).toBe(0);
    acknowledge();
    send({ type: "export" });
    const final = messages.at(-1)!;
    if (final.type === "export") expect(final.run.tick).toBe(100);
    else throw Error("Missing export");
  });

  it("latest target wins and backward replay preserves exact coordinates", async () => {
    send({ type: "target", requestId: 1, tick: 1000 });
    send({ type: "target", requestId: 2, tick: 30 });
    await vi.runAllTimersAsync();
    acknowledge();
    expect(lastFrame().requestId).toBe(2);
    expect(lastFrame().state).toEqual(createXSimulation(input).tick(30));
    send({ type: "target", requestId: 3, tick: 10 });
    await vi.runAllTimersAsync();
    acknowledge();
    expect(lastFrame().state).toEqual(createXSimulation(input).tick(10));
  });

  it("stops at MAX_TICK instead of resetting after the last paint acknowledgement", async () => {
    send({ type: "play", requestId: 1, enabled: true });
    await vi.runAllTimersAsync();
    acknowledge();
    expect(lastFrame().state.tick).toBe(MAX_TICK);
    acknowledge();
    await vi.runAllTimersAsync();
    expect(lastFrame().state.tick).toBe(MAX_TICK);
    expect(frames()).toHaveLength(2);
  });

  it("invalid import cancels an already scheduled long seek", async () => {
    send({ type: "target", requestId: 1, tick: 1000 });
    send({ type: "import", requestId: 2, run: {} });
    await vi.runAllTimersAsync();
    acknowledge();
    await vi.runAllTimersAsync();
    expect(lastFrame().state.tick).toBe(0);
    expect(messages.some((message) => message.type === "error")).toBe(true);
  });
});
