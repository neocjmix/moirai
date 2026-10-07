"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { GeographicPainterProps } from "../geographic-canvas";
import type {
  GeographicRendererBackend,
  GeographicRenderFrame
} from "./contract";
import { createBaselineBackend } from "./baseline-backend";
import { parseGeographicColor } from "./scene";
import { publishRendererDiagnostics } from "./diagnostics";
import type { RendererId } from "./preferences";

type Props = GeographicPainterProps & {
  renderer: RendererId;
  edge: "native" | "hard";
  onBackendChange: (renderer: RendererId) => void;
};

async function createBackend(renderer: RendererId, canvas: HTMLCanvasElement) {
  if (renderer === "pixi")
    return (await import("./pixi-backend")).createPixiBackend(canvas);
  if (renderer === "three")
    return (await import("./three-backend")).createThreeBackend(canvas);
  return createBaselineBackend(canvas);
}

function BackendCanvas(
  props: Props & { fallback?: string | undefined; onFailure: () => void }
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const requestPaint = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    // Each effect owns a distinct canvas. StrictMode replay and a late async
    // factory can dispose their own context without destroying a newer mount.
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.dataset.testid =
      props.renderer === "custom-webgl2"
        ? "geographic-webgl"
        : `geographic-${props.renderer}`;
    canvas.dataset.renderer = props.renderer;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.width = `${props.size.width}px`;
    canvas.style.height = `${props.size.height}px`;
    canvas.style.display = "block";
    containerRef.current!.appendChild(canvas);
    let disposed = false;
    let failed = false;
    let backend: GeographicRendererBackend | undefined;
    let raf: number | null = null;
    let previousTime = 0;
    let lastReport = 0;
    let averageCpu = 0;
    let averageInterval: number | undefined;
    let samples = 0;
    const style = getComputedStyle(canvas);
    const palette = {
      pointFill: parseGeographicColor(
        style.getPropertyValue("--graph-point-fill").trim() || "#1b2330"
      ),
      pointStroke: parseGeographicColor(
        style.getPropertyValue("--graph-point-stroke").trim() || "#fff"
      )
    };
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      if (raf !== null) cancelAnimationFrame(raf);
      propsRef.current.onFailure();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    canvas.addEventListener("webglcontextlost", lost);
    publishRendererDiagnostics({
      renderer: props.renderer,
      state: "loading",
      fallback: props.fallback
    });
    const paint = (now: number) => {
      raf = null;
      if (!backend || disposed || failed) return;
      const current = propsRef.current;
      const start = performance.now();
      const frame: GeographicRenderFrame = {
        now,
        dpr: window.devicePixelRatio || 1,
        reducedMotion: reducedMotion.matches,
        ...palette,
        edgeStrategy: current.edge
      };
      try {
        const active = backend.render(current, frame);
        const cpu = performance.now() - start;
        current.onDraw?.(cpu);
        averageCpu = samples ? averageCpu * 0.85 + cpu * 0.15 : cpu;
        const interval = now - previousTime;
        // Idle gaps are not frames. No perpetual RAF/React loop for diagnostics.
        if (previousTime && interval > 0 && interval < 250)
          averageInterval =
            averageInterval === undefined
              ? interval
              : averageInterval * 0.85 + interval * 0.15;
        previousTime = now;
        samples++;
        const stats = backend.stats();
        canvas.dataset.renderer = current.renderer;
        canvas.dataset.regionCount = String(
          stats.hullCount ?? current.regions.length
        );
        canvas.dataset.pointCount = String(
          stats.pointCount ?? current.points.length
        );
        if (stats.meshBuilds !== undefined)
          canvas.dataset.meshBuilds = String(stats.meshBuilds);
        if (stats.bufferUploads !== undefined)
          canvas.dataset.bufferUploads = String(stats.bufferUploads);
        if (stats.drawCalls !== undefined)
          canvas.dataset.drawCalls = String(stats.drawCalls);
        if (current.renderer !== "custom-webgl2") {
          canvas.dataset.pigmentMode = "normalized-optical-density";
          canvas.dataset.edgeMode =
            current.edge === "hard" ? "hard" : "gpu-gaussian";
          canvas.dataset.paintRevision = String(samples);
        }
        if (samples === 1 || now - lastReport >= 500) {
          lastReport = now;
          publishRendererDiagnostics({
            ...stats,
            renderer: current.renderer,
            state: current.fallback ? "fallback" : "ready",
            fallback: current.fallback,
            cpuMs: averageCpu,
            frameIntervalMs: averageInterval
          });
        }
        if (active) raf = requestAnimationFrame(paint);
      } catch {
        fail();
      }
    };
    requestPaint.current = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      paint(performance.now());
    };
    void createBackend(props.renderer, canvas)
      .then((value) => {
        if (disposed) {
          value.dispose();
          canvas
            .getContext("webgl2")
            ?.getExtension("WEBGL_lose_context")
            ?.loseContext();
          return;
        }
        backend = value;
        propsRef.current.onBackendChange(props.renderer);
        paint(performance.now());
      })
      .catch(fail);
    return () => {
      disposed = true;
      requestPaint.current = () => {};
      canvas.removeEventListener("webglcontextlost", lost);
      if (raf !== null) cancelAnimationFrame(raf);
      backend?.dispose();
      // A disposed canvas must not retain a browser context across switches.
      canvas
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
      canvas.width = canvas.height = 0;
      canvas.remove();
      if (canvasRef.current === canvas) canvasRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    propsRef.current = props;
    if (canvasRef.current) {
      canvasRef.current.style.width = `${props.size.width}px`;
      canvasRef.current.style.height = `${props.size.height}px`;
    }
    requestPaint.current();
  }, [props]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: props.size.width,
        height: props.size.height,
        zIndex: 1,
        pointerEvents: "none"
      }}
    />
  );
}

/** Only this canvas remounts. GraphShell, World, selection and SVG remain live. */
export function GeographicRenderer(props: Props) {
  const [fallback, setFallback] = useState(false);
  const renderer = fallback ? "custom-webgl2" : props.renderer;
  return (
    <BackendCanvas
      {...props}
      key={renderer}
      renderer={renderer}
      fallback={fallback ? `${props.renderer}-unavailable` : undefined}
      onFailure={() => {
        if (renderer !== "custom-webgl2") setFallback(true);
        else {
          publishRendererDiagnostics({
            renderer: "svg",
            state: "fallback",
            fallback: "gpu-unavailable"
          });
          props.onUnavailable();
        }
      }}
    />
  );
}
