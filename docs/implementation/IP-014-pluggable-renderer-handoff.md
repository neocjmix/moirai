# IP-014 — Pluggable rendering backend exploration handoff

Status: **active exploratory implementation slice**  
Date: 2026-10-07  
Baseline main: `3bfb4a4d120afa171d20c262a66bd9601593c494` (#336)

## 1. Why this slice exists

Atropos now has a custom WebGL2 painter with cached meshes, instanced points, six-band spectral pigment accumulation, soft Hull edges and bounded zoom reuse. #335 established the current white-background/pigment visual language; #336 reduced minimum-zoom work substantially, but the resulting interaction still feels slow relative to the modest visible scene complexity and to the expected capability of a modern mobile GPU.

The current implementation is therefore a **baseline, not the rendering specification**.

This slice asks a broader question before spending more effort micro-optimizing that baseline:

> Can Moirai express the same visual/interaction language through a better rendering architecture or mature GPU engine, with substantially lower CPU/main-thread overhead and better use of modern mobile GPUs?

The immediate goal is not to pick a winner or produce exhaustive benchmarks. It is to make several credible render backends work in the real Atropos scene, expose them through settings, and let the user compare them directly on the actual iPhone/Safari/PWA workflow. Only after that comparison should one path receive deep optimization.

This is a new renderer-architecture exploration slice. It does not rewrite the historical IP-012 performance closeout or claim that prior measurements passed. Cloud WebKit/EGL measurements are not real iPhone GPU evidence; CURRENT already records that the cloud native EGL path is llvmpipe.

## 2. Product-level rendering specification

Preserve the evolved Atropos UX and semantic roles:

- World/revision and Collection selection.
- Camera, pan, pinch zoom and inertia semantics.
- Event and Composite selection.
- Native SVG text/relation/input overlay unless a backend can replace a piece without losing authored identity or interaction behavior.
- Composite hierarchy and representation transitions.
- Authored Composite colors.
- Existing HUD/drawer/navigation behavior.
- Read-only historical data and Publication invariants.

The desired visual language is:

- many Event points and Composite/Hull shapes remain fluid on modern mobile hardware;
- Hulls read as translucent marker/ink/pigment on white paper rather than generic alpha UI layers;
- overlapping differently colored Hulls produce natural subtractive/pigment-like mixtures;
- Hull boundaries are softly feathered rather than mechanically hard;
- labels, points and interaction remain crisp and aligned;
- visual density/LOD decisions are driven primarily by information design, not used as the first escape hatch for renderer inefficiency.

Do **not** define the specification as “Spectral.js”, “six bands”, “RGBA16F MRT”, “four inset coats”, “WebGL2”, or any current implementation detail.

## 3. Performance assumption

Treat the present scene size—hundreds of Composite/Hull polygons plus substantially more Event points—as modest for a modern mobile GPU when geometry and state are organized appropriately.

Do not assume that the way to recover performance is:

```text
slow
→ hide more Hulls
→ collapse to points earlier
→ reduce visual information
```

Before reducing visual complexity, investigate whether the renderer is failing to keep stable data GPU-resident, is rebuilding geometry unnecessarily, is issuing too many draws/state changes, is uploading buffers repeatedly, or is blocked by React/JS/SVG/main-thread work.

A useful steady-state target architecture is conceptually:

```text
published/render scene
        ↓
infrequent preparation
        ↓
persistent GPU buffers / textures
        ↓
---------------- frame loop ----------------
camera + time + transition/visibility parameters
        ↓
small uniform / instance updates
        ↓
GPU render
```

Pan of unchanged geometry should not require reconstructing the scene.

## 4. Research and backend selection

Inspect current code and current upstream documentation before choosing implementations. At minimum evaluate:

- current custom WebGL2 — mandatory baseline;
- deck.gl / luma.gl;
- PixiJS 8;
- regl;
- Three.js.

Explore additional mature candidates if they better fit this problem.

Select roughly **2–4 credible alternative backends**, in addition to the current WebGL2 baseline. Do not implement a famous library merely to fill the list. Exclude candidates with a short recorded reason when their abstraction or mobile path is clearly unsuitable.

Important capabilities:

- WebGL2 or equivalent GPU acceleration;
- efficient batching/instancing for Event points;
- arbitrary Hull/polygon meshes;
- persistent GPU resources and dirty/attribute updates;
- camera transform without geometry regeneration;
- custom shaders and blending;
- render targets / framebuffer / multi-pass support;
- practical pigment/subtractive composition;
- practical GPU-native edge treatment;
- authored colors and opacity transitions;
- coexistence with current SVG interaction/text overlay;
- viable iOS Safari behavior;
- React integration without forcing GPU resource churn.

Secondary advantages include GPU picking, OffscreenCanvas/worker options and a credible WebGPU path, but do not perform a premature WebGPU rewrite.

## 5. Introduce a stable renderer backend boundary

Separate **what Atropos renders** from **which engine renders it**.

Aim for a structure equivalent to:

```text
Moirai semantic/render data
          ↓
GeographicRenderScene
          ↓
GeographicRendererBackend
          ├─ custom-webgl2
          ├─ candidate-a
          ├─ candidate-b
          └─ candidate-c
```

Exact names are implementation choices.

The backend contract may resemble:

```ts
interface GeographicRendererBackend {
  mount(...): void;
  resize(...): void;
  render(scene: GeographicRenderScene, frame: RenderFrame): void;
  dispose(): void;
}
```

Add capabilities/stats/invalidation/camera methods only where they represent real shared needs. Do not leak Pixi/deck/regl/Three-specific objects through the common contract.

Backend code should not independently reinterpret React/GraphShell/domain state. Produce one normalized render scene containing, as needed:

- regions / Composite Hulls;
- stable Hull geometry identity;
- Event and Composite points;
- authored colors/material identity;
- opacity and representation state;
- camera and viewport;
- fill/stroke;
- transition parameters.

Keep the contract narrow and Moirai-specific rather than inventing a general graphics engine.

## 6. Preserve the current renderer as the baseline

The current implementation remains selectable as an explicit `custom-webgl2`-style backend.

Preserve its relevant behavior:

- mesh/cache and bounded zoom reuse;
- current six-band spectral pigment path;
- current edge treatment;
- stroke;
- instanced points;
- transitions;
- resource budgets/fallback;
- SVG interaction/text coexistence.

Do not delete it merely because another backend becomes promising.

## 7. Backend-native implementations, not API translations

For each alternative backend, implement at minimum:

- Hulls;
- authored Hull colors and opacity;
- Event points;
- Composite points;
- pan;
- pinch zoom;
- representation transition;
- alignment with existing SVG labels/input overlay.

Preserve pigment, soft edges and strokes where practical, but **do not port the current implementation mechanically**.

Use each engine's natural fast path: batching, instancing, persistent attributes, filters, render textures, custom layers, resource pooling, etc.

The comparison is:

> How efficiently can each engine satisfy Moirai's visual and interaction requirements?

It is not:

> How fast can each engine reproduce the exact internal algorithm of `geographic-webgl.tsx`?

## 8. Edge treatment: visual requirement, not four-coat geometry

The current feather implementation uses `clipper2-ts` inward offsets and multiple geometry coats. This is only the current baseline technique.

The requirement is a soft, roughly screen-space-stable Hull boundary with the visual character of translucent marker/ink/pigment on paper.

For each backend, use the most appropriate efficient technique. Investigate as relevant:

- small-radius separable Gaussian blur;
- dual/dual-Kawase blur;
- render-texture/filter blur;
- fragment-shader analytic feather;
- SDF/distance-based edge treatment;
- backend-native GPU filters;
- other credible GPU-native methods.

Do not use Gaussian blur merely by name. A full-resolution multi-pass screen blur can be worse than the current method. Prefer bounded/downsampled/local render targets or analytic techniques where appropriate.

If useful, keep current WebGL edge strategies selectable during exploration, e.g. legacy geometry versus a GPU-native alternative. Do not create a combinatorial matrix merely for completeness.

## 9. Pigment mixing: visual requirement, not Spectral.js

The current Spectral.js-derived six-band Kubelka–Munk approximation and RGBA16F accumulation are a baseline technique, not a product requirement.

The requirement is natural subtractive/pigment-like mixing:

- a single Hull remains close to its authored color;
- differently colored overlaps create plausible pigment mixtures rather than ordinary source-over interpolation;
- repeated overlap does not immediately collapse to black/gray;
- results are preferably order-independent or only weakly order-dependent;
- opacity/coverage/concentration behave coherently;
- white-paper appearance is preserved.

Choose the best technique per backend. Candidates may include:

- Kubelka–Munk;
- reduced spectral bases;
- spectral or pigment LUTs;
- optical-density accumulation;
- perceptual/RYB approximations;
- custom subtractive blends;
- MRT accumulation;
- texture lookup/material tables;
- backend-native custom filter/material passes.

Scientific paint simulation is not the goal. Visual quality, stability, mobile GPU cost and maintainability matter more than preserving a particular spectral algorithm.

Treat these as separate axes:

```text
geometry
pigment mixing
edge treatment
```

Do not let feather geometry multiply pigment draws merely because the current implementation does.

## 10. Audit the CPU ↔ GPU responsibility boundary

Renderer comparison must include a lightweight architectural audit of work currently performed on CPU/JS/main thread that could be more naturally persistent or computed on the GPU.

Inspect especially:

- path flattening;
- polygon triangulation;
- Hull inset/offset generation;
- feather geometry generation;
- zoom-triggered geometry regeneration;
- CPU coordinate transforms;
- point transforms;
- per-object transition calculations;
- per-Hull material preparation;
- visibility/culling;
- typed-array construction;
- buffer uploads;
- per-Hull draw orchestration/state changes;
- geometry duplication for multiple visual effects;
- React reconciliation/state propagation;
- SVG updates/layout/style;
- CPU↔GPU synchronization/readback.

Do not move work to the GPU merely because it is possible. Evaluate approximately:

```text
frequency × cost × transferred data × synchronization
```

One-time CPU triangulation cached for a World may be perfectly reasonable. Similar geometry work repeated during every pinch is not.

Examples worth considering where appropriate:

```text
CPU transformed vertices
→ static vertices + camera uniform

repeated geometry
→ instancing

multiple feather polygons
→ GPU filter / analytic edge / distance field

per-object CPU tween
→ start/target/time attributes + shader interpolation

many equivalent draws
→ batching/instancing

repeated material math
→ material table/LUT/texture

frequent geometry rebuild
→ stable geometry + shader transform
```

At the end, be able to identify structural findings such as “X was rebuilt on CPU during pinch” or “the GPU was cheap but React/SVG preparation dominated”. Do not spend this slice fixing every finding.

## 11. Settings: direct user comparison

Expose implemented render backends in the existing appropriate settings/experimental UI.

Example:

```text
Rendering engine
● Current WebGL2
○ PixiJS
○ deck/luma
○ ...
```

Only show implemented backends.

Switching may remount the renderer, but preserve:

- World/revision;
- Collections;
- camera/zoom;
- current Event/Composite selection.

Persist the preference locally. The safe default remains the current production backend until a later decision changes it.

Where there are genuinely useful alternative pigment or edge strategies, expose those too, without generating a meaningless cross-product of options.

Example:

```text
Rendering engine  [Current WebGL2 ▼]
Pigment mixing    [Spectral 6-band ▼]
Edge treatment    [GPU Gaussian ▼]
```

Unsupported combinations should be disabled or represented by backend capabilities.

## 12. Capability and lightweight diagnostics UI

Expose enough information for direct exploratory comparison.

For each backend, report capabilities such as:

```text
Pigment: exact / approximate / unsupported
Edge: geometry / gaussian / kawase / analytic / native
Points: instanced / batched / ...
```

Add lightweight runtime telemetry where it can be measured honestly:

- rolling frame/frame interval or renderer frame time;
- visible Hull count;
- visible point count;
- draw calls if the engine exposes them reliably;
- geometry/mesh rebuild count;
- buffer upload count;
- approximate resource count/memory where credible.

Do not fabricate GPU timing or memory numbers that the API cannot provide.

This is an exploratory instrument, not the final benchmark suite.

## 13. Breadth first; do not burn the task on benchmarking

This slice intentionally prefers breadth.

Do **not** spend most of the task on:

- exhaustive synthetic benchmarks;
- long repeated performance runs;
- pixel-perfect equivalence across engines;
- shader micro-optimization;
- production-hardening every backend;
- every browser combination;
- premature WebGPU migration;
- tuning a backend to win before the user sees the comparison.

Get several credible options running in the actual Atropos UI first.

Run only enough automated verification to ensure each backend:

- mounts;
- renders World/Hulls/Events;
- survives pan and zoom;
- remains aligned with SVG interaction/text;
- preserves camera during backend switching;
- disposes cleanly enough to avoid obvious context/resource leaks;
- falls back safely when unsupported.

Use relevant existing regression subsets; do not weaken meaningful assertions to force a candidate through.

## 14. Evaluation philosophy

Do not treat “hundreds of polygons” as a stress case by default.

If an engine needs early LOD collapse simply to keep that scene interactive, investigate the architecture before accepting the degradation.

The first user-facing question is qualitative and obvious:

> Does one of these implementations make the current scene feel as fluid as its visual complexity suggests it should be?

Only after the user directly compares the implementations should we decide which backend/pigment/edge combination deserves serious profiling and optimization.

## 15. Scope and safety

This is a rendering architecture experiment, not a domain/publication rewrite.

Do not modify canonical historical data, World/Event/Collection semantics, Publication identity, or layout coordinates to make a renderer easier.

Keep the current renderer and fallbacks recoverable.

Do not add a paid service.

Follow AGENTS/IS-001 mobile-first checkpoint rules. The user's real iPhone Safari/PWA observation remains the primary qualitative acceptance surface.

## 16. Deliverable and stop condition

When the exploratory slice is usable, deploy a checkpoint and stop before deep optimization.

Report only:

1. implemented backend list;
2. major candidates investigated but excluded, with one-line reasons;
3. how to switch renderers/settings;
4. pigment/edge capability or approximation differences;
5. obvious structural CPU↔GPU findings;
6. only obvious performance/visual differences, not an overclaimed benchmark conclusion;
7. public mobile URL;
8. commit/deployed SHA and relevant smoke/regression result;
9. known risks/unverified areas.

Then wait for the user to directly compare the options and choose what to tighten next.

## 17. Core rule

**The current implementation is the baseline, not the specification.**

The specification is the Moirai visual/interaction language plus the expectation that a scene of this scale should be delivered to modern mobile graphics hardware efficiently.
