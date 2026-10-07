"use client";

import { useSyncExternalStore } from "react";
import type { GeographicRendererStats } from "./contract";
import type { RendererId } from "./preferences";

export type RendererDiagnostics = GeographicRendererStats & {
  renderer: RendererId | "svg";
  state: "loading" | "ready" | "fallback";
  cpuMs?: number;
  frameIntervalMs?: number | undefined;
  fallback?: string | undefined;
};
let snapshot: RendererDiagnostics | null = null;
const listeners = new Set<() => void>();
export function publishRendererDiagnostics(value: RendererDiagnostics) {
  snapshot = value;
  for (const listener of listeners) listener();
}
export function useRendererDiagnostics() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => null
  );
}
