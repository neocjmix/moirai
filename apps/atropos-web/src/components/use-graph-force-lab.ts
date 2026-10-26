"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_TICK,
  stateDigest,
  type SimulationConfig,
  type ExportedRun
} from "@moirai/layout-simulation";
import {
  snapshotDigestPayload,
  type LayoutV2Snapshot
} from "../lib/layout-v2-types";
import type {
  Frame,
  Scope,
  WorkerRequest,
  WorkerResponse
} from "../labs/graph-force/protocol";

type Identity = { worldId: string; revision: number; timeSystemId: string };
export function useGraphForceLab(identity: Identity, scope: Scope) {
  const [enabled, setEnabled] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [paintedFrame, setPaintedFrame] = useState<Frame | null>(null);
  const [snapshot, setSnapshot] = useState<LayoutV2Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedTick, setRequestedTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [exported, setExported] = useState<ExportedRun | null>(null);
  const [imported, setImported] = useState<{
    tick: number;
    stateDigest: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const worker = useRef<Worker | null>(null);
  const cached = useRef<{ key: string; value: LayoutV2Snapshot } | null>(null);
  const latestFrame = useRef<Frame | null>(null);
  const runningRef = useRef(false);
  const requestId = useRef(0);
  const stopRequestId = useRef<number | null>(null);
  const scopeKey = JSON.stringify(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const identityKey = `${identity.worldId}:${identity.revision}:${identity.timeSystemId}`;
  const send = useCallback(
    (message: WorkerRequest) => worker.current?.postMessage(message),
    []
  );
  const choose = useCallback((next: boolean) => {
    setEnabled(next);
    setError(null);
    setRunning(false);
    runningRef.current = false;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("layoutLab", "force-v2");
    else url.searchParams.delete("layoutLab");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    const restore = () =>
      setEnabled(
        new URLSearchParams(window.location.search).get("layoutLab") ===
          "force-v2"
      );
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [identityKey]);
  useEffect(() => {
    if (!enabled) {
      setFrame(null);
      setPaintedFrame(null);
      latestFrame.current = null;
      setLoading(false);
      setRunning(false);
      runningRef.current = false;
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setFrame(null);
    setPaintedFrame(null);
    latestFrame.current = null;
    setRequestedTick(0);
    setRunning(false);
    runningRef.current = false;
    requestId.current = 0;
    stopRequestId.current = null;
    setImported(null);
    setExported(null);
    const start = async () => {
      let source =
        cached.current?.key === identityKey ? cached.current.value : null;
      if (!source) {
        const params = new URLSearchParams({
          world: identity.worldId,
          revision: String(identity.revision),
          timeSystem: identity.timeSystemId
        });
        const response = await fetch(`/labs/layout-v2/snapshot?${params}`, {
          signal: controller.signal
        });
        if (!response.ok)
          throw Error(`역사 입력을 불러오지 못했습니다 (${response.status})`);
        source = (await response.json()) as LayoutV2Snapshot;
        if (
          source.formatVersion !== "layout-lab-v2-snapshot/1" ||
          source.worldId !== identity.worldId ||
          source.sourceRevision !== identity.revision ||
          source.timeSystemId !== identity.timeSystemId
        )
          throw Error("실험 입력의 World·Revision이 일치하지 않습니다.");
        const bytes = new TextEncoder().encode(snapshotDigestPayload(source));
        const digest = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
        ]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== source.inputDigest)
          throw Error("실험 입력 digest가 일치하지 않습니다.");
        cached.current = { key: identityKey, value: source };
      }
      if (!active) return;
      setSnapshot(source);
      const instance = new Worker(
        new URL("../labs/graph-force/simulation.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.current = instance;
      instance.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (!active) return;
        if (data.type === "frame") {
          latestFrame.current = data;
          setFrame(data);
          setLoading(false);
          if (
            data.requestId === requestId.current &&
            (runningRef.current || data.requestId === stopRequestId.current)
          )
            setRequestedTick(data.state.tick);
          if (data.state.tick === MAX_TICK) {
            setRunning(false);
            runningRef.current = false;
          }
        } else if (data.type === "error") {
          setError(data.message);
          setLoading(false);
          setRunning(false);
          runningRef.current = false;
        } else if (data.type === "export") setExported(data.run);
        else if (data.requestId === requestId.current)
          setImported({ tick: data.tick, stateDigest: data.stateDigest });
      };
      instance.onerror = () => {
        if (active) {
          setError("시뮬레이션 Worker 실행 오류");
          setLoading(false);
          setRunning(false);
          runningRef.current = false;
        }
      };
      instance.postMessage({
        type: "init",
        sessionId: crypto.randomUUID(),
        snapshot: source,
        scope: scopeRef.current
      } satisfies WorkerRequest);
    };
    void start().catch((cause) => {
      if (active && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "실험 입력 오류");
        setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [
    enabled,
    identityKey,
    identity.worldId,
    identity.revision,
    identity.timeSystemId,
    retry
  ]);
  useEffect(() => {
    send({ type: "scope", scope: JSON.parse(scopeKey) });
  }, [scopeKey, send]);
  const acknowledge = useCallback(
    (committed: Frame) => {
      // A previous Worker may reuse numeric frame IDs after switching modes.
      if (latestFrame.current !== committed) return;
      setPaintedFrame(committed);
      send({ type: "ack", frameId: committed.frameId });
    },
    [send]
  );
  const seek = useCallback(
    (tick: number) => {
      if (!Number.isInteger(tick) || tick < 0 || tick > MAX_TICK) return;
      setRequestedTick(tick);
      setRunning(false);
      runningRef.current = false;
      stopRequestId.current = null;
      setImported(null);
      send({ type: "target", requestId: ++requestId.current, tick });
    },
    [send]
  );
  const play = useCallback(
    (next: boolean) => {
      setRunning(next);
      runningRef.current = next;
      const id = ++requestId.current;
      stopRequestId.current = next ? null : id;
      setImported(null);
      if (!next) setRequestedTick(latestFrame.current?.state.tick ?? 0);
      send({ type: "play", requestId: id, enabled: next });
    },
    [send]
  );
  const configure = useCallback(
    (config: SimulationConfig) => {
      setRequestedTick(0);
      setRunning(false);
      runningRef.current = false;
      setError(null);
      stopRequestId.current = null;
      setImported(null);
      send({ type: "config", requestId: ++requestId.current, config });
    },
    [send]
  );
  const importRun = useCallback(
    (run: unknown) => {
      const tick =
        run && typeof run === "object" && "tick" in run ? run.tick : 0;
      setRequestedTick(
        typeof tick === "number" &&
          Number.isInteger(tick) &&
          tick >= 0 &&
          tick <= MAX_TICK
          ? tick
          : 0
      );
      setRunning(false);
      runningRef.current = false;
      setError(null);
      setImported(null);
      stopRequestId.current = null;
      send({ type: "import", requestId: ++requestId.current, run });
    },
    [send]
  );
  const inspection = useRef<unknown>(null);
  inspection.current = {
    mode: enabled ? "force-v2" : "current",
    requestedTick,
    running,
    loading,
    error,
    source: snapshot
      ? {
          worldId: snapshot.worldId,
          revision: snapshot.sourceRevision,
          digest: snapshot.inputDigest,
          sourceRootDigest: snapshot.sourceRootDigest,
          events: snapshot.events.length
        }
      : null,
    state: frame?.state ?? null,
    paintedState: paintedFrame?.state ?? null,
    stateDigest: paintedFrame ? stateDigest(paintedFrame.state) : null,
    diagnostics: paintedFrame?.diagnostics ?? null,
    imported
  };
  useEffect(() => {
    const inspect = () =>
      window.dispatchEvent(
        new CustomEvent("moirai:layout-v2-inspection", {
          detail: inspection.current
        })
      );
    window.addEventListener("moirai:inspect-layout-v2", inspect);
    return () =>
      window.removeEventListener("moirai:inspect-layout-v2", inspect);
  }, []);
  return {
    enabled,
    choose,
    frame,
    paintedFrame,
    snapshot,
    loading,
    error,
    requestedTick,
    running,
    seek,
    play,
    configure,
    acknowledge,
    retry: () => setRetry((value) => value + 1),
    exportRun: () => send({ type: "export" }),
    exported,
    importRun,
    imported
  };
}
export type GraphForceLab = ReturnType<typeof useGraphForceLab>;
