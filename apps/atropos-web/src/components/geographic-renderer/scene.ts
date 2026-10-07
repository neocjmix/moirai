import { geographicMesh } from "../geographic-mesh";
import {
  geographicMeshFrame,
  geographicPaintTransform,
  geographicPathControls,
  geographicTweenValue,
  reusableGeographicPaintTransform,
  type GeographicMeshFrame,
  type GeographicPathControls
} from "../geographic-mesh-reuse";
import type {
  GeographicGeometry,
  GeographicPreparedHull,
  GeographicPreparedPoint,
  GeographicPreparedScene,
  GeographicRenderFrame,
  GeographicRenderScene,
  GeographicSize,
  GeographicView,
  Rgba
} from "./contract";

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

/** The graph palette is controlled CSS, so parsing never needs pixel readback. */
export function parseGeographicColor(css: string): Rgba {
  const hex = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(css.trim());
  if (hex) {
    const value =
      hex[1]!.length === 3
        ? [...hex[1]!].map((digit) => digit + digit).join("")
        : hex[1]!;
    return [
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255,
      value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(css.trim());
  if (rgb) {
    const values = rgb[1]!.split(/[\s,/]+/).filter(Boolean);
    if (values.length === 3 || values.length === 4) {
      const channels = values.map((value, index) => {
        const n = parseFloat(value);
        return clamp(value.endsWith("%") ? n / 100 : index < 3 ? n / 255 : n);
      });
      if (channels.every(Number.isFinite))
        return [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1];
    }
  }
  const hsl =
    /^hsla?\(\s*([-+\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+)(%)?)?\s*\)$/i.exec(
      css.trim()
    );
  if (hsl) {
    const hue = ((Number(hsl[1]) % 360) + 360) % 360;
    const saturation = clamp(Number(hsl[2]) / 100);
    const lightness = clamp(Number(hsl[3]) / 100);
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    const channel = (offset: number) => {
      const k = (offset + hue / 30) % 12;
      return lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [
      channel(0),
      channel(8),
      channel(4),
      hsl[4] === undefined ? 1 : clamp(Number(hsl[4]) / (hsl[5] ? 100 : 1))
    ];
  }
  if (css.trim() === "white") return [1, 1, 1, 1];
  if (css.trim() === "black") return [0, 0, 0, 1];
  if (css.trim() === "transparent") return [0, 0, 0, 0];
  throw Error("unsupported_geographic_palette_color");
}

type MeshEntry = {
  path: string;
  frame: GeographicMeshFrame;
  controls: GeographicPathControls | null;
  requestedPath: string;
  requestedControls: GeographicPathControls | null;
  geometry: GeographicGeometry;
};
type Tween = { from: number; target: number; start: number };

/** Shared preparation owns representation fades and cached triangulation, not
 * an engine's buffers or effects. Pan changes camera/transforms only. Native
 * backends choose pigment and edge algorithms independently of this geometry. */
export function createScenePreparer() {
  const meshes = new Map<string, MeshEntry>();
  const tweens = new Map<string, Tween>();
  const palette = new Map<string, Rgba>();
  const positions = new Map<string, Readonly<{ x: number; y: number }>>();
  let meshBuilds = 0;
  const color = (css: string) => {
    const old = palette.get(css);
    if (old) return old;
    const parsed = parseGeographicColor(css);
    if (palette.size >= 256) palette.delete(palette.keys().next().value!);
    palette.set(css, parsed);
    return parsed;
  };
  return {
    prepare(
      scene: GeographicRenderScene,
      frame: GeographicRenderFrame
    ): GeographicPreparedScene {
      if (
        ![
          scene.view.x,
          scene.view.y,
          scene.view.scaleX,
          scene.view.scaleY,
          scene.size.width,
          scene.size.height,
          frame.now
        ].every(Number.isFinite) ||
        scene.view.scaleX <= 0 ||
        scene.view.scaleY <= 0 ||
        scene.size.width < 0 ||
        scene.size.height < 0
      )
        throw Error("invalid_geographic_frame");
      const liveTweens = new Set<string>();
      const liveMeshes = new Set<string>();
      const livePoints = new Set<string>();
      let animating = false;
      const tween = (
        id: string,
        target: number,
        duration: number,
        enter = false
      ) => {
        liveTweens.add(id);
        const valueAt = (value: Tween) =>
          geographicTweenValue(
            value.from,
            value.target,
            frame.reducedMotion ? 1 : (frame.now - value.start) / duration
          );
        let value = tweens.get(id);
        if (!value)
          value = { from: enter ? 0 : target, target, start: frame.now };
        else if (value.target !== target)
          value = { from: valueAt(value), target, start: frame.now };
        tweens.set(id, value);
        const result = valueAt(value);
        if (Math.abs(result - target) > 0.0001) animating = true;
        return result;
      };
      const points: GeographicPreparedPoint[] = [];
      const addPoint = (
        id: string,
        point: Readonly<{ x: number; y: number }>,
        display: Readonly<{
          radius: number;
          strokeWidth: number;
          opacity: number;
        }>,
        opacity: number,
        fill: Rgba,
        view: GeographicView,
        size: GeographicSize,
        enter = false
      ) => {
        livePoints.add(id);
        const radius = tween(id + ":radius", display.radius, 180);
        const strokeWidth = tween(id + ":stroke", display.strokeWidth, 180);
        const alpha = tween(
          id + ":alpha",
          opacity * display.opacity,
          180,
          enter
        );
        if (alpha <= 0 || radius <= 0) return;
        const world = {
          x: (point.x - size.width / 2 - view.x) / view.scaleX,
          y: (point.y - size.height / 2 - view.y) / view.scaleY
        };
        const previous = positions.get(id);
        // Undoing a screen transform may introduce floating-point roundoff.
        // Keep the same stable World position below an invisible screen error.
        const position =
          previous &&
          Math.abs((world.x - previous.x) * scene.view.scaleX) < 0.00001 &&
          Math.abs((world.y - previous.y) * scene.view.scaleY) < 0.00001
            ? previous
            : world;
        positions.set(id, position);
        points.push({
          id,
          ...position,
          radius,
          strokeWidth,
          opacity: alpha,
          fill
        });
      };
      const hulls: GeographicPreparedHull[] = [];
      for (const region of scene.regions) {
        const regionColor = scene.colors.get(region.id);
        const fill = color(regionColor?.fill ?? "rgb(214, 120, 92)");
        const stroke = color(regionColor?.label ?? "#7a3a29");
        const alpha = tween(
          "hull:" + region.id,
          region.renderedOpacity *
            region.surfaceOpacity *
            (region.representation?.hullOpacity ??
              (region.compactPoint ? 0 : 1)),
          220
        );
        const fillOpacity = clamp(
          fill[3] *
            alpha *
            scene.fillOpacity *
            (region.representation?.hullFillOpacity ?? 1),
          0,
          0.9999
        );
        const border = region.representation?.hullStrokeOpacity ?? 1;
        const strokeOpacity = clamp(
          stroke[3] * alpha * scene.strokeOpacity * border
        );
        if (region.path && (fillOpacity > 0 || strokeOpacity > 0)) {
          liveMeshes.add(region.id);
          const anchor = geographicMeshFrame(
            region.paintView ?? scene.view,
            region.paintViewport ?? scene.size,
            region.pathTransform
          );
          const currentTransform =
            anchor && geographicPaintTransform(anchor, scene.view, scene.size);
          if (!anchor || !currentTransform)
            throw Error("invalid_geographic_mesh_frame");
          let entry = meshes.get(region.id);
          let transform = currentTransform;
          let reusable = false;
          if (entry) {
            if (entry.requestedPath !== region.path) {
              entry.requestedPath = region.path;
              entry.requestedControls = geographicPathControls(region.path);
            }
            const retained = reusableGeographicPaintTransform(
              entry.path,
              region.path,
              entry.controls,
              entry.requestedControls,
              geographicPaintTransform(entry.frame, scene.view, scene.size),
              currentTransform
            );
            if (retained) {
              reusable = true;
              transform = retained;
            }
          }
          if (!entry || !reusable) {
            const mesh = geographicMesh(region.path);
            const coordinates = new Float32Array((mesh.fill.length / 5) * 2);
            for (let index = 0; index < mesh.fill.length / 5; index++) {
              coordinates[index * 2] = mesh.fill[index * 5]!;
              coordinates[index * 2 + 1] = mesh.fill[index * 5 + 1]!;
            }
            const controls =
              entry?.requestedPath === region.path
                ? entry.requestedControls
                : geographicPathControls(region.path);
            entry = {
              path: region.path,
              frame: anchor,
              controls,
              requestedPath: region.path,
              requestedControls: controls,
              geometry: {
                key: `${region.id}:${++meshBuilds}`,
                fill: coordinates,
                stroke: mesh.stroke
              }
            };
            meshes.set(region.id, entry);
          }
          hulls.push({
            id: region.id,
            geometry: entry.geometry,
            transform,
            fill,
            stroke,
            fillOpacity,
            strokeOpacity,
            softness: frame.edgeStrategy === "hard" ? 0 : 1 - clamp(border)
          });
        }
        const point = region.representation?.point ?? region.compactPoint;
        if (point)
          addPoint(
            "composite:" + region.id,
            point,
            region.pointDisplay,
            region.renderedOpacity *
              (region.representation?.pointOpacity ??
                (region.compactPoint ? 1 : 0)),
            fill,
            region.paintView ?? scene.view,
            region.paintViewport ?? scene.size
          );
      }
      for (const point of scene.points)
        addPoint(
          "event:" + point.id,
          point,
          point.pointDisplay,
          point.opacity,
          frame.pointFill,
          point.paintView,
          point.paintViewport,
          true
        );
      for (const key of meshes.keys())
        if (!liveMeshes.has(key)) meshes.delete(key);
      for (const key of tweens.keys())
        if (!liveTweens.has(key)) tweens.delete(key);
      for (const key of positions.keys())
        if (!livePoints.has(key)) positions.delete(key);
      return {
        hulls,
        points,
        camera: [
          scene.view.scaleX,
          scene.view.scaleY,
          scene.size.width / 2 + scene.view.x,
          scene.size.height / 2 + scene.view.y
        ],
        animating,
        meshBuilds
      };
    },
    dispose() {
      meshes.clear();
      tweens.clear();
      palette.clear();
      positions.clear();
    }
  };
}
