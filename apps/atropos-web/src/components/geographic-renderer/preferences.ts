"use client";

import { useSyncExternalStore } from "react";

export type RendererId = "custom-webgl2" | "pixi" | "three";
export type RendererPreferences = Readonly<{
  renderer: RendererId;
  edge: "native" | "hard";
  diagnostics: boolean;
}>;
const KEY = "moirai.renderer.v1";
const EVENT = "moirai-renderer-preferences";
const defaults: RendererPreferences = {
  renderer: "custom-webgl2",
  edge: "native",
  diagnostics: false
};
let cached: RendererPreferences = defaults;
let initialized = false;

function isRenderer(value: unknown): value is RendererId {
  return value === "custom-webgl2" || value === "pixi" || value === "three";
}

function read() {
  if (typeof window === "undefined" || initialized) return cached;
  initialized = true;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (stored && isRenderer(stored.renderer))
      cached = {
        renderer: stored.renderer,
        edge: stored.edge === "hard" ? "hard" : "native",
        diagnostics: stored.diagnostics === true
      };
  } catch {
    // Local preference storage is optional (including private browsing).
  }
  const query = new URLSearchParams(window.location.search);
  const renderer = query.get("gsRenderer");
  if (isRenderer(renderer)) cached = { ...cached, renderer };
  else if (query.get("gsGraphics") === "webgl")
    cached = { ...cached, renderer: "custom-webgl2" };
  return cached;
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  const storage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    initialized = false;
    listener();
  };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", storage);
  };
}

export function useRendererPreferences() {
  return useSyncExternalStore(subscribe, read, () => defaults);
}

export function setRendererPreferences(patch: Partial<RendererPreferences>) {
  cached = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // The current session still supports renderer switching without storage.
  }
  if (patch.renderer) {
    const url = new URL(window.location.href);
    url.searchParams.set("gsRenderer", patch.renderer);
    // A deliberate user choice also exits the legacy forced SVG/Canvas mode.
    url.searchParams.delete("gsGraphics");
    window.history.replaceState(window.history.state, "", url);
  }
  window.dispatchEvent(new Event(EVENT));
}
