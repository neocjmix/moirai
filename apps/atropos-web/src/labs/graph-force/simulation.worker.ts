import {
  createXSimulation,
  MAX_TICK,
  type ExportedRun,
  type XSimulation
} from "@moirai/layout-simulation";
import {
  prepareGraphSimulation,
  projectGraphSimulation
} from "../../lib/layout-v2-adapter";
import type { LayoutV2Snapshot } from "../../lib/layout-v2-types";
import type { Scope, WorkerRequest, WorkerResponse } from "./protocol";
import { prepareGraphRunImport } from "./import-run";
const context = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
let snapshot: LayoutV2Snapshot | null = null;
let simulation: XSimulation | null = null;
let scope: Scope = { collectionIds: [], relationTypes: [] };
let target = 0,
  playing = false,
  frameId = 0,
  pendingFrame = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastPublished = 0,
  dirty = false;
let sessionId = "",
  requestId = 0;
let importing: ReturnType<typeof prepareGraphRunImport> | null = null;
let publishedRun: ExportedRun | null = null;
let acknowledgedRun: ExportedRun | null = null;
function schedule() {
  if (timer !== null || !simulation || !snapshot) return;
  timer = setTimeout(step, 0);
}
function publish() {
  if (!simulation || !snapshot) return;
  const state = simulation.state();
  if (importing && state.tick === importing.tick) {
    const digest = importing.verify(state);
    importing = null;
    context.postMessage({
      type: "imported",
      requestId,
      tick: state.tick,
      stateDigest: digest
    });
  }
  const viewport = projectGraphSimulation(snapshot, state, scope);
  pendingFrame = ++frameId;
  publishedRun = simulation.exportRun();
  dirty = false;
  lastPublished = performance.now();
  context.postMessage({
    type: "frame",
    sessionId,
    requestId,
    frameId,
    state,
    diagnostics: simulation.diagnostics(),
    viewport,
    config: publishedRun.config
  });
}
function step() {
  timer = null;
  if (!simulation || !snapshot) return;
  try {
    const goal = playing ? MAX_TICK : target;
    if (goal < simulation.state().tick) {
      simulation.seek(0);
      dirty = true;
    }
    const started = performance.now();
    // Yield between short work batches so a new drag target/stop wins promptly.
    while (simulation.state().tick < goal && performance.now() - started < 8) {
      simulation.tick(1);
      dirty = true;
    }
    if (simulation.state().tick === MAX_TICK) {
      playing = false;
      target = MAX_TICK;
    }
    if (
      dirty &&
      !pendingFrame &&
      (simulation.state().tick === goal ||
        performance.now() - lastPublished >= 80)
    )
      publish();
    // Physics keeps yielding in bounded batches while one immutable draw is
    // pending. A slow renderer receives only the latest state after its ack.
    if (simulation.state().tick < goal) schedule();
  } catch (error) {
    playing = false;
    importing = null;
    target = simulation?.state().tick ?? 0;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    context.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "simulation_failed"
    });
  }
}
context.onmessage = ({ data }) => {
  try {
    if (data.type === "init") {
      snapshot = data.snapshot;
      scope = data.scope;
      sessionId = data.sessionId;
      requestId = 0;
      importing = null;
      acknowledgedRun = null;
      const prepared = prepareGraphSimulation(snapshot);
      simulation = createXSimulation(prepared.input, prepared.config);
      target = 0;
      playing = false;
      pendingFrame = 0;
      publish();
    } else if (data.type === "target") {
      if (!Number.isInteger(data.tick) || data.tick < 0 || data.tick > MAX_TICK)
        throw Error("invalid_target_tick");
      target = data.tick;
      playing = false;
      requestId = data.requestId;
      importing = null;
      schedule();
    } else if (data.type === "play") {
      playing = data.enabled;
      requestId = data.requestId;
      importing = null;
      if (!playing && simulation) {
        target = simulation.state().tick;
        dirty = true;
      }
      schedule();
    } else if (data.type === "config" && snapshot) {
      simulation = createXSimulation(
        prepareGraphSimulation(snapshot).input,
        data.config
      );
      requestId = data.requestId;
      importing = null;
      target = 0;
      playing = false;
      dirty = true;
      // Invalidate old pending paint. New source remains immutable per frame.
      pendingFrame = 0;
      publish();
      schedule();
    } else if (data.type === "import" && snapshot) {
      const replay = prepareGraphRunImport(
        prepareGraphSimulation(snapshot).input,
        data.run
      );
      simulation = replay.simulation;
      importing = replay;
      requestId = data.requestId;
      target = replay.tick;
      playing = false;
      dirty = true;
      pendingFrame = 0;
      publish();
      schedule();
    } else if (data.type === "scope") {
      scope = data.scope;
      dirty = true;
      if (!pendingFrame) publish();
    } else if (data.type === "ack" && data.frameId === pendingFrame) {
      acknowledgedRun = publishedRun;
      pendingFrame = 0;
      if (dirty) publish();
      schedule();
    } else if (data.type === "export" && simulation) {
      if (!acknowledgedRun)
        throw Error("Wait for the graph to display a result before exporting");
      context.postMessage({ type: "export", run: acknowledgedRun });
    }
  } catch (error) {
    playing = false;
    importing = null;
    target = simulation?.state().tick ?? 0;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    context.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "simulation_failed"
    });
  }
};
