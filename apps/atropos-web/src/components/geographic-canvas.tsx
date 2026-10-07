"use client";

import { useLayoutEffect, useRef } from "react";
import { pigmentCssColor } from "../lib/spectral-pigment";
import {
  HULL_FEATHER_WIDTH_PX,
  hullFeatherLayers,
  hullLayerOpacity
} from "./hull-feather";
import {
  DEFAULT_COMPOSITE_FILL,
  retainedCompositePaintTransform
} from "../urdr-port/src/components/graph-shell-composite";

type View = { x: number; y: number; scaleX: number; scaleY: number };
type Size = { width: number; height: number };
type Density = { radius: number; strokeWidth: number; opacity: number };
type Point = {
  id: string;
  x: number;
  y: number;
  opacity: number;
  pointDisplay: Density;
  paintView: View;
  paintViewport: Size;
};
type Region = {
  id: string;
  path: string;
  pathTransform?: string;
  paintView?: View;
  paintViewport?: Size;
  renderedOpacity: number;
  surfaceOpacity: number;
  pointDisplay: Density;
  compactPoint?: { x: number; y: number } | null;
  representation?: {
    point?: { x: number; y: number };
    hullOpacity: number;
    hullStrokeOpacity: number;
    hullFillOpacity?: number;
    pointOpacity: number;
  };
};
type Color = { fill: string; label: string };
export type GeographicPainterProps = {
  regions: readonly Region[];
  points: readonly Point[];
  colors: ReadonlyMap<string, Color>;
  view: View;
  size: Size;
  fillOpacity: number;
  strokeOpacity: number;
  onUnavailable: () => void;
  onDraw?: (ms: number) => void;
};
type Props = GeographicPainterProps;
type Tween = { from: number; target: number; value: number; started: number };

// Geometry tolerates a lower raster density than text. SVG retains full-device
// text, interaction and authored DOM identity; only background ink moves here.
const MAX_RASTER_SCALE = 1.5;
// A region keeps at most four feather coats. Preserve the total character
// budget while allowing those coats to remain hot alongside the original.
const MAX_PATHS = 512;
const MAX_PATH_CHARACTERS = 1_000_000;
const CAMERA_BUFFER = 96;
const MAX_BITMAP_PIXELS = 4_000_000;

// Screen coordinates move during a pan, but authored geometry and density do
// not. Compare the paint material in World coordinates, independently of the
// current camera. Tiny alpha changes may share a raster until the next step.
function materialKey(scene: Props) {
  const rounded = (value: number) => Math.round(value * 10_000) / 10_000;
  const alpha = (value: number) => Math.round(value * 64) / 64;
  const world = (point: { x: number; y: number }, view: View, size: Size) => [
    rounded((point.x - size.width / 2 - view.x) / view.scaleX),
    rounded((point.y - size.height / 2 - view.y) / view.scaleY)
  ];
  return JSON.stringify([
    scene.fillOpacity,
    scene.strokeOpacity,
    scene.points.map((point) => [
      point.id,
      world(point, point.paintView, point.paintViewport),
      point.pointDisplay,
      alpha(point.opacity)
    ]),
    scene.regions.map((region) => {
      const view = region.paintView || scene.view;
      const size = region.paintViewport || scene.size;
      const offset = region.pathTransform?.startsWith("translate(")
        ? region.pathTransform
            .slice(10, -1)
            .split(/[,\s]+/)
            .map(Number)
        : [0, 0];
      const point = region.representation?.point ?? region.compactPoint;
      return [
        region.id,
        region.path,
        world({ x: offset[0] || 0, y: offset[1] || 0 }, view, size),
        region.pathTransform?.startsWith("matrix(")
          ? region.pathTransform
          : null,
        point ? world(point, view, size) : null,
        region.pointDisplay,
        alpha(region.renderedOpacity * region.surfaceOpacity),
        region.representation?.hullOpacity,
        region.representation?.hullStrokeOpacity,
        region.representation?.hullFillOpacity,
        region.representation?.pointOpacity,
        scene.colors.get(region.id)
      ];
    })
  ]);
}

export function GeographicCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(props);
  const pathsRef = useRef(new Map<string, Path2D>());
  const tweensRef = useRef(new Map<string, Tween>());
  const frameRef = useRef<number | null>(null);
  const paintRef = useRef<(now: number) => void>(() => {});
  const paletteRef = useRef<{ fill: string; stroke: string } | null>(null);
  const captureRef = useRef<{ view: View; size: Size; key: string } | null>(
    null
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || typeof Path2D === "undefined") {
      props.onUnavailable();
      return;
    }
    sceneRef.current = props;
    const cssWidth = props.size.width + CAMERA_BUFFER * 2;
    const cssHeight = props.size.height + CAMERA_BUFFER * 2;
    const density = Math.min(
      window.devicePixelRatio || 1,
      MAX_RASTER_SCALE,
      Math.sqrt(MAX_BITMAP_PIXELS / Math.max(1, cssWidth * cssHeight))
    );
    const width = Math.max(1, Math.floor(cssWidth * density));
    const height = Math.max(1, Math.floor(cssHeight * density));
    const key = materialKey(props);
    const capture = captureRef.current;
    // Reuse only at the same scale: point radius and stroke stay screen-sized.
    if (
      capture &&
      capture.key === key &&
      capture.size.width === props.size.width &&
      capture.size.height === props.size.height &&
      capture.view.scaleX === props.view.scaleX &&
      capture.view.scaleY === props.view.scaleY &&
      Math.abs(props.view.x - capture.view.x) < CAMERA_BUFFER / 2 &&
      Math.abs(props.view.y - capture.view.y) < CAMERA_BUFFER / 2 &&
      frameRef.current === null
    ) {
      canvas.style.transform = `translate(${props.view.x - capture.view.x - CAMERA_BUFFER}px, ${props.view.y - capture.view.y - CAMERA_BUFFER}px)`;
      canvas.dataset.cameraReuses = String(
        Number(canvas.dataset.cameraReuses || 0) + 1
      );
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (!paletteRef.current) {
      const style = getComputedStyle(canvas);
      paletteRef.current = {
        fill: style.getPropertyValue("--graph-point-fill").trim() || "#1b2330",
        stroke: style.getPropertyValue("--graph-point-stroke").trim() || "#fff"
      };
    }
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const paint = (now: number) => {
      const started = props.onDraw ? performance.now() : 0;
      const scene = sceneRef.current;
      const live = new Set<string>();
      let animating = false;
      const tween = (
        id: string,
        target: number,
        duration: number,
        enter = false
      ) => {
        live.add(id);
        const old = tweensRef.current.get(id);
        const valueAt = (value: Tween) => {
          const t = reducedMotion
            ? 1
            : Math.min(1, Math.max(0, (now - value.started) / duration));
          return value.from + (value.target - value.from) * (1 - (1 - t) ** 3);
        };
        let state = old;
        if (!state)
          state = {
            from: enter ? 0 : target,
            target,
            value: enter ? 0 : target,
            started: now
          };
        else {
          state.value = valueAt(state);
          if (state.target !== target)
            state = {
              from: state.value,
              target,
              value: state.value,
              started: now
            };
        }
        state.value = valueAt(state);
        if (Math.abs(state.value - target) > 0.0001) animating = true;
        tweensRef.current.set(id, state);
        return state.value;
      };
      const transform = (previous?: View, previousSize?: Size) => {
        if (!previous || !previousSize || previous === scene.view) return;
        const numbers = retainedCompositePaintTransform(
          previous,
          previousSize,
          scene.view,
          scene.size
        )
          .slice(7, -1)
          .split(/[,\s]+/)
          .map(Number);
        if (
          numbers.length !== 6 ||
          numbers.some((value) => !Number.isFinite(value))
        )
          throw Error("invalid_graphics_transform");
        context.transform(
          ...(numbers as [number, number, number, number, number, number])
        );
      };
      const path = (d: string) => {
        let value = pathsRef.current.get(d);
        if (value) {
          pathsRef.current.delete(d);
          pathsRef.current.set(d, value);
          return value;
        }
        value = new Path2D(d);
        if (d.length <= MAX_PATH_CHARACTERS) {
          pathsRef.current.set(d, value);
          let characters = 0;
          for (const key of pathsRef.current.keys()) characters += key.length;
          while (
            pathsRef.current.size > MAX_PATHS ||
            characters > MAX_PATH_CHARACTERS
          ) {
            const first = pathsRef.current.keys().next().value!;
            characters -= first.length;
            pathsRef.current.delete(first);
          }
        }
        return value;
      };
      const dot = (
        id: string,
        point: { x: number; y: number },
        display: Density,
        opacity: number,
        fill: string,
        enter: boolean
      ) => {
        const radius = tween(`${id}:radius`, display.radius, 180);
        const stroke = tween(`${id}:stroke`, display.strokeWidth, 180);
        const alpha = tween(
          `${id}:opacity`,
          opacity * display.opacity,
          180,
          enter
        );
        if (alpha <= 0 || radius <= 0) return;
        context.globalAlpha = alpha;
        context.globalCompositeOperation = "source-over";
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = fill;
        context.fill();
        context.strokeStyle = paletteRef.current!.stroke;
        context.lineWidth = stroke;
        context.stroke();
      };
      try {
        context.setTransform(density, 0, 0, density, 0, 0);
        context.clearRect(
          0,
          0,
          canvas.width / density,
          canvas.height / density
        );
        context.globalCompositeOperation = "source-over";
        context.translate(CAMERA_BUFFER, CAMERA_BUFFER);
        for (const region of scene.regions) {
          const color = scene.colors.get(region.id);
          const hullOpacity =
            region.representation?.hullOpacity ?? (region.compactPoint ? 0 : 1);
          const pointOpacity =
            region.representation?.pointOpacity ??
            (region.compactPoint ? 1 : 0);
          const alpha = tween(
            `hull:${region.id}`,
            region.renderedOpacity * region.surfaceOpacity * hullOpacity,
            220
          );
          context.save();
          transform(region.paintView, region.paintViewport);
          if (region.path && alpha > 0) {
            context.save();
            if (region.pathTransform) {
              const numbers = region.pathTransform
                .slice(region.pathTransform.indexOf("(") + 1, -1)
                .split(/[,\s]+/)
                .map(Number);
              if (numbers.some((value) => !Number.isFinite(value)))
                throw Error("invalid_graphics_transform");
              if (
                region.pathTransform.startsWith("translate(") &&
                numbers.length >= 1
              )
                context.translate(numbers[0]!, numbers[1] || 0);
              else if (
                region.pathTransform.startsWith("matrix(") &&
                numbers.length === 6
              )
                context.transform(
                  ...(numbers as [
                    number,
                    number,
                    number,
                    number,
                    number,
                    number
                  ])
                );
              else throw Error("unsupported_graphics_transform");
            }
            const shape = path(region.path);
            context.globalCompositeOperation = "multiply";
            // Match the SVG's paint-order: stroke fill.
            context.globalAlpha =
              alpha *
              scene.strokeOpacity *
              (region.representation?.hullStrokeOpacity ?? 1);
            context.strokeStyle = color?.label || "#7a3a29";
            context.lineWidth = 1.15;
            context.lineJoin = "round";
            context.stroke(shape);
            const fillAlpha =
              alpha *
              scene.fillOpacity *
              (region.representation?.hullFillOpacity ?? 1);
            context.fillStyle = pigmentCssColor(
              color?.fill || DEFAULT_COMPOSITE_FILL
            );
            const matrix = context.getTransform();
            const pathScale =
              Math.max(
                Math.hypot(matrix.a, matrix.b),
                Math.hypot(matrix.c, matrix.d)
              ) / density;
            // Insetting in path space keeps the authored outer contour fixed;
            // compensate retained anisotropic cameras so the widest feather
            // remains 2.4 CSS pixels, independent of the raster density.
            const layers = hullFeatherLayers(
              region.path,
              1 - (region.representation?.hullStrokeOpacity ?? 1),
              HULL_FEATHER_WIDTH_PX / Math.max(0.0001, pathScale)
            );
            for (const layer of layers) {
              context.globalAlpha = hullLayerOpacity(fillAlpha, layer.weight);
              context.fill(path(layer.contours.join(" ")));
            }
            context.restore();
          }
          const point = region.representation?.point ?? region.compactPoint;
          if (point)
            dot(
              `composite:${region.id}`,
              point,
              region.pointDisplay,
              region.renderedOpacity * pointOpacity,
              color?.fill || DEFAULT_COMPOSITE_FILL,
              false
            );
          context.restore();
        }
        for (const point of scene.points) {
          context.save();
          transform(point.paintView, point.paintViewport);
          dot(
            `event:${point.id}`,
            point,
            point.pointDisplay,
            point.opacity,
            paletteRef.current!.fill,
            true
          );
          context.restore();
        }
        for (const id of tweensRef.current.keys())
          if (!live.has(id)) tweensRef.current.delete(id);
        canvas.dataset.paintRevision = String(
          Number(canvas.dataset.paintRevision || 0) + 1
        );
        canvas.dataset.pointCount = String(scene.points.length);
        canvas.dataset.regionCount = String(scene.regions.length);
        canvas.dataset.rasterScale = String(density);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.style.transform = `translate(${-CAMERA_BUFFER}px, ${-CAMERA_BUFFER}px)`;
        captureRef.current = {
          view: scene.view,
          size: scene.size,
          key: materialKey(scene)
        };
        scene.onDraw?.(performance.now() - started);
        if (animating)
          frameRef.current = requestAnimationFrame((t) => {
            frameRef.current = null;
            paintRef.current(t);
          });
      } catch {
        scene.onUnavailable();
      }
    };
    paintRef.current = paint;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    paint(performance.now());
  }, [props]);
  useLayoutEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="geographic-canvas"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        pointerEvents: "none",
        willChange: "transform"
      }}
    />
  );
}
