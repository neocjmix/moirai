"use client";

import { useLayoutEffect, useRef } from "react";
import type { GeographicPainterProps } from "./geographic-canvas";
import { geographicMesh } from "./geographic-mesh";

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
layout(location=1) in vec2 neighbor;
layout(location=2) in float side;
uniform vec4 camera;
uniform vec2 viewport;
uniform float thickness;
void main() {
  vec2 p=position*camera.xy+camera.zw;
  vec2 delta=(neighbor-position)*camera.xy;
  if(side!=0.0) p+=vec2(-delta.y,delta.x)/max(length(delta),0.00001)*side*thickness*.5;
  gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}`;
const fragment = `#version 300 es
precision mediump float;
uniform vec4 color;
out vec4 result;
void main(){result=vec4(color.rgb*color.a,color.a);}`;
const dotVertex = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec2 center;
layout(location=2) in vec3 display;
layout(location=3) in vec4 ink;
uniform vec2 viewport;
out vec2 local;
out vec3 density;
out vec4 paint;
void main(){
  float extent=display.x+display.y*.5+1.;
  local=corner*extent; density=display; paint=ink;
  vec2 p=center+local;
  gl_Position=vec4(p/viewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}`;
const dotFragment = `#version 300 es
precision mediump float;
in vec2 local;
in vec3 density;
in vec4 paint;
uniform vec4 border;
out vec4 result;
void main(){
  float distance=length(local);
  float outer=1.-smoothstep(density.x+density.y*.5-.5,density.x+density.y*.5+.5,distance);
  float inside=1.-smoothstep(density.x-density.y*.5-.5,density.x-density.y*.5+.5,distance);
  vec4 ink=mix(border,paint,inside);
  float alpha=ink.a*outer*density.z;
  result=vec4(ink.rgb*alpha,alpha);
}`;

function createPainter(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true
  });
  if (!gl) throw Error("webgl2_unavailable");
  const programs: WebGLProgram[] = [],
    buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const program = (vs: string, fs: string) => {
    const result = gl.createProgram();
    if (!result) throw Error("webgl_program_unavailable");
    programs.push(result);
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs]
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw Error("webgl_shader_unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error("webgl_shader_compile");
      gl.attachShader(result, shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS))
      throw Error("webgl_program_link");
    return result;
  };
  const buffer = (data: Float32Array) => {
    const result = gl.createBuffer();
    if (!result) throw Error("webgl_buffer_unavailable");
    buffers.push(result);
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return result;
  };
  const dispose = () => {
    for (const value of buffers) gl.deleteBuffer(value);
    for (const value of shaders) gl.deleteShader(value);
    for (const value of programs) gl.deleteProgram(value);
    cache.clear();
    tweens.clear();
    palette.clear();
  };
  type Mesh = {
    path: string;
    fill: WebGLBuffer;
    stroke: WebGLBuffer;
    fillCount: number;
    strokeCount: number;
    bytes: number;
  };
  const cache = new Map<string, Mesh>();
  let meshBuilds = 0;
  let meshReuses = 0;
  const tweens = new Map<
    string,
    { from: number; target: number; start: number }
  >();
  const palette = new Map<string, number[]>();
  try {
    const hullProgram = program(vertex, fragment),
      pointProgram = program(dotVertex, dotFragment);
    const corners = buffer(
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    );
    const instances = buffer(new Float32Array());
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d");
    if (!colorContext) throw Error("webgl_palette_unavailable");
    const color = (css: string) => {
      const old = palette.get(css);
      if (old) return old;
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = css;
      colorContext.fillRect(0, 0, 1, 1);
      const value = Array.from(
        colorContext.getImageData(0, 0, 1, 1).data,
        (n) => n / 255
      );
      if (palette.size >= 128) palette.delete(palette.keys().next().value!);
      palette.set(css, value);
      return value;
    };
    const uniforms = (p: WebGLProgram) => ({
      size: gl.getUniformLocation(p, "viewport"),
      camera: gl.getUniformLocation(p, "camera"),
      color: gl.getUniformLocation(p, "color"),
      thickness: gl.getUniformLocation(p, "thickness"),
      border: gl.getUniformLocation(p, "border")
    });
    const hu = uniforms(hullProgram),
      pu = uniforms(pointProgram);
    const style = getComputedStyle(canvas);
    const pointFill = color(
      style.getPropertyValue("--graph-point-fill").trim() || "#7a1424"
    );
    const border = color(
      style.getPropertyValue("--graph-point-stroke").trim() || "#fff"
    );
    const remove = (id: string) => {
      const entry = cache.get(id);
      if (!entry) return;
      gl.deleteBuffer(entry.fill);
      gl.deleteBuffer(entry.stroke);
      for (const value of [entry.fill, entry.stroke]) {
        const index = buffers.indexOf(value);
        if (index >= 0) buffers.splice(index, 1);
      }
      cache.delete(id);
    };
    return {
      dispose,
      draw(scene: GeographicPainterProps, now: number) {
        if (gl.isContextLost()) throw Error("webgl_context_lost");
        const density = Math.min(
          window.devicePixelRatio || 1,
          1.5,
          Math.sqrt(
            4_000_000 / Math.max(1, scene.size.width * scene.size.height)
          )
        );
        const width = Math.max(1, Math.floor(scene.size.width * density)),
          height = Math.max(1, Math.floor(scene.size.height * density));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0.15, 0.15, 0.15, 0.15);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const live = new Set<string>(),
          liveMeshes = new Set<string>();
        let animating = false;
        const tween = (
          id: string,
          target: number,
          duration: number,
          enter = false
        ) => {
          live.add(id);
          let old = tweens.get(id);
          const at = (t: { from: number; target: number; start: number }) => {
            const ratio = reduced
              ? 1
              : Math.min(1, Math.max(0, (now - t.start) / duration));
            return t.from + (t.target - t.from) * (1 - (1 - ratio) ** 3);
          };
          if (!old) old = { from: enter ? 0 : target, target, start: now };
          else if (old.target !== target)
            old = { from: at(old), target, start: now };
          tweens.set(id, old);
          const value = at(old);
          if (Math.abs(value - target) > 0.0001) animating = true;
          return value;
        };
        const camera = (view = scene.view, size = scene.size) => {
          const sx = scene.view.scaleX / view.scaleX,
            sy = scene.view.scaleY / view.scaleY;
          return [
            sx,
            sy,
            scene.size.width / 2 +
              scene.view.x -
              sx * (size.width / 2 + view.x),
            scene.size.height / 2 +
              scene.view.y -
              sy * (size.height / 2 + view.y)
          ];
        };
        const dots: number[] = [];
        const dot = (
          id: string,
          point: { x: number; y: number },
          display: { radius: number; strokeWidth: number; opacity: number },
          opacity: number,
          ink: number[],
          transform: number[],
          enter = false
        ) => {
          const radius = tween(id + ":radius", display.radius, 180),
            stroke = tween(id + ":stroke", display.strokeWidth, 180);
          const alpha = tween(
            id + ":alpha",
            opacity * display.opacity,
            180,
            enter
          );
          if (alpha <= 0 || radius <= 0) return;
          dots.push(
            point.x * transform[0]! + transform[2]!,
            point.y * transform[1]! + transform[3]!,
            radius,
            stroke,
            alpha,
            ...ink
          );
        };
        gl.useProgram(hullProgram);
        gl.uniform2f(hu.size, scene.size.width, scene.size.height);
        for (const region of scene.regions) {
          const transform = camera(region.paintView, region.paintViewport);
          const c = scene.colors.get(region.id);
          const alpha = tween(
            "hull:" + region.id,
            region.renderedOpacity *
              region.surfaceOpacity *
              (region.representation?.hullOpacity ??
                (region.compactPoint ? 0 : 1)),
            220
          );
          if (region.path && alpha > 0) {
            liveMeshes.add(region.id);
            let entry = cache.get(region.id);
            if (!entry || entry.path !== region.path) {
              remove(region.id);
              const mesh = geographicMesh(region.path);
              if (mesh.fill.byteLength + mesh.stroke.byteLength > 4_000_000)
                throw Error("webgl_mesh_budget");
              entry = {
                path: region.path,
                fill: buffer(mesh.fill),
                stroke: buffer(mesh.stroke),
                fillCount: mesh.fill.length / 5,
                strokeCount: mesh.stroke.length / 5,
                bytes: mesh.fill.byteLength + mesh.stroke.byteLength
              };
              cache.set(region.id, entry);
              meshBuilds++;
            } else {
              meshReuses++;
            }
            let tx = 0,
              ty = 0;
            if (region.pathTransform) {
              const match = /^translate\(([-+\d.e]+)[ ,]+([-+\d.e]+)\)$/.exec(
                region.pathTransform
              );
              if (!match) throw Error("unsupported_webgl_path_transform");
              tx = Number(match[1]);
              ty = Number(match[2]);
              if (!Number.isFinite(tx + ty))
                throw Error("invalid_webgl_path_transform");
            }
            gl.uniform4f(
              hu.camera,
              transform[0]!,
              transform[1]!,
              transform[2]! + tx * transform[0]!,
              transform[3]! + ty * transform[1]!
            );
            const draw = (
              value: WebGLBuffer,
              count: number,
              css: string,
              opacity: number,
              thickness: number
            ) => {
              const ink = color(css);
              gl.uniform4f(
                hu.color,
                ink[0]!,
                ink[1]!,
                ink[2]!,
                ink[3]! * opacity
              );
              gl.uniform1f(hu.thickness, thickness);
              gl.bindBuffer(gl.ARRAY_BUFFER, value);
              for (const [location, size, offset] of [
                [0, 2, 0],
                [1, 2, 8],
                [2, 1, 16]
              ]) {
                gl.enableVertexAttribArray(location!);
                gl.vertexAttribDivisor(location!, 0);
                gl.vertexAttribPointer(
                  location!,
                  size!,
                  gl.FLOAT,
                  false,
                  20,
                  offset!
                );
              }
              gl.disableVertexAttribArray(3);
              gl.drawArrays(gl.TRIANGLES, 0, count);
            };
            draw(
              entry.stroke,
              entry.strokeCount,
              c?.label || "#7a3a29",
              alpha * scene.strokeOpacity,
              1.15
            );
            draw(
              entry.fill,
              entry.fillCount,
              c?.fill || "rgba(214,120,92,.12)",
              alpha * scene.fillOpacity,
              0
            );
          }
          const point = region.representation?.point ?? region.compactPoint;
          if (point)
            dot(
              "composite:" + region.id,
              point,
              region.pointDisplay,
              region.renderedOpacity *
                (region.representation?.pointOpacity ??
                  (region.compactPoint ? 1 : 0)),
              c ? color(c.label) : pointFill,
              transform
            );
        }
        for (const point of scene.points)
          dot(
            "event:" + point.id,
            point,
            point.pointDisplay,
            point.opacity,
            pointFill,
            camera(point.paintView, point.paintViewport),
            true
          );
        for (const id of tweens.keys()) if (!live.has(id)) tweens.delete(id);
        for (const id of cache.keys()) if (!liveMeshes.has(id)) remove(id);
        const bytes = [...cache.values()].reduce((sum, e) => sum + e.bytes, 0);
        if (cache.size > 128 || bytes > 8_000_000)
          throw Error("webgl_scene_budget");
        gl.useProgram(pointProgram);
        gl.uniform2f(pu.size, scene.size.width, scene.size.height);
        gl.uniform4fv(pu.border, border);
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribDivisor(0, 0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, instances);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dots), gl.DYNAMIC_DRAW);
        for (const [location, size, offset] of [
          [1, 2, 0],
          [2, 3, 8],
          [3, 4, 20]
        ]) {
          gl.enableVertexAttribArray(location!);
          gl.vertexAttribDivisor(location!, 1);
          gl.vertexAttribPointer(
            location!,
            size!,
            gl.FLOAT,
            false,
            36,
            offset!
          );
        }
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, dots.length / 9);
        canvas.dataset.paintRevision = String(
          Number(canvas.dataset.paintRevision || 0) + 1
        );
        canvas.dataset.rasterScale = String(density);
        canvas.dataset.meshBytes = String(bytes);
        canvas.dataset.meshCount = String(cache.size);
        canvas.dataset.meshBuilds = String(meshBuilds);
        canvas.dataset.meshReuses = String(meshReuses);
        canvas.dataset.pointCount = String(dots.length / 9);
        canvas.dataset.regionCount = String(scene.regions.length);
        return animating;
      }
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function GeographicWebGL(props: GeographicPainterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef(props);
  const painter = useRef<ReturnType<typeof createPainter> | null>(null);
  const frame = useRef<number | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const lost = (event: Event) => {
      event.preventDefault();
      scene.current.onUnavailable();
    };
    canvas.addEventListener("webglcontextlost", lost);
    try {
      painter.current = createPainter(canvas);
    } catch {
      scene.current.onUnavailable();
    }
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      painter.current?.dispose();
      painter.current = null;
      canvas.width = canvas.height = 0;
    };
  }, []);
  useLayoutEffect(() => {
    scene.current = props;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const paint = (now: number) => {
      frame.current = null;
      if (!painter.current) return;
      const start = scene.current.onDraw ? performance.now() : 0;
      try {
        const active = painter.current.draw(scene.current, now);
        scene.current.onDraw?.(performance.now() - start);
        if (active) frame.current = requestAnimationFrame(paint);
      } catch {
        scene.current.onUnavailable();
      }
    };
    paint(performance.now());
  }, [props]);
  return (
    <canvas
      ref={canvasRef}
      data-testid="geographic-webgl"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        // Publish CSS extent with the camera/backing buffer. Percentage sizing
        // would stretch the old frame before ResizeObserver commits the new one.
        width: props.size.width,
        height: props.size.height,
        zIndex: 1,
        pointerEvents: "none"
      }}
    />
  );
}
