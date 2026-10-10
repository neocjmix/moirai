"use client";

import { useLayoutEffect, useRef } from "react";
import type { GeographicPainterProps } from "../geographic-canvas";
import type {
  GeographicRendererBackend,
  GeographicRenderFrame
} from "./contract";
import { createBaselineBackend } from "./baseline-backend";
import { publishRendererDiagnostics } from "./diagnostics";
import type { LiveCamera } from "./live-camera";

type Props = GeographicPainterProps & {
  liveCamera: LiveCamera;
};

async function createBackend(canvas: HTMLCanvasElement) {
  return createBaselineBackend(canvas);
}

function BackendCanvas(props: Props & { onFailure: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  const requestPaint = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    // Each effect owns a distinct canvas. StrictMode replay and a late async
    // factory can dispose their own context without destroying a newer mount.
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.dataset.testid = "geographic-webgl";
    canvas.dataset.renderer = "custom-webgl2";
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
      renderer: "custom-webgl2",
      state: "loading"
    });
    const paint = (now: number) => {
      raf = null;
      if (!backend || disposed || failed) return;
      const current = propsRef.current;
      const start = performance.now();
      const frame: GeographicRenderFrame = {
        now
      };
      try {
        const active = backend.render(
          {
            ...current,
            sceneCamera: current.view,
            view: current.liveCamera.get()
          },
          frame
        );
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
        canvas.dataset.renderer = "custom-webgl2";
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
        if (samples === 1 || now - lastReport >= 500) {
          lastReport = now;
          publishRendererDiagnostics({
            ...stats,
            renderer: "custom-webgl2",
            state: "ready",
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
    void createBackend(canvas)
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

  useLayoutEffect(
    () => props.liveCamera.subscribe(() => requestPaint.current()),
    [props.liveCamera]
  );

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

/** Persistent production canvas, with independent live-camera and scene input. */
export function GeographicRenderer(props: Props) {
  return (
    <BackendCanvas
      {...props}
      onFailure={() => {
        publishRendererDiagnostics({
          renderer: "svg",
          state: "fallback",
          fallback: "gpu-unavailable"
        });
        props.onUnavailable();
      }}
    />
  );
}
