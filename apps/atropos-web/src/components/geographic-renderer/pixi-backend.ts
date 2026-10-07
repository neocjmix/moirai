import {
  Buffer,
  BufferImageSource,
  BufferUsage,
  Container,
  Geometry,
  Mesh,
  RenderTexture,
  Shader,
  UniformGroup,
  WebGLRenderer,
  type ShaderFromResources
} from "pixi.js";
import type {
  GeographicPreparedScene,
  GeographicRendererBackend,
  GeographicRendererStats,
  Rgba
} from "./contract";
import { createScenePreparer } from "./scene";

// Pixi owns GPU resources, state, mesh/instance submission and render targets.
// A single material table keeps camera/opacity changes out of geometry buffers.
// Samplers must be highp: retained World translations can exceed 65504, so
// default sampler precision can silently overflow otherwise valid float data.
// Gaussian convolution happens on accumulated density before pigment resolve;
// native BlurFilter's RGBA8 pool would clamp this floating-point accumulation.
const hullVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in float aHull;
uniform vec4 uCamera;
uniform vec2 uViewport;
uniform highp sampler2D uHullTable;
out vec4 vMaterial;
void main(){
  int id=int(aHull);
  vec4 t=texelFetch(uHullTable,ivec2(0,id),0);
  vec2 p=(aPosition*t.xy+t.zw)*uCamera.xy+uCamera.zw;
  gl_Position=vec4(p/uViewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  vMaterial=texelFetch(uHullTable,ivec2(1,id),0);
}`;
const hullFragment = `#version 300 es
precision highp float;
in vec4 vMaterial;
out vec4 finalColor;
void main(){finalColor=vMaterial;}`;
const strokeVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aNeighbor;
in float aSide;
in float aHull;
uniform vec4 uCamera;
uniform vec2 uViewport;
uniform highp sampler2D uHullTable;
out vec4 vMaterial;
void main(){
  int id=int(aHull);
  vec4 t=texelFetch(uHullTable,ivec2(0,id),0);
  vec2 scale=t.xy*uCamera.xy;
  vec2 p=(aPosition*t.xy+t.zw)*uCamera.xy+uCamera.zw;
  vec2 delta=(aNeighbor-aPosition)*scale;
  p+=vec2(-delta.y,delta.x)/max(length(delta),.00001)*aSide*.5;
  gl_Position=vec4(p/uViewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  vMaterial=texelFetch(uHullTable,ivec2(2,id),0);
}`;
const strokeFragment = `#version 300 es
precision highp float;
in vec4 vMaterial;
out vec4 finalColor;
void main(){finalColor=vec4(vMaterial.rgb*vMaterial.a,vMaterial.a);}`;
const pointVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aCenter;
in vec3 aDisplay;
in vec4 aColor;
uniform vec4 uCamera;
uniform vec2 uViewport;
out vec2 vLocal;
out vec3 vDisplay;
out vec4 vColor;
void main(){
  float extent=aDisplay.x+aDisplay.y*.5+1.;
  vLocal=aPosition*extent;vDisplay=aDisplay;vColor=aColor;
  vec2 p=aCenter*uCamera.xy+uCamera.zw+vLocal;
  gl_Position=vec4(p/uViewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}`;
const pointFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vDisplay;
in vec4 vColor;
uniform vec4 uPointStroke;
out vec4 finalColor;
void main(){
  float distance=length(vLocal);
  float outer=1.-smoothstep(vDisplay.x+vDisplay.y*.5-.5,vDisplay.x+vDisplay.y*.5+.5,distance);
  float inner=1.-smoothstep(vDisplay.x-vDisplay.y*.5-.5,vDisplay.x-vDisplay.y*.5+.5,distance);
  vec4 ink=mix(uPointStroke,vColor,inner);
  float alpha=ink.a*outer*vDisplay.z;
  finalColor=vec4(ink.rgb*alpha,alpha);
}`;
const quadVertex = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const blurFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uInput;
uniform vec2 uStep;
out vec4 finalColor;
void main(){
  finalColor=texture(uInput,vUv)*.227027027;
  finalColor+=(texture(uInput,vUv+uStep*1.3846153846)+texture(uInput,vUv-uStep*1.3846153846))*.3162162162;
  finalColor+=(texture(uInput,vUv+uStep*3.2307692308)+texture(uInput,vUv-uStep*3.2307692308))*.0702702703;
}`;
const resolveFragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform highp sampler2D uInput;
out vec4 finalColor;
void main(){
  vec4 sum=texture(uInput,vUv);
  float alpha=1.-exp(-sum.a);
  // A repeated pigment increases coverage, not unbounded darkness. This is a
  // three-channel approximation, not the baseline's six-band spectral model.
  vec3 pigment=exp(-sum.rgb/max(sum.a,.00001));
  finalColor=vec4(pigment*alpha,alpha);
}`;

const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
const capacityFor = (length: number) =>
  2 ** Math.ceil(Math.log2(Math.max(1, length)));
const changed = (a: number, b: number) =>
  Math.abs(a - b) > 0.000001 * Math.max(1, Math.abs(a));

export async function createPixiBackend(
  canvas: HTMLCanvasElement
): Promise<GeographicRendererBackend> {
  const renderer = new WebGLRenderer();
  try {
    await renderer.init({
      canvas,
      width: 1,
      height: 1,
      resolution: 1,
      antialias: true,
      backgroundAlpha: 0,
      preferWebGLVersion: 2,
      autoDensity: false
    });
  } catch (error) {
    renderer.destroy();
    throw error;
  }
  const gl = renderer.gl;
  if (
    renderer.context.webGLVersion !== 2 ||
    !gl.getExtension("EXT_color_buffer_float")
  ) {
    renderer.destroy();
    throw Error("pixi_float_render_target_unavailable");
  }
  try {
    const preparer = createScenePreparer();
    const pigmentPalette = new WeakMap<Rgba, readonly number[]>();
    const stage = new Container({
      eventMode: "none",
      interactiveChildren: false
    });
    const fillStage = new Container({
      eventMode: "none",
      interactiveChildren: false
    });
    const blurStage = new Container({
      eventMode: "none",
      interactiveChildren: false
    });
    const uniforms = new UniformGroup({
      uCamera: { value: new Float32Array([1, 1, 0, 0]), type: "vec4<f32>" },
      uViewport: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
      uPointStroke: { value: new Float32Array([1, 1, 1, 1]), type: "vec4<f32>" }
    });
    const blurUniforms = new UniformGroup({
      uStep: { value: new Float32Array([1, 0]), type: "vec2<f32>" }
    });
    let tableData = new Float32Array(12);
    let table = new BufferImageSource({
      resource: tableData,
      width: 3,
      height: 1,
      format: "rgba32float",
      scaleMode: "nearest",
      alphaMode: "no-premultiply-alpha"
    });
    const shader = (
      vertex: string,
      fragment: string,
      resources: NonNullable<ShaderFromResources["resources"]>
    ) => Shader.from({ gl: { vertex, fragment }, resources });
    const fillShader = shader(hullVertex, hullFragment, {
      sceneUniforms: uniforms,
      uHullTable: table
    });
    const strokeShader = shader(strokeVertex, strokeFragment, {
      sceneUniforms: uniforms,
      uHullTable: table
    });
    const pointShader = shader(pointVertex, pointFragment, {
      sceneUniforms: uniforms
    });
    const makeTarget = () =>
      RenderTexture.create({
        width: 1,
        height: 1,
        format: "rgba16float",
        scaleMode: "linear",
        antialias: false,
        dynamic: true
      });
    const accumulation = makeTarget();
    const horizontal = makeTarget();
    const softened = makeTarget();
    const blurShader = shader(quadVertex, blurFragment, {
      blurUniforms,
      uInput: accumulation.source
    });
    const resolveShader = shader(quadVertex, resolveFragment, {
      uInput: accumulation.source
    });
    const quadGeometry = new Geometry({
      attributes: { aPosition: { buffer: quad, format: "float32x2" } }
    });
    const blurMesh = new Mesh({ geometry: quadGeometry, shader: blurShader });
    blurMesh.blendMode = "none";
    blurStage.addChild(blurMesh);
    const resolveMesh = new Mesh({
      geometry: quadGeometry,
      shader: resolveShader
    });
    stage.addChild(resolveMesh);
    let fillMesh: Mesh<Geometry, Shader> | null = null;
    let strokeMesh: Mesh<Geometry, Shader> | null = null;
    let pointMesh: Mesh<Geometry, Shader> | null = null;
    let instanceBuffer: Buffer | null = null;
    let instanceData = new Float32Array(0);
    let pointCount = 0;
    let hullKeys: string[] = [];
    let sizeKey = "";
    let resourceBytes = 0;
    let bufferUploads = 1; // Shared persistent quad.
    let meshBuilds = 0;
    let drawCalls = 0;
    let hullCount = 0;
    let disposed = false;
    let validated = false;

    const releaseMesh = (mesh: Mesh<Geometry, Shader> | null) => {
      if (!mesh) return;
      mesh.removeFromParent();
      mesh.geometry.destroy(true);
      mesh.destroy();
    };

    function syncHulls(prepared: GeographicPreparedScene) {
      const hulls = prepared.hulls;
      if (table.height < hulls.length) {
        tableData = new Float32Array(capacityFor(hulls.length) * 12);
        const old = table;
        table = new BufferImageSource({
          resource: tableData,
          width: 3,
          height: capacityFor(hulls.length),
          format: "rgba32float",
          scaleMode: "nearest",
          alphaMode: "no-premultiply-alpha"
        });
        fillShader.resources.uHullTable = table;
        strokeShader.resources.uHullTable = table;
        old.destroy();
      }
      const [cx, cy, tx, ty] = prepared.camera;
      let tableDirty = false;
      hulls.forEach((hull, index) => {
        const opacity = Math.max(0, Math.min(0.999, hull.fillOpacity));
        const mass = -Math.log(1 - opacity);
        const t = hull.transform;
        let density = pigmentPalette.get(hull.fill);
        if (!density) {
          density = hull.fill
            .slice(0, 3)
            .map((channel) => -Math.log(Math.max(0.025, channel)));
          pigmentPalette.set(hull.fill, density);
        }
        // Factoring the shared camera out of each retained path transform makes
        // a pure pan/zoom a uniform update, not an upload of transformed vertices.
        const values = [
          t[0] / cx,
          t[1] / cy,
          (t[2] - tx) / cx,
          (t[3] - ty) / cy,
          density[0]! * mass,
          density[1]! * mass,
          density[2]! * mass,
          mass,
          hull.stroke[0],
          hull.stroke[1],
          hull.stroke[2],
          hull.strokeOpacity
        ];
        values.forEach((value, column) => {
          const slot = index * 12 + column;
          if (changed(tableData[slot]!, value)) {
            tableData[slot] = value;
            tableDirty = true;
          }
        });
      });
      if (tableDirty) {
        table.update();
        bufferUploads++;
      }
      const geometryChanged =
        hullKeys.length !== hulls.length ||
        hulls.some((hull, index) => hullKeys[index] !== hull.geometry.key);
      if (!geometryChanged) return;
      hullKeys = hulls.map((hull) => hull.geometry.key);
      releaseMesh(fillMesh);
      releaseMesh(strokeMesh);
      fillMesh = strokeMesh = null;
      const fillLength = hulls.reduce(
        (sum, hull) => sum + (hull.geometry.fill.length / 2) * 3,
        0
      );
      const strokeLength = hulls.reduce(
        (sum, hull) => sum + (hull.geometry.stroke.length / 5) * 6,
        0
      );
      const fills = new Float32Array(fillLength);
      const strokes = new Float32Array(strokeLength);
      let f = 0,
        s = 0;
      hulls.forEach((hull, index) => {
        for (let i = 0; i < hull.geometry.fill.length; i += 2) {
          fills[f++] = hull.geometry.fill[i]!;
          fills[f++] = hull.geometry.fill[i + 1]!;
          fills[f++] = index;
        }
        for (let i = 0; i < hull.geometry.stroke.length; i += 5) {
          for (let n = 0; n < 5; n++)
            strokes[s++] = hull.geometry.stroke[i + n]!;
          strokes[s++] = index;
        }
      });
      if (fills.length) {
        const buffer = new Buffer({
          data: fills,
          usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
        });
        fillMesh = new Mesh({
          geometry: new Geometry({
            attributes: {
              aPosition: { buffer, format: "float32x2", stride: 12, offset: 0 },
              aHull: { buffer, format: "float32", stride: 12, offset: 8 }
            }
          }),
          shader: fillShader
        });
        fillMesh.blendMode = "add";
        fillStage.addChild(fillMesh);
        bufferUploads++;
      }
      if (strokes.length) {
        const buffer = new Buffer({
          data: strokes,
          usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
        });
        strokeMesh = new Mesh({
          geometry: new Geometry({
            attributes: {
              aPosition: { buffer, format: "float32x2", stride: 24, offset: 0 },
              aNeighbor: { buffer, format: "float32x2", stride: 24, offset: 8 },
              aSide: { buffer, format: "float32", stride: 24, offset: 16 },
              aHull: { buffer, format: "float32", stride: 24, offset: 20 }
            }
          }),
          shader: strokeShader
        });
        stage.addChildAt(strokeMesh, 1);
        bufferUploads++;
      }
      resourceBytes = fills.byteLength + strokes.byteLength;
    }

    function syncPoints(prepared: GeographicPreparedScene) {
      const points = prepared.points;
      if (instanceData.length < points.length * 9) {
        releaseMesh(pointMesh);
        instanceData = new Float32Array(capacityFor(points.length) * 9);
        instanceBuffer = new Buffer({
          data: instanceData,
          usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
        });
        pointMesh = new Mesh({
          geometry: new Geometry({
            instanceCount: points.length,
            attributes: {
              aPosition: { buffer: quad.slice(), format: "float32x2" },
              aCenter: {
                buffer: instanceBuffer,
                format: "float32x2",
                stride: 36,
                offset: 0,
                instance: true
              },
              aDisplay: {
                buffer: instanceBuffer,
                format: "float32x3",
                stride: 36,
                offset: 8,
                instance: true
              },
              aColor: {
                buffer: instanceBuffer,
                format: "float32x4",
                stride: 36,
                offset: 20,
                instance: true
              }
            }
          }),
          shader: pointShader
        });
        stage.addChild(pointMesh);
        bufferUploads += 2;
      }
      let dirty = pointCount !== points.length;
      points.forEach((point, index) => {
        const values = [
          point.x,
          point.y,
          point.radius,
          point.strokeWidth,
          point.opacity,
          ...point.fill
        ];
        values.forEach((value, column) => {
          const slot = index * 9 + column;
          if (changed(instanceData[slot]!, value)) {
            instanceData[slot] = value;
            dirty = true;
          }
        });
      });
      pointCount = points.length;
      if (pointMesh) {
        pointMesh.geometry.instanceCount = pointCount;
        pointMesh.visible = pointCount > 0;
      }
      if (dirty && instanceBuffer) {
        instanceBuffer.update();
        bufferUploads++;
      }
    }

    return {
      render(scene, frame) {
        if (disposed) return false;
        const prepared = preparer.prepare(scene, frame);
        const width = Math.max(1, scene.size.width);
        const height = Math.max(1, scene.size.height);
        const dpr = Math.min(
          frame.dpr,
          1.5,
          Math.sqrt(4_000_000 / (width * height))
        );
        const key = `${width}/${height}/${dpr}`;
        if (key !== sizeKey) {
          sizeKey = key;
          renderer.resize(width, height, dpr);
          // Hull layer is bounded and downsampled; crisp glyphs/strokes retain DPR.
          const targetWidth = Math.max(1, Math.ceil(width * dpr * 0.5));
          const targetHeight = Math.max(1, Math.ceil(height * dpr * 0.5));
          for (const target of [accumulation, horizontal, softened])
            target.resize(targetWidth, targetHeight);
        }
        uniforms.uniforms.uCamera.set(prepared.camera);
        uniforms.uniforms.uViewport.set([width, height]);
        uniforms.uniforms.uPointStroke.set(frame.pointStroke);
        syncHulls(prepared);
        syncPoints(prepared);
        meshBuilds = prepared.meshBuilds;
        hullCount = prepared.hulls.length;
        drawCalls = 0;
        renderer.render({
          container: fillStage,
          target: accumulation,
          clear: true
        });
        const validateThisFrame = !validated && fillMesh !== null;
        if (
          validateThisFrame &&
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw Error("pixi_float_framebuffer_incomplete");
        if (fillMesh) drawCalls++;
        if (frame.edgeStrategy === "native" && fillMesh) {
          // A ~2 CSS px sigma uses five bilinear samples per axis. No per-Hull
          // filter allocation, inset generation, or geometry duplicated for blur.
          blurShader.resources.uInput = accumulation.source;
          blurUniforms.uniforms.uStep.set([1.2 / width, 0]);
          renderer.render({
            container: blurStage,
            target: horizontal,
            clear: true
          });
          blurShader.resources.uInput = horizontal.source;
          blurUniforms.uniforms.uStep.set([0, 1.2 / height]);
          renderer.render({
            container: blurStage,
            target: softened,
            clear: true
          });
          resolveShader.resources.uInput = softened.source;
          drawCalls += 2;
        } else resolveShader.resources.uInput = accumulation.source;
        renderer.render({ container: stage, clear: true });
        drawCalls += 1 + (strokeMesh ? 1 : 0) + (pointCount ? 1 : 0);
        if (validateThisFrame) {
          if (gl.getError() !== gl.NO_ERROR)
            throw Error("pixi_shader_or_float_draw_failed");
          validated = true;
        }
        return prepared.animating;
      },
      stats(): GeographicRendererStats {
        return {
          drawCalls,
          meshBuilds,
          // Counts explicit vertex/instance/material-texture upload requests.
          // Uniform updates and engine-internal allocations are not estimated.
          bufferUploads,
          resourceBytes:
            resourceBytes +
            instanceData.byteLength +
            tableData.byteLength +
            quad.byteLength * 2 +
            accumulation.width * accumulation.height * 8 * 3,
          hullCount,
          pointCount
        };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        preparer.dispose();
        releaseMesh(fillMesh);
        releaseMesh(strokeMesh);
        releaseMesh(pointMesh);
        blurMesh.destroy();
        resolveMesh.destroy();
        quadGeometry.destroy(true);
        for (const program of [
          fillShader,
          strokeShader,
          pointShader,
          blurShader,
          resolveShader
        ])
          program.destroy(true);
        table.destroy();
        for (const target of [accumulation, horizontal, softened])
          target.destroy(true);
        uniforms.buffer?.destroy();
        blurUniforms.buffer?.destroy();
        stage.destroy();
        fillStage.destroy();
        blurStage.destroy();
        renderer.destroy();
      }
    };
  } catch (error) {
    renderer.destroy();
    throw error;
  }
}
