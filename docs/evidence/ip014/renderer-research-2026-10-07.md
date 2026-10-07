# IP-014 renderer research — 2026-10-07

Read current repository AGENTS/IS-001/CURRENT and handoff at `origin/docs/ip014-pluggable-renderer-handoff`; reviewed baseline `geographic-webgl.tsx` and `geographic-mesh.ts`. Upstream URLs below were fetched directly on 2026-10-07. This is capability research, not performance evidence; no claim of physical iPhone validation.

## Selection

Recommend **PixiJS 8 and Three.js**, alongside mandatory custom WebGL2 baseline. These give two meaningfully different mature resource/scene pipelines without spending the slice wiring redundant custom engines. A third backend is optional, not needed to meet the handoff's 2–4 alternatives.

| Candidate | Relevant native path | Pigment / edge support | Practical disposition |
|---|---|---|---|
| Current custom WebGL2 | Existing cached hull VAOs/buffers and instanced point quads; shader camera for hulls | Six-band K/S additive MRT then resolve; CPU inset coat meshes | Preserve as baseline. Actual code requires `EXT_color_buffer_float`; screen-coordinate point attributes are still rewritten. Its implementation choices are not the visual contract. |
| PixiJS 8 | Persistent Mesh/MeshGeometry or GraphicsContext; batched small Graphics; ParticleContainer with explicit static/dynamic attributes; container transform | Custom Shader/Filter, RenderTexture, native Gaussian BlurFilter, multiply/advanced blending | **Implement.** Use WebGL renderer explicitly for reliable mobile path. Static point properties upload only on `update()`, dynamic ones every frame. Avoid hundreds of independently filtered hulls. |
| Three.js | Merged BufferGeometry for hulls, InstancedBufferGeometry for points, BufferAttribute needsUpdate/updateRanges; camera uniforms; explicit disposal | ShaderMaterial/RawShaderMaterial + custom blend state + persistent render targets | **Implement.** A few merged meshes and small uniforms fit this 2D use well; no need for lighting/3D objects per hull. `renderer.info` provides draw/resource counts. |
| deck.gl / luma.gl | ScatterplotLayer/SolidPolygonLayer + typed binary data/updateTriggers; luma Model + persistent Buffers, shader-input and pipeline caches | Custom layers / shader modules / render passes, arbitrary FBOs | Credible future candidate; exclude for this checkpoint because existing Atropos already owns camera, picking, representation, and data transitions. Deck duplicates those concerns; custom pigment/edge still needs a custom luma pass. Direct luma is viable but is a third low-level custom renderer, adding less architectural variety than Pixi/Three. This is a scope selection, not incapability. |
| regl | Compiled draw commands, resource handles, `buffer.subdata`, batched command execution, extension instancing/FBOs | Fully custom shaders, blend state, framebuffer passes | Exclude for checkpoint: current upstream context creator requests WebGL1; instancing/MRT/VAO docs rely on extensions. Good low-overhead commands, but less native WebGL2/resource-stack breadth than selected candidates and closer to current custom painter. Not inherently too slow. |

## Native implementation recommendations

### Common preparation boundary

- Normalize one Moirai-specific hull/point scene; backends do not interpret GraphShell domain state independently.
- Cache path flattening/triangulation by stable hull geometry identity. A one-time CPU triangulation is appropriate; a repeated pinch-triggered geometry regeneration is not.
- Store persistent untransformed vertices and per-hull IDs/attributes; camera belongs in a uniform/container transform. Point positions should likewise stay in scene coordinates where current upstream input allows this.
- Group opacity/color/transition data independently of positions, so a representation transition does not invalidate every position buffer.
- Keep native SVG labels, relations, hit targets and GraphShell input; every backend shares the same camera/frame mapping.

### PixiJS 8

- Persistent hull MeshGeometry or retained GraphicsContext; tint/alpha/container transform updates do not require path rebuilding. Pixi performance docs explicitly advise static Graphics and say Graphics under about 100 points can batch.
- ParticleContainer is the native fast path for many point glyphs, with an antialiased circular texture shared by all particles. Set immutable positions and geometry as static; call `update()` only when the point scene changes. If point radii must stay in screen pixels while the world container scales, use an instance/custom mesh shader instead of rewriting every position.
- Use a shared hull-only `BlurFilter` at controlled resolution/quality, explicit `filterArea`, no points/text in the blur input. Native blur has independent X/Y passes and defaults that should be deliberately bounded. Avoid one full-resolution filter per hull; Pixi warns many filters cause slowdowns.
- A multiply blend on white is an inexpensive subtractive approximation but can darken saturated complementary colors. Expose the approximation honestly. A custom accumulation+resolve Filter is feasible if a better mixing strategy is useful.

### Three.js

- Merge triangle hull vertices into a persistent BufferGeometry; include material/opacity attributes or use a material table. Use a dedicated instanced quad geometry for Event/Composite glyphs and analytic circle coverage in its fragment shader.
- Use `BufferAttribute.needsUpdate` only for changed arrays; `addUpdateRange` can limit partial attribute uploads. Camera is a uniform or orthographic matrix; disable unnecessary depth work.
- Use a persistent downsampled render target for hull accumulation, two small separable Gaussian passes, then a full-size composite/resolve. Keep strokes and points crisp in a later pass. Reallocate only on canvas size/DPR change.
- `renderer.info.autoReset=false`, reset once per entire multi-pass frame, otherwise reported calls show only the final pass. Resource counts are counts, not GPU-byte claims.

## Pigment and edge design

- **One additive accumulation target with RGB optical density + mass** is a useful cheap alternative: material table stores `-log(max(color,epsilon))`; accumulate `OD * mass` and mass; optionally blur this linear accumulation; resolve `exp(-sumOD/max(sumMass,epsilon))`, coverage `1-exp(-sumCoverage)`. With mass also used for coverage this fits one RGBA target. Normalization prevents repeated same-color layers becoming black immediately. Separating mass/coverage requires another channel/target or a policy tying the two.
- Optical density is **RGB subtractive approximation**, not a spectral paint claim. Blue+yellow may become too dark/gray instead of plausible green. Plain multiply has the same caveat. If the resulting actual screen fails the requested pigment feel, retain a small cached reduced-spectral material table and improve geometry/edge architecture rather than pretending ordinary alpha is equivalent.
- A cached spectral material conversion is not itself the likely bottleneck; retaining it with merged geometry, native resources and GPU blur is a legitimate independent implementation. Do not mechanically retain four inset coats and their draw multiplication.
- Blur **accumulated linear material/coverage**, then resolve pigment. Because convolution is linear, blur(sum of material contributions) equals sum(blurred contributions), avoiding a filter per hull. Blurring the final already-resolved pigment image is cheaper to wire but creates a visibly different boundary/overlap approximation; label it.
- Full-view Gaussian at native device DPR can be bandwidth-heavy. Use a fixed small radius and capped/downsampled target, and keep crisp points/labels/strokes outside it. This checkpoint needs qualitative comparison, not a blur tuning benchmark.

## Official source links / observed facts

1. Pixi renderers (WebGL/WebGL2 recommended; WebGPU browser inconsistencies): https://pixijs.com/8.x/guides/components/renderers
2. Pixi Mesh (geometry, shaders, WebGL/WebGPU state, direct buffers): https://pixijs.com/8.x/guides/components/scene-objects/mesh
3. Pixi ParticleContainer (static vs dynamic GPU uploads; API marked stable but experimental): https://pixijs.com/8.x/guides/components/scene-objects/particle-container
4. Pixi filters/custom shader resources: https://pixijs.com/8.x/guides/components/filters
5. Pixi BlurFilter (Gaussian, quality passes, separate axes): https://pixijs.download/release/docs/filters.BlurFilter.html
6. Pixi performance (static Graphics, batching, filterArea, filter/blend breaks): https://pixijs.com/8.x/guides/concepts/performance-tips
7. Three instanced geometry: https://threejs.org/docs/pages/InstancedBufferGeometry.html
8. Three persistent attributes / update ranges: https://threejs.org/docs/pages/BufferAttribute.html
9. Three render targets / attachments / lifetime: https://threejs.org/docs/pages/RenderTarget.html
10. Three WebGLRenderer / diagnostics: https://threejs.org/docs/pages/WebGLRenderer.html
11. deck performance (data identity, updateTriggers, binary attributes, phone memory sensitivity): https://deck.gl/docs/developer-guide/performance
12. luma Model (instancing, attributes, shader-input/pipeline caches, render passes): https://luma.gl/docs/api-reference/engine/model
13. luma Device (WebGL2/WebGPU, resource creation, capability queries): https://luma.gl/docs/api-reference/core/device
14. regl resource/command architecture: https://github.com/regl-project/regl/blob/main/README.md
15. regl API (subdata, instancing, framebuffers, destruction): https://github.com/regl-project/regl/blob/main/API.md
16. regl current context creation (WebGL1 names): https://github.com/regl-project/regl/blob/main/lib/webgl.js

## iOS constraints and evidence limits

All candidates can coexist with a transparent canvas under SVG; none inherently requires replacing existing touch/camera input. Use capability checks and safe fallback rather than assuming float targets or context availability from the library name. Keep target sizes/resource lifetimes bounded because modern phones are more sensitive to GPU/browser memory pressure. No source reviewed establishes that hundreds of hulls/thousands of points are a modern iPhone GPU limit. Cloud software GPU / WebKit smoke is functional evidence only; user iPhone 17 Safari and installed PWA remain the comparison surface.


## Checkpoint implementation decision

Installed exact versions: PixiJS **8.22.0**, Three.js **0.186.1**. Each alternative uses engine-owned persistent merged Mesh/BufferGeometry resources, an instanced point batch, float render textures, and custom shaders. Neither instantiates one scene object/filter per Hull.

Pixi's built-in BlurFilter uses pooled intermediate textures without preserving the float input format. Because an accumulated pigment mass can exceed one, that default pool would clamp the signal. The implemented Pixi path therefore uses engine-native RGBA16F RenderTextures and two small Gaussian Mesh passes, followed by pigment resolve. Three uses two persistent WebGLRenderTargets and fuses the second Gaussian axis with resolve. These are substantive native resource/submission paths, not wrappers calling the old WebGL painter.

Both alternate pigments are normalized RGB optical density (order-independent but approximate); both feather the whole Hull accumulation layer uniformly. Authored stroke opacity is still applied crisply after resolve. The baseline retains its six-band pigment and representation-dependent inset feather. Alternative hard-edge mode is the one implemented secondary strategy; no unimplemented pigment selector is exposed. Their kernels and target resolution differ, so this checkpoint is a direct qualitative comparison, not controlled benchmark parity.
