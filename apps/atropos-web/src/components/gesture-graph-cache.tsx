"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type View = { x: number; y: number; scaleX: number; scaleY: number };
type Size = { width: number; height: number };
type Props = {
  surface: RefObject<SVGSVGElement | null>;
  view: View;
  size: Size;
  active: boolean;
  owner: object;
  selection: string;
};
type Capture = { view: View; size: Size };
const BUFFER = 96;
const REFRESH_MS = 200;
const MAX_PIXELS = 4_000_000;
const PAINT_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "paint-order",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "visibility"
] as const;

/** Keep the native semantic SVG live for input and idle reading. During camera
 * gestures, reuse bounded raster frames rather than rerasterizing the complete
 * native-density SVG on every update. Two frames crossfade in World alignment.
 * Nothing here owns identity, LOD, layout, selection or Publication data.
 */
export function GestureGraphCache(props: Props) {
  const layers = [
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLCanvasElement>(null)
  ];
  const latest = useRef(props);
  const engine = useRef<{
    update: () => void;
    request: () => void;
  } | null>(null);

  useLayoutEffect(() => {
    let disposed = false;
    let disabled = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let url: string | null = null;
    let image: HTMLImageElement | null = null;
    let front = -1;
    let lastCapture = -Infinity;
    let requested = 0;
    let completed = -1;
    const captures: (Capture | null)[] = [null, null];
    const svg = props.surface.current;
    const backdrop = svg?.parentElement?.querySelector<HTMLCanvasElement>(
      '[data-testid="geographic-canvas"]'
    );
    const originalOpacity = svg?.style.opacity || "";
    const originalVisibility = backdrop?.style.visibility || "";
    if (!svg || !backdrop) return;

    const restore = () => {
      svg.style.opacity = originalOpacity;
      backdrop.style.visibility = originalVisibility;
      for (const ref of layers)
        if (ref.current) ref.current.style.display = "none";
      svg.dataset.gestureCache = "native";
    };
    const align = () => {
      const scene = latest.current;
      const valid =
        front >= 0 &&
        captures[front]?.size.width === scene.size.width &&
        captures[front]?.size.height === scene.size.height;
      if (!scene.active || !valid || disabled) {
        restore();
        return;
      }
      const current = captures[front]!;
      const scaleX = scene.view.scaleX / current.view.scaleX;
      const scaleY = scene.view.scaleY / current.view.scaleY;
      const left =
        scene.size.width / 2 +
        scene.view.x -
        scaleX * (current.size.width / 2 + current.view.x + BUFFER);
      const top =
        scene.size.height / 2 +
        scene.view.y -
        scaleY * (current.size.height / 2 + current.view.y + BUFFER);
      // A rapid pan/zoom may outrun the bounded bitmap. Reveal the current
      // native scene immediately until a replacement covers the new view.
      if (
        left > 0 ||
        top > 0 ||
        left + scaleX * (current.size.width + BUFFER * 2) < scene.size.width ||
        top + scaleY * (current.size.height + BUFFER * 2) < scene.size.height
      ) {
        restore();
        return;
      }
      for (let i = 0; i < layers.length; i++) {
        const canvas = layers[i]!.current;
        const capture = captures[i];
        if (!canvas || !capture) continue;
        const sx = scene.view.scaleX / capture.view.scaleX;
        const sy = scene.view.scaleY / capture.view.scaleY;
        const tx =
          scene.size.width / 2 +
          scene.view.x -
          sx * (capture.size.width / 2 + capture.view.x + BUFFER);
        const ty =
          scene.size.height / 2 +
          scene.view.y -
          sy * (capture.size.height / 2 + capture.view.y + BUFFER);
        canvas.style.transform = `matrix(${sx},0,0,${sy},${tx},${ty})`;
        canvas.style.display = "block";
      }
      svg.style.opacity = "0";
      backdrop.style.visibility = "hidden";
      svg.dataset.gestureCache = "raster";
      svg.dataset.gestureCacheUpdates = String(
        Number(svg.dataset.gestureCacheUpdates || 0) + 1
      );
    };
    const schedule = () => {
      if (
        disposed ||
        disabled ||
        busy ||
        timer !== null ||
        completed === requested
      )
        return;
      timer = setTimeout(
        capture,
        Math.max(0, REFRESH_MS - (performance.now() - lastCapture))
      );
    };
    const capture = () => {
      timer = null;
      if (disposed || disabled || busy) return;
      const scene = latest.current;
      if (scene.size.width <= 0 || scene.size.height <= 0) return;
      const version = requested;
      const width = scene.size.width + BUFFER * 2;
      const height = scene.size.height + BUFFER * 2;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        Math.sqrt(MAX_PIXELS / (width * height))
      );
      const started = performance.now();
      try {
        const next = (front + 1) % 2;
        const canvas = layers[next]!.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          fail();
          return;
        }
        captures[next] = null;
        canvas.style.display = "none";
        canvas.style.opacity = "0";
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        // Copy background and SVG from the same committed camera, before the
        // asynchronous SVG decode can race with a newer camera/render frame.
        const svgRect = svg.getBoundingClientRect();
        const backgroundRect = backdrop.getBoundingClientRect();
        context.drawImage(
          backdrop,
          (backgroundRect.left - svgRect.left + BUFFER) * ratio,
          (backgroundRect.top - svgRect.top + BUFFER) * ratio,
          backgroundRect.width * ratio,
          backgroundRect.height * ratio
        );
        const copy = svg.cloneNode(true) as SVGSVGElement;
        const originals = svg.querySelectorAll<SVGElement>("*");
        const copies = copy.querySelectorAll<SVGElement>("*");
        for (let i = 0; i < originals.length; i++) {
          const source = originals[i]!;
          const target = copies[i]!;
          const name = source.getAttribute("class") || "";
          // Background ink already comes from the geographic Canvas; remove
          // empty ink and transparent hit geometry from the image, not the DOM.
          if (
            (/chartCompositeRegion(?:\s|$|_)/.test(name) &&
              source.tagName === "path") ||
            source.tagName === "circle" ||
            name.includes("chartInstantPointHitTarget") ||
            name.includes("chartBackdrop")
          ) {
            target.remove();
            continue;
          }
          const style = getComputedStyle(source);
          for (const property of PAINT_PROPERTIES)
            target.style.setProperty(
              property,
              style.getPropertyValue(property)
            );
          target.style.setProperty("transition", "none");
          target.style.setProperty("animation", "none");
          if (source.tagName === "line" && /chartGrid|chartAnchor/.test(name)) {
            const x1 = Number(source.getAttribute("x1"));
            const x2 = Number(source.getAttribute("x2"));
            const y1 = Number(source.getAttribute("y1"));
            const y2 = Number(source.getAttribute("y2"));
            if (y1 === y2) {
              target.setAttribute("x1", String(-BUFFER));
              target.setAttribute("x2", String(scene.size.width + BUFFER));
            }
            if (x1 === x2) {
              target.setAttribute("y1", String(-BUFFER));
              target.setAttribute("y2", String(scene.size.height + BUFFER));
            }
          }
        }
        copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        copy.setAttribute(
          "viewBox",
          `${-BUFFER} ${-BUFFER} ${width} ${height}`
        );
        copy.setAttribute("width", String(Math.floor(width * ratio)));
        copy.setAttribute("height", String(Math.floor(height * ratio)));
        copy.style.cssText = "opacity:1;visibility:visible";
        url = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(copy)], {
            type: "image/svg+xml"
          })
        );
        svg.dataset.gesturePreparationCalls = String(
          Number(svg.dataset.gesturePreparationCalls || 0) + 1
        );
        svg.dataset.gesturePreparationMs = String(
          Number(svg.dataset.gesturePreparationMs || 0) +
            performance.now() -
            started
        );
        busy = true;
        lastCapture = performance.now();
        image = new Image();
        image.onload = () => {
          if (disposed) return;
          if (!image) {
            fail();
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          canvas.dataset.rasterScale = String(ratio);
          canvas.dataset.captures = String(
            Number(canvas.dataset.captures || 0) + 1
          );
          canvas.dataset.captureMs = String(performance.now() - started);
          captures[next] = { view: scene.view, size: scene.size };
          canvas.style.transition = "none";
          canvas.style.opacity = front < 0 ? "1" : "0";
          canvas.style.display = "block";
          // Commit the replacement at zero before beginning its crossfade.
          void canvas.offsetWidth;
          canvas.style.transition =
            matchMedia("(prefers-reduced-motion: reduce)").matches ||
            !CSS.supports("mix-blend-mode", "plus-lighter")
              ? "none"
              : "opacity 160ms linear";
          canvas.style.opacity = "1";
          if (front >= 0) layers[front]!.current!.style.opacity = "0";
          front = next;
          completed = version;
          release();
          align();
          schedule();
        };
        image.onerror = fail;
        image.src = url;
      } catch {
        fail();
      }
    };
    const release = () => {
      if (url) URL.revokeObjectURL(url);
      url = null;
      image = null;
      busy = false;
    };
    const fail = () => {
      disabled = true;
      release();
      restore();
      svg.dataset.gestureCache = "unavailable";
    };
    engine.current = {
      update: align,
      request: () => {
        requested++;
        schedule();
      }
    };
    engine.current.request();
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
      release();
      restore();
      engine.current = null;
      for (const ref of layers)
        if (ref.current) {
          ref.current.width = 0;
          ref.current.height = 0;
        }
    };
    // Each workspace owns its frames, matching the underlying live SVG.
  }, [props.owner, props.selection]);

  useLayoutEffect(() => {
    latest.current = props;
    engine.current?.update();
    engine.current?.request();
  });
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        isolation: "isolate"
      }}
    >
      {layers.map((ref, i) => (
        <canvas
          key={i}
          ref={ref}
          aria-hidden="true"
          data-testid="gesture-graph-cache"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 2,
            pointerEvents: "none",
            display: "none",
            transformOrigin: "0 0",
            willChange: "transform, opacity",
            mixBlendMode: "plus-lighter"
          }}
        />
      ))}
    </div>
  );
}
