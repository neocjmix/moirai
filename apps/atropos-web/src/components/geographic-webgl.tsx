"use client";

import { useLayoutEffect, useRef } from "react";
import type { GeographicPainterProps } from "./geographic-canvas";
import { geographicMesh } from "./geographic-mesh";
import {
  geographicMeshFrame,
  geographicPaintTransform,
  geographicPathControls,
  geographicTweenValue,
  reusableGeographicPaintTransform,
  type GeographicMeshFrame,
  type GeographicPathControls
} from "./geographic-mesh-reuse";
import { HULL_FEATHER_WIDTH_PX, hullFeatherLayers } from "./hull-feather";
import { DEFAULT_COMPOSITE_FILL } from "../urdr-port/src/components/graph-shell-composite";
import {
  spectralPigmentMaterial,
  SPECTRAL_PIGMENT_RESOLVE_GLSL
} from "../lib/spectral-pigment";

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
const pigmentFragment = `#version 300 es
precision highp float;
uniform vec3 ks012;
uniform vec3 ks345;
uniform float mass;
uniform float coverage;
layout(location=0) out vec4 bands012Mass;
layout(location=1) out vec4 bands345Coverage;
void main(){
  bands012Mass=vec4(ks012*mass,mass);
  bands345Coverage=vec4(ks345*mass,coverage);
}`;
const resolveVertex = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;
const resolveFragment = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D bands012;
uniform sampler2D bands345;
out vec4 result;
${SPECTRAL_PIGMENT_RESOLVE_GLSL}
void main(){
  vec4 a=texture(bands012,uv);
  vec4 b=texture(bands345,uv);
  float alpha=1.-exp(-b.a);
  result=vec4(spectralPigmentResolve(a,b)*alpha,alpha);
}`;
const copyFragment = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D pigment;
out vec4 result;
void main(){result=texture(pigment,uv);}`;
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
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw Error("webgl_pigment_float_unavailable");
  const programs: WebGLProgram[] = [],
    buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const textures: WebGLTexture[] = [];
  let framebuffer: WebGLFramebuffer | null = null;
  let resolveFramebuffer: WebGLFramebuffer | null = null;
  const meshArrays = new Map<WebGLBuffer, WebGLVertexArrayObject>();
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
  const meshBuffer = (data: Float32Array) => {
    const result = buffer(data);
    const array = gl.createVertexArray();
    if (!array) throw Error("webgl_vertex_array_unavailable");
    meshArrays.set(result, array);
    gl.bindVertexArray(array);
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    for (const [location, size, offset] of [
      [0, 2, 0],
      [1, 2, 8],
      [2, 1, 16]
    ]) {
      gl.enableVertexAttribArray(location!);
      gl.vertexAttribPointer(location!, size!, gl.FLOAT, false, 20, offset!);
    }
    gl.bindVertexArray(null);
    return result;
  };
  const dispose = () => {
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer);
    for (const value of textures) gl.deleteTexture(value);
    for (const value of meshArrays.values()) gl.deleteVertexArray(value);
    meshArrays.clear();
    for (const value of buffers) gl.deleteBuffer(value);
    for (const value of shaders) gl.deleteShader(value);
    for (const value of programs) gl.deleteProgram(value);
    cache.clear();
    retainedControlBytes = 0;
    tweens.clear();
    palette.clear();
  };
  type Mesh = {
    path: string;
    frame: GeographicMeshFrame;
    controls: GeographicPathControls | null;
    requestedPath: string;
    requestedControls: GeographicPathControls | null;
    fill: WebGLBuffer;
    stroke: WebGLBuffer;
    fillCount: number;
    strokeCount: number;
    bytes: number;
    feather?: {
      source: readonly string[];
      layers: { fill: WebGLBuffer; count: number }[][];
      bytes: number;
    };
  };
  const cache = new Map<string, Mesh>();
  const MAX_CONTROL_BYTES = 1_000_000;
  let retainedControlBytes = 0;
  const controlBytes = (entry: Mesh) =>
    (entry.controls?.coordinates.byteLength ?? 0) +
    (entry.requestedControls !== entry.controls
      ? (entry.requestedControls?.coordinates.byteLength ?? 0)
      : 0);
  let meshBuilds = 0;
  let meshReuses = 0;
  let boundedZoomReuses = 0;
  let featherBuilds = 0;
  const tweens = new Map<
    string,
    { from: number; target: number; start: number }
  >();
  const palette = new Map<string, number[]>();
  try {
    const hullProgram = program(vertex, fragment),
      pigmentProgram = program(vertex, pigmentFragment),
      resolveProgram = program(resolveVertex, resolveFragment),
      copyProgram = program(resolveVertex, copyFragment),
      pointProgram = program(dotVertex, dotFragment);
    framebuffer = gl.createFramebuffer();
    resolveFramebuffer = gl.createFramebuffer();
    if (!framebuffer || !resolveFramebuffer)
      throw Error("webgl_pigment_framebuffer_unavailable");
    for (let index = 0; index < 3; index++) {
      const texture = gl.createTexture();
      if (!texture) throw Error("webgl_pigment_texture_unavailable");
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    let accumulationWidth = 0,
      accumulationHeight = 0;
    const accumulationSize = (width: number, height: number) => {
      // Pigment has no text or point contours: one CSS pixel is sufficient.
      // Six-band math stays on this surface, followed by a cheap linear copy
      // to the sharper point/border canvas. Three targets cost at most 6 MB.
      const scale = Math.min(1, Math.sqrt(300_000 / (width * height)));
      const w = Math.max(1, Math.floor(width * scale));
      const h = Math.max(1, Math.floor(height * scale));
      if (w !== accumulationWidth || h !== accumulationHeight) {
        for (const [index, texture] of textures.entries()) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            index < 2 ? gl.RGBA16F : gl.RGBA8,
            w,
            h,
            0,
            gl.RGBA,
            index < 2 ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
            null
          );
          gl.bindFramebuffer(
            gl.FRAMEBUFFER,
            index < 2 ? framebuffer : resolveFramebuffer
          );
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0 + (index < 2 ? index : 0),
            gl.TEXTURE_2D,
            texture,
            0
          );
        }
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw Error("webgl_pigment_resolve_incomplete");
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw Error("webgl_pigment_framebuffer_incomplete");
        accumulationWidth = w;
        accumulationHeight = h;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
    };
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
      su = {
        ...uniforms(pigmentProgram),
        ks012: gl.getUniformLocation(pigmentProgram, "ks012"),
        ks345: gl.getUniformLocation(pigmentProgram, "ks345"),
        mass: gl.getUniformLocation(pigmentProgram, "mass"),
        coverage: gl.getUniformLocation(pigmentProgram, "coverage")
      },
      ru = {
        bands012: gl.getUniformLocation(resolveProgram, "bands012"),
        bands345: gl.getUniformLocation(resolveProgram, "bands345")
      },
      copyTexture = gl.getUniformLocation(copyProgram, "pigment"),
      pu = uniforms(pointProgram);
    const style = getComputedStyle(canvas);
    const pointFill = color(
      style.getPropertyValue("--graph-point-fill").trim() || "#1b2330"
    );
    const border = color(
      style.getPropertyValue("--graph-point-stroke").trim() || "#fff"
    );
    const removeBuffers = (values: readonly WebGLBuffer[]) => {
      for (const value of values) {
        const array = meshArrays.get(value);
        if (array) gl.deleteVertexArray(array);
        meshArrays.delete(value);
        gl.deleteBuffer(value);
        const index = buffers.indexOf(value);
        if (index >= 0) buffers.splice(index, 1);
      }
    };
    const removeFeather = (entry: Mesh) => {
      if (!entry.feather) return;
      removeBuffers(
        entry.feather.layers.flatMap((layer) => layer.map((part) => part.fill))
      );
      delete entry.feather;
    };
    const remove = (id: string) => {
      const entry = cache.get(id);
      if (!entry) return;
      removeFeather(entry);
      removeBuffers([entry.fill, entry.stroke]);
      retainedControlBytes -= controlBytes(entry);
      cache.delete(id);
    };
    const meshBytes = () =>
      [...cache.values()].reduce(
        (sum, entry) => sum + entry.bytes + (entry.feather?.bytes || 0),
        0
      );
    const drawMesh = (value: WebGLBuffer, count: number) => {
      gl.bindVertexArray(meshArrays.get(value)!);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };
    let checkedFloatBlend = false;
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
        gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const live = new Set<string>(),
          liveMeshes = new Set<string>();
        const regionIds = new Set(scene.regions.map((region) => region.id));
        for (const id of cache.keys()) if (!regionIds.has(id)) remove(id);
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
            return geographicTweenValue(t.from, t.target, ratio);
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
        const strokes: {
          entry: Mesh;
          transform: number[];
          ink: number[];
          alpha: number;
        }[] = [];
        let featherLayers = 0,
          accumulationDraws = 0;
        let pigmentActive = false;
        const beginPigment = () => {
          if (pigmentActive) return;
          // Point-only frames do not clear, allocate or resolve pigment. Use
          // the current tweened fill below, so an exiting hull keeps its fade.
          accumulationSize(scene.size.width, scene.size.height);
          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(pigmentProgram);
          gl.uniform2f(su.size, scene.size.width, scene.size.height);
          gl.uniform1f(su.thickness, 0);
          pigmentActive = true;
        };
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
          const ink = color(c?.fill || DEFAULT_COMPOSITE_FILL);
          const fillAlpha = Math.min(
            0.9999,
            Math.max(
              0,
              ink[3]! *
                alpha *
                scene.fillOpacity *
                (region.representation?.hullFillOpacity ?? 1)
            )
          );
          const strokeOpacity = region.representation?.hullStrokeOpacity ?? 1;
          const borderAlpha = alpha * scene.strokeOpacity * strokeOpacity;
          if (region.path && (fillAlpha > 0 || borderAlpha > 0)) {
            liveMeshes.add(region.id);
            let entry = cache.get(region.id);
            const currentFrame = geographicMeshFrame(
              region.paintView ?? scene.view,
              region.paintViewport ?? scene.size,
              region.pathTransform
            );
            const currentTransform =
              currentFrame &&
              geographicPaintTransform(currentFrame, scene.view, scene.size);
            if (!currentFrame || !currentTransform)
              throw Error("invalid_webgl_paint_frame");
            let drawTransform = currentTransform;
            let reuse = false;
            if (entry) {
              if (
                entry.path !== region.path &&
                entry.requestedPath !== region.path
              ) {
                retainedControlBytes -=
                  entry.requestedControls !== entry.controls
                    ? (entry.requestedControls?.coordinates.byteLength ?? 0)
                    : 0;
                entry.requestedPath = region.path;
                const parsed = geographicPathControls(region.path);
                entry.requestedControls =
                  retainedControlBytes +
                    (parsed?.coordinates.byteLength ?? 0) <=
                  MAX_CONTROL_BYTES
                    ? parsed
                    : null;
                retainedControlBytes +=
                  entry.requestedControls?.coordinates.byteLength ?? 0;
              }
              const anchorTransform = geographicPaintTransform(
                entry.frame,
                scene.view,
                scene.size
              );
              const reusableTransform = reusableGeographicPaintTransform(
                entry.path,
                region.path,
                entry.controls,
                entry.requestedControls,
                anchorTransform,
                currentTransform
              );
              if (reusableTransform) {
                reuse = true;
                drawTransform = reusableTransform;
                if (entry.path !== region.path) boundedZoomReuses++;
              }
            }
            if (!entry || !reuse) {
              let controls =
                entry?.requestedPath === region.path
                  ? entry.requestedControls
                  : geographicPathControls(region.path);
              remove(region.id);
              if (
                retainedControlBytes + (controls?.coordinates.byteLength ?? 0) >
                MAX_CONTROL_BYTES
              )
                controls = null;
              const mesh = geographicMesh(region.path);
              const bytes = mesh.fill.byteLength + mesh.stroke.byteLength;
              if (bytes > 4_000_000) throw Error("webgl_mesh_budget");
              if (cache.size >= 128 || meshBytes() + bytes > 8_000_000)
                throw Error("webgl_scene_budget");
              entry = {
                path: region.path,
                frame: currentFrame,
                controls,
                requestedPath: region.path,
                requestedControls: controls,
                fill: meshBuffer(mesh.fill),
                stroke: meshBuffer(mesh.stroke),
                fillCount: mesh.fill.length / 5,
                strokeCount: mesh.stroke.length / 5,
                bytes
              };
              cache.set(region.id, entry);
              retainedControlBytes += controlBytes(entry);
              meshBuilds++;
            } else {
              meshReuses++;
            }
            const position = [...drawTransform];
            if (fillAlpha > 0 && entry.fillCount > 0) {
              beginPigment();
              gl.uniform4fv(su.camera, position);
              const material = spectralPigmentMaterial([
                ink[0]! * 255,
                ink[1]! * 255,
                ink[2]! * 255
              ]);
              gl.uniform3f(
                su.ks012,
                material.ks[0],
                material.ks[1],
                material.ks[2]
              );
              gl.uniform3f(
                su.ks345,
                material.ks[3],
                material.ks[4],
                material.ks[5]
              );
              const opticalDensity = -Math.log1p(-fillAlpha);
              const softness = 1 - Math.min(1, Math.max(0, strokeOpacity));
              const fill = (
                value: WebGLBuffer,
                count: number,
                weight: number
              ) => {
                const coverage = opticalDensity * weight;
                gl.uniform1f(su.mass, coverage * material.luminance);
                gl.uniform1f(su.coverage, coverage);
                drawMesh(value, count);
                accumulationDraws++;
              };
              if (softness > 0) {
                // A reused mesh stays within 20% of its original camera.
                // Keep its inset too: at this scale the 2.4px feather varies
                // only from 1.92 to 2.88px instead of rebuilding every pinch.
                const anchoredFeather =
                  drawTransform[0] >= 0.8 &&
                  drawTransform[0] <= 1.2 &&
                  drawTransform[1] >= 0.8 &&
                  drawTransform[1] <= 1.2;
                const layers = hullFeatherLayers(
                  entry.path,
                  softness,
                  HULL_FEATHER_WIDTH_PX /
                    (anchoredFeather
                      ? 1
                      : Math.max(
                          Math.abs(drawTransform[0]),
                          Math.abs(drawTransform[1]),
                          0.0001
                        )),
                  2
                );
                const source = layers[1]?.contours;
                if (source && entry.feather?.source !== source) {
                  featherBuilds++;
                  removeFeather(entry);
                  const feather: NonNullable<Mesh["feather"]> = {
                    source,
                    layers: [],
                    bytes: 0
                  };
                  // Assign before allocating so every buffer is owned even if a
                  // malformed or oversized enhancement requests SVG fallback.
                  entry.feather = feather;
                  for (const layer of layers.slice(1)) {
                    const pieces: { fill: WebGLBuffer; count: number }[] = [];
                    feather.layers.push(pieces);
                    for (const path of layer.contours) {
                      const mesh = geographicMesh(path, { stroke: false });
                      feather.bytes += mesh.fill.byteLength;
                      if (entry.bytes + feather.bytes > 4_000_000)
                        throw Error("webgl_mesh_budget");
                      if (meshBytes() > 8_000_000)
                        throw Error("webgl_scene_budget");
                      pieces.push({
                        fill: meshBuffer(mesh.fill),
                        count: mesh.fill.length / 5
                      });
                    }
                  }
                }
                fill(entry.fill, entry.fillCount, layers[0]!.weight);
                for (let i = 1; i < layers.length; i++) {
                  for (const part of entry.feather?.layers[i - 1] || [])
                    fill(part.fill, part.count, layers[i]!.weight);
                }
                featherLayers += layers.length;
              } else {
                fill(entry.fill, entry.fillCount, 1);
              }
            }
            if (borderAlpha > 0)
              strokes.push({
                entry,
                transform: position,
                ink: color(c?.label || "#7a3a29"),
                alpha: borderAlpha
              });
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
              ink,
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
        const bytes = meshBytes();
        if (cache.size > 128 || bytes > 8_000_000)
          throw Error("webgl_scene_budget");
        // Test float blending once, after the first real accumulation draw.
        // No recurring driver query or pixel readback is needed after this.
        if (!checkedFloatBlend && accumulationDraws > 0) {
          if (gl.getError() !== gl.NO_ERROR)
            throw Error("webgl_pigment_blend_unavailable");
          checkedFloatBlend = true;
        }
        if (pigmentActive) {
          gl.bindVertexArray(null);
          for (let location = 0; location < 4; location++) {
            gl.disableVertexAttribArray(location);
            gl.vertexAttribDivisor(location, 0);
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer);
          gl.viewport(0, 0, accumulationWidth, accumulationHeight);
          gl.disable(gl.BLEND);
          gl.useProgram(resolveProgram);
          for (let index = 0; index < 2; index++) {
            gl.activeTexture(gl.TEXTURE0 + index);
            gl.bindTexture(gl.TEXTURE_2D, textures[index]!);
          }
          gl.uniform1i(ru.bands012, 0);
          gl.uniform1i(ru.bands345, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, width, height);
          gl.useProgram(copyProgram);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, textures[2]!);
          gl.uniform1i(copyTexture, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(hullProgram);
        gl.uniform2f(hu.size, scene.size.width, scene.size.height);
        gl.uniform1f(hu.thickness, 1.15);
        for (const stroke of strokes) {
          gl.uniform4fv(hu.camera, stroke.transform);
          gl.uniform4f(
            hu.color,
            stroke.ink[0]!,
            stroke.ink[1]!,
            stroke.ink[2]!,
            stroke.ink[3]! * stroke.alpha
          );
          drawMesh(stroke.entry.stroke, stroke.entry.strokeCount);
        }
        gl.bindVertexArray(null);
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
        canvas.dataset.meshZoomReuses = String(boundedZoomReuses);
        canvas.dataset.meshControlBytes = String(retainedControlBytes);
        canvas.dataset.meshFeatherBuilds = String(featherBuilds);
        canvas.dataset.pointCount = String(dots.length / 9);
        canvas.dataset.regionCount = String(scene.regions.length);
        canvas.dataset.pigmentMode = "spectral-6band";
        canvas.dataset.pigmentPixels = String(
          accumulationWidth * accumulationHeight
        );
        canvas.dataset.pigmentBytes = String(
          accumulationWidth * accumulationHeight * 20
        );
        canvas.dataset.pigmentResolvePixels = String(
          pigmentActive ? accumulationWidth * accumulationHeight : 0
        );
        canvas.dataset.meshArrays = String(meshArrays.size);
        canvas.dataset.featherCoats = "2";
        canvas.dataset.featherLayers = String(featherLayers);
        canvas.dataset.pigmentDraws = String(accumulationDraws);
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
      canvas.dataset.pigmentMode = "unavailable";
      canvas.dataset.pigmentFallback = "context-lost";
      scene.current.onUnavailable();
    };
    canvas.addEventListener("webglcontextlost", lost);
    try {
      painter.current = createPainter(canvas);
    } catch {
      canvas.dataset.pigmentMode = "unavailable";
      canvas.dataset.pigmentFallback = "unsupported";
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
        canvasRef.current!.dataset.pigmentMode = "unavailable";
        canvasRef.current!.dataset.pigmentFallback = "draw-failed";
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
