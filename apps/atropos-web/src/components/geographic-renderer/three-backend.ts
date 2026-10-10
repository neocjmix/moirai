import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  FloatType,
  GLSL3,
  HalfFloatType,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  Vector2,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";
import type {
  GeographicPreparedScene,
  GeographicRendererBackend,
  Rgba
} from "./contract";
import { createScenePreparer } from "./scene";

const hullVertex = `
precision highp float;
precision highp int;
in vec2 position;
in float hullIndex;
uniform highp sampler2D materials;
uniform vec2 viewport;
out vec4 ink;
void main() {
  int row = int(hullIndex);
  vec4 transform = texelFetch(materials, ivec2(0, row), 0);
  vec2 screen = position * transform.xy + transform.zw;
  ink = texelFetch(materials, ivec2(1, row), 0);
  gl_Position = vec4(screen / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

// Accumulate density * coverage and coverage independently. Dividing by total
// coverage in resolve keeps repeated instances of the same pigment its own hue,
// instead of progressively multiplying that hue to black. This is an RGB
// subtractive approximation, not the baseline's six-band pigment simulation.
const pigmentFragment = `
precision highp float;
in vec4 ink;
out vec4 result;
void main() {
  result = ink;
}`;

const strokeVertex = `
precision highp float;
precision highp int;
in vec2 position;
in vec2 neighbour;
in float side;
in float hullIndex;
uniform highp sampler2D materials;
uniform vec2 viewport;
out vec4 ink;
void main() {
  int row = int(hullIndex);
  vec4 transform = texelFetch(materials, ivec2(0, row), 0);
  vec2 delta = (neighbour - position) * transform.xy;
  vec2 screen = position * transform.xy + transform.zw;
  screen += vec2(-delta.y, delta.x) / max(length(delta), .00001) * side * .575;
  ink = texelFetch(materials, ivec2(2, row), 0);
  gl_Position = vec4(screen / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const strokeFragment = `
precision highp float;
in vec4 ink;
out vec4 result;
void main() { result = vec4(ink.rgb * ink.a, ink.a); }
`;

const quadVertex = `
precision highp float;
in vec2 position;
out vec2 uv;
void main() {
  uv = position * .5 + .5;
  gl_Position = vec4(position, 0., 1.);
}`;

const gaussianSample = `
uniform highp sampler2D source;
uniform vec2 blurStep;
vec4 densityAt(vec2 uv) {
  if (blurStep.x == 0. && blurStep.y == 0.) return texture(source, uv);
  vec4 value = texture(source, uv) * .227027027;
  value += texture(source, uv + blurStep * 1.384615385) * .316216216;
  value += texture(source, uv - blurStep * 1.384615385) * .316216216;
  value += texture(source, uv + blurStep * 3.230769231) * .070270270;
  value += texture(source, uv - blurStep * 3.230769231) * .070270270;
  return value;
}`;

const blurFragment = `
precision highp float;
in vec2 uv;
out vec4 result;
${gaussianSample}
void main() { result = densityAt(uv); }
`;

const resolveFragment = `
precision highp float;
in vec2 uv;
out vec4 result;
${gaussianSample}
void main() {
  vec4 density = densityAt(uv);
  float alpha = 1. - exp(-density.a);
  vec3 pigment = exp(-density.rgb / max(density.a, .00001));
  result = vec4(pigment * alpha, alpha);
}`;

const pointVertex = `
precision highp float;
in vec2 position;
in vec2 center;
in vec3 display;
in vec4 color;
uniform vec4 cameraTransform;
uniform vec2 viewport;
out vec2 local;
out vec3 density;
out vec4 ink;
void main() {
  float extent = display.x + display.y * .5 + 1.;
  local = position * extent;
  density = display;
  ink = color;
  vec2 screen = center * cameraTransform.xy + cameraTransform.zw + local;
  gl_Position = vec4(screen / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const pointFragment = `
precision highp float;
in vec2 local;
in vec3 density;
in vec4 ink;
uniform vec4 border;
out vec4 result;
void main() {
  float distance = length(local);
  float outer = 1. - smoothstep(density.x + density.y * .5 - .5, density.x + density.y * .5 + .5, distance);
  float inner = 1. - smoothstep(density.x - density.y * .5 - .5, density.x - density.y * .5 + .5, distance);
  vec4 paint = mix(border, ink, inner);
  float alpha = paint.a * outer * density.z;
  result = vec4(paint.rgb * alpha, alpha);
}`;

/** One merged Hull draw, one instanced point draw and bounded GPU filter passes.
 * Retained path geometry never changes merely because the camera moved. */
export async function createThreeBackend(
  canvas: HTMLCanvasElement
): Promise<GeographicRendererBackend> {
  const context = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true
  });
  if (!context) throw Error("three_webgl2_unavailable");
  if (!context.getExtension("EXT_color_buffer_float")) {
    context.getExtension("WEBGL_lose_context")?.loseContext();
    throw Error("three_pigment_float_unavailable");
  }
  const renderer = new WebGLRenderer({ canvas, context, alpha: true });
  renderer.debug.onShaderError = () => {
    throw Error("three_shader_compile");
  };
  renderer.autoClear = false;
  // Screen-space passes already have explicit painter order. Three's depth
  // sorting assumes xyz positions when deriving bounds; these shaders use xy.
  renderer.sortObjects = false;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x000000, 0);
  const prepare = createScenePreparer();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const viewport = { value: new Vector2(1, 1) };
  const cameraTransform = { value: new Vector4(1, 1, 0, 0) };
  let tableRows = 1;
  let tableData = new Float32Array(16);
  const pigmentPalette = new Map<Rgba, readonly [number, number, number]>();
  const makeTable = () => {
    const texture = new DataTexture(
      tableData,
      4,
      tableRows,
      RGBAFormat,
      FloatType
    );
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
  let table = makeTable();
  const materials = { value: table };
  const material = (
    vertexShader: string,
    fragmentShader: string,
    uniforms: RawShaderMaterial["uniforms"],
    blend: "add" | "over" | "replace"
  ) =>
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: blend !== "replace",
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      premultipliedAlpha: true,
      blending: blend === "replace" ? NoBlending : CustomBlending,
      blendSrc: OneFactor,
      blendDst: blend === "add" ? OneFactor : OneMinusSrcAlphaFactor
    });
  const hullMaterial = material(
    hullVertex,
    pigmentFragment,
    { materials, viewport },
    "add"
  );
  const strokeMaterial = material(
    strokeVertex,
    strokeFragment,
    { materials, viewport },
    "over"
  );
  const border = { value: new Vector4(0, 0, 0, 1) };
  const pointMaterial = material(
    pointVertex,
    pointFragment,
    { viewport, cameraTransform, border },
    "over"
  );
  const accumulation = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false
  });
  const blurred = accumulation.clone();
  const blurMaterial = material(
    quadVertex,
    blurFragment,
    {
      source: { value: accumulation.texture },
      blurStep: { value: new Vector2() }
    },
    "replace"
  );
  const resolveMaterial = material(
    quadVertex,
    resolveFragment,
    {
      source: { value: accumulation.texture },
      blurStep: { value: new Vector2() }
    },
    "over"
  );
  const quadGeometry = new BufferGeometry();
  quadGeometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2)
  );
  const quad = new Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);
  const hullMesh = new Mesh(new BufferGeometry(), hullMaterial);
  const strokeMesh = new Mesh(new BufferGeometry(), strokeMaterial);
  const pointMesh = new Mesh(new InstancedBufferGeometry(), pointMaterial);
  for (const mesh of [hullMesh, strokeMesh, pointMesh])
    mesh.frustumCulled = false;
  const hullScene = new Scene();
  const detailScene = new Scene();
  hullScene.add(hullMesh);
  detailScene.add(strokeMesh, pointMesh);
  strokeMesh.renderOrder = 0;
  pointMesh.renderOrder = 1;
  let geometryKeys: string[] = [];
  let pointCapacity = 0;
  let pointData = new Float32Array();
  let pointBuffer: InstancedInterleavedBuffer | undefined;
  let geometryBytes = 0;
  let bufferUploads = 0;
  let meshBuilds = 0;
  let hullCount = 0;
  let pointCount = 0;
  let targetWidth = 1;
  let targetHeight = 1;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let disposed = false;
  let floatDrawVerified = false;

  const rebuildHulls = (scene: GeographicPreparedScene) => {
    const changed =
      geometryKeys.length !== scene.hulls.length ||
      scene.hulls.some(
        (hull, index) => geometryKeys[index] !== hull.geometry.key
      );
    if (!changed) return;
    geometryKeys = scene.hulls.map((hull) => hull.geometry.key);
    const fillCount = scene.hulls.reduce(
      (n, hull) => n + hull.geometry.fill.length / 2,
      0
    );
    const strokeCount = scene.hulls.reduce(
      (n, hull) => n + hull.geometry.stroke.length / 5,
      0
    );
    const positions = new Float32Array(fillCount * 2);
    const fillIds = new Float32Array(fillCount);
    const strokePositions = new Float32Array(strokeCount * 2);
    const neighbours = new Float32Array(strokeCount * 2);
    const sides = new Float32Array(strokeCount);
    const strokeIds = new Float32Array(strokeCount);
    let fillAt = 0;
    let strokeAt = 0;
    for (const [index, hull] of scene.hulls.entries()) {
      positions.set(hull.geometry.fill, fillAt * 2);
      fillIds.fill(index, fillAt, fillAt + hull.geometry.fill.length / 2);
      fillAt += hull.geometry.fill.length / 2;
      const source = hull.geometry.stroke;
      for (let at = 0; at < source.length; at += 5, strokeAt++) {
        strokePositions[strokeAt * 2] = source[at]!;
        strokePositions[strokeAt * 2 + 1] = source[at + 1]!;
        neighbours[strokeAt * 2] = source[at + 2]!;
        neighbours[strokeAt * 2 + 1] = source[at + 3]!;
        sides[strokeAt] = source[at + 4]!;
        strokeIds[strokeAt] = index;
      }
    }
    const fillGeometry = new BufferGeometry();
    fillGeometry.setAttribute("position", new BufferAttribute(positions, 2));
    fillGeometry.setAttribute("hullIndex", new BufferAttribute(fillIds, 1));
    const strokeGeometry = new BufferGeometry();
    strokeGeometry.setAttribute(
      "position",
      new BufferAttribute(strokePositions, 2)
    );
    strokeGeometry.setAttribute(
      "neighbour",
      new BufferAttribute(neighbours, 2)
    );
    strokeGeometry.setAttribute("side", new BufferAttribute(sides, 1));
    strokeGeometry.setAttribute("hullIndex", new BufferAttribute(strokeIds, 1));
    hullMesh.geometry.dispose();
    strokeMesh.geometry.dispose();
    hullMesh.geometry = fillGeometry;
    strokeMesh.geometry = strokeGeometry;
    geometryBytes =
      positions.byteLength +
      fillIds.byteLength +
      strokePositions.byteLength +
      neighbours.byteLength +
      sides.byteLength +
      strokeIds.byteLength;
    bufferUploads += 6;
  };

  const updateTable = (scene: GeographicPreparedScene) => {
    if (scene.hulls.length > renderer.capabilities.maxTextureSize)
      throw Error("three_material_table_budget");
    let changed = false;
    if (scene.hulls.length > tableRows) {
      tableRows = Math.min(
        renderer.capabilities.maxTextureSize,
        2 ** Math.ceil(Math.log2(scene.hulls.length))
      );
      tableData = new Float32Array(tableRows * 16);
      table.dispose();
      table = makeTable();
      materials.value = table;
      changed = true;
    }
    const put = (at: number, value: number) => {
      const next = Math.fround(value);
      if (tableData[at] !== next) {
        tableData[at] = next;
        changed = true;
      }
    };
    for (const [index, hull] of scene.hulls.entries()) {
      const at = index * 16;
      for (let axis = 0; axis < 4; axis++)
        put(at + axis, hull.transform[axis]!);
      let density = pigmentPalette.get(hull.fill);
      if (!density) {
        density = [
          -Math.log(Math.max(hull.fill[0], 0.003)),
          -Math.log(Math.max(hull.fill[1], 0.003)),
          -Math.log(Math.max(hull.fill[2], 0.003))
        ];
        if (pigmentPalette.size >= 256)
          pigmentPalette.delete(pigmentPalette.keys().next().value!);
        pigmentPalette.set(hull.fill, density);
      }
      const coverage = -Math.log(
        1 - Math.max(0, Math.min(0.9999, hull.fillOpacity))
      );
      for (let channel = 0; channel < 3; channel++) {
        put(at + 4 + channel, density[channel]! * coverage);
        put(at + 8 + channel, hull.stroke[channel]!);
      }
      put(at + 7, coverage);
      put(at + 11, hull.strokeOpacity);
    }
    if (changed) {
      table.needsUpdate = true;
      // Upload requests, including the small material texture, not GL timings.
      bufferUploads++;
    }
  };

  const updatePoints = (scene: GeographicPreparedScene) => {
    let changed = false;
    if (scene.points.length > pointCapacity) {
      pointCapacity =
        2 ** Math.ceil(Math.log2(Math.max(1, scene.points.length)));
      pointData = new Float32Array(pointCapacity * 9);
      pointBuffer = new InstancedInterleavedBuffer(pointData, 9);
      pointBuffer.setUsage(DynamicDrawUsage);
      const geometry = new InstancedBufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          2
        )
      );
      geometry.setAttribute(
        "center",
        new InterleavedBufferAttribute(pointBuffer, 2, 0)
      );
      geometry.setAttribute(
        "display",
        new InterleavedBufferAttribute(pointBuffer, 3, 2)
      );
      geometry.setAttribute(
        "color",
        new InterleavedBufferAttribute(pointBuffer, 4, 5)
      );
      pointMesh.geometry.dispose();
      pointMesh.geometry = geometry;
      changed = true;
      bufferUploads++;
    }
    const put = (at: number, value: number) => {
      const next = Math.fround(value);
      if (pointData[at] !== next) {
        pointData[at] = next;
        changed = true;
      }
    };
    for (const [index, point] of scene.points.entries()) {
      const at = index * 9;
      put(at, point.x);
      put(at + 1, point.y);
      put(at + 2, point.radius);
      put(at + 3, point.strokeWidth);
      put(at + 4, point.opacity);
      for (let channel = 0; channel < 4; channel++)
        put(at + 5 + channel, point.fill[channel]!);
    }
    pointMesh.geometry.instanceCount = scene.points.length;
    if (changed && pointBuffer) {
      pointBuffer.needsUpdate = true;
      bufferUploads++;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    prepare.dispose();
    pigmentPalette.clear();
    for (const mesh of [hullMesh, strokeMesh, pointMesh, quad])
      mesh.geometry.dispose();
    for (const shader of [
      hullMaterial,
      strokeMaterial,
      pointMaterial,
      blurMaterial,
      resolveMaterial
    ])
      shader.dispose();
    table.dispose();
    accumulation.dispose();
    blurred.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  // Fail at mount rather than silently presenting empty float-target Hulls.
  try {
    renderer.setRenderTarget(accumulation);
    if (
      context.checkFramebufferStatus(context.FRAMEBUFFER) !==
      context.FRAMEBUFFER_COMPLETE
    )
      throw Error("three_pigment_framebuffer_unavailable");
    renderer.setRenderTarget(null);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    render(scene, frame) {
      if (disposed || context.isContextLost())
        throw Error("three_context_lost");
      if (scene.size.width <= 0 || scene.size.height <= 0) return false;
      if (
        width !== scene.size.width ||
        height !== scene.size.height ||
        pixelRatio !== frame.dpr
      ) {
        width = scene.size.width;
        height = scene.size.height;
        pixelRatio = frame.dpr;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        viewport.value.set(width, height);
        const scale = Math.min(1, Math.sqrt(300_000 / (width * height)));
        targetWidth = Math.max(1, Math.floor(width * scale));
        targetHeight = Math.max(1, Math.floor(height * scale));
        accumulation.setSize(targetWidth, targetHeight);
        blurred.setSize(targetWidth, targetHeight);
      }
      const prepared = prepare.prepare(scene, frame);
      meshBuilds = prepared.meshBuilds;
      hullCount = prepared.hulls.length;
      pointCount = prepared.points.length;
      rebuildHulls(prepared);
      updateTable(prepared);
      updatePoints(prepared);
      cameraTransform.value.fromArray(prepared.camera);
      border.value.fromArray(frame.pointStroke);
      hullMesh.visible = hullCount > 0;
      strokeMesh.visible = hullCount > 0;
      pointMesh.visible = pointCount > 0;
      renderer.info.reset();
      renderer.setRenderTarget(accumulation);
      renderer.clear();
      renderer.render(hullScene, camera);
      const soft = frame.edgeStrategy === "native" && hullCount > 0;
      if (soft) {
        quad.material = blurMaterial;
        blurMaterial.uniforms.blurStep!.value.set(0.75 / width, 0);
        renderer.setRenderTarget(blurred);
        renderer.render(quadScene, camera);
      }
      renderer.setRenderTarget(null);
      renderer.clear();
      quad.material = resolveMaterial;
      resolveMaterial.uniforms.source!.value = soft
        ? blurred.texture
        : accumulation.texture;
      resolveMaterial.uniforms.blurStep!.value.set(0, soft ? 0.75 / height : 0);
      renderer.render(quadScene, camera);
      renderer.render(detailScene, camera);
      // A complete float framebuffer does not prove that the driver's blend
      // path works. Check once after a real Hull draw, never in steady frames.
      if (!floatDrawVerified && hullCount > 0) {
        if (context.getError() !== context.NO_ERROR)
          throw Error("three_pigment_draw_unavailable");
        floatDrawVerified = true;
      }
      return prepared.animating;
    },
    stats() {
      return {
        drawCalls: renderer.info.render.calls,
        meshBuilds,
        bufferUploads,
        resourceCount:
          renderer.info.memory.geometries + renderer.info.memory.textures,
        resourceBytes:
          geometryBytes +
          pointData.byteLength +
          48 +
          tableData.byteLength +
          targetWidth * targetHeight * 16,
        hullCount,
        pointCount
      };
    },
    dispose
  };
}
