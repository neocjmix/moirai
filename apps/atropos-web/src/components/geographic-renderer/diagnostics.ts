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

// Only fixed internal reason codes cross the read-only inspection boundary.
// Never publish arbitrary exception messages, paths, stacks or driver logs.
const fallbackReasons = new Set([
  "geographic_path_budget",
  "geographic_vertex_budget",
  "geographic_contour_budget",
  "unsupported_geographic_path",
  "invalid_geographic_path",
  "unsupported_geographic_subpath",
  "unclosed_geographic_path",
  "non_simple_geographic_path",
  "invalid_webgl_paint_frame",
  "webgl2_unavailable",
  "webgl_pigment_float_unavailable",
  "webgl_program_unavailable",
  "webgl_shader_unavailable",
  "webgl_shader_compile",
  "webgl_program_link",
  "webgl_buffer_unavailable",
  "webgl_vertex_array_unavailable",
  "webgl_pigment_framebuffer_unavailable",
  "webgl_pigment_texture_unavailable",
  "webgl_pigment_resolve_incomplete",
  "webgl_pigment_framebuffer_incomplete",
  "webgl_palette_unavailable",
  "webgl_context_lost",
  "webgl_mesh_budget",
  "webgl_scene_budget",
  "webgl_pigment_blend_unavailable"
]);
export function rendererFallbackReason(reason: unknown): string {
  return reason instanceof Error && fallbackReasons.has(reason.message)
    ? reason.message
    : "gpu-unavailable";
}
