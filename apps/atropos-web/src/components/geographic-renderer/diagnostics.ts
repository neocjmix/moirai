"use client";

import type { GeographicRendererStats } from "./contract";

export type RendererDiagnostics = GeographicRendererStats & {
  renderer: "custom-webgl2" | "svg";
  state: "loading" | "ready" | "fallback";
  cpuMs?: number;
  frameIntervalMs?: number | undefined;
  fallback?: string | undefined;
};
let snapshot: RendererDiagnostics | null = null;
export function publishRendererDiagnostics(value: RendererDiagnostics) {
  snapshot = value;
}
export function inspectRendererDiagnostics() {
  return snapshot;
}
