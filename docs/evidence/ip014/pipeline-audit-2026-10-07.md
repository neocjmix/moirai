# IP-014 code audit (2026-10-07)

Audited current main-era files and IP-014 from origin/docs/ip014-pluggable-renderer-handoff. Relevant immutable contracts: CON-003 World identity and representation, CON-005 Publication boundary, BR-003 reader/navigation/density, TS-006 Render vs semantic read and local interaction. No domain/publication changes are needed.

## Actual pipeline and seam

1. `components/v5-atropos-root.tsx:96` (`V5GraphApp`) owns revision-scoped `createV5RenderTileClient` and selection-scoped `createV5GraphReadLoader`; immutable render working set survives Collection loader changes.
2. `lib/v5-graph-read-loader.ts:53` asks the tile client for bounded metadata + geometry. `lib/v5-render-viewport.ts:9` (`renderTileViewport`) adapts publication point/line/polygon primitives into the existing GraphShell entities; published region polygons arrive as `preparedWorldHull`.
3. `urdr-port/src/components/graph-shell.tsx:2941` preserves geometry identity; `preparedWorldCompositeRegions` at 2995 performs CPU world geometry preparation. `worldPointQuery`/`worldCompositeRegions` do CPU viewport candidate selection. They are useful CPU responsibilities, not inherently GPU migration targets.
4. `chartCompositeRegions` at 3045 runs on camera/stage changes: CPU projection, hierarchy stage interpolation, padded spline preparation, polygon/viewport clipping, coverage, label placement, descendant opacity and label policy. `composite-pan-geometry.ts:53` caches expanded spline contours only at exactly the same scale; pan returns the old path plus translation. Every changed scale rebuilds padded screen contours, even when the downstream baseline mesh accepts bounded reuse.
5. `pointProjection` at 2970 creates screen coordinates per camera; `chartInstantPoints` at 3365 filters, sorts and applies point label policy. `visibleCompositeRegions` at 3211 and `paintedPoints` at 3431 retain paint identity/exit fades. `semanticSelection` at 3391 selects SVG labels; `presentedRegions` at 3446 is the final region set.
6. The exact painter seam is GraphShell JSX around 4234: current `GeographicWebGL`/`GeographicCanvas` receive `presentedRegions`, `paintedPoints`, `compositeStyleById`, `view`, `viewportSize`, fill/stroke opacity. SVG immediately after this retains authored IDs, transparent hit paths, native text, relations and selection. Change only this painter boundary for baseline + alternatives.

## Baseline CPU / GPU split

`components/geographic-webgl.tsx:createPainter` persists GL programs, cached meshes/VAOs, palette, point buffers and three target textures. Hull transforms are already camera uniforms. Instanced point quads and analytic point edge alpha are already on GPU. Float pigment is additive 6-band K/S + optical coverage into two RGBA16F targets, resolved then copied to the final surface. Pigment targets are bounded at 300,000 CSS pixels; point/stroke canvas at DPR 1.5 and 4,000,000 pixels.

CPU per frame: live ID sets, mesh cache bookkeeping, retained-frame camera matrices, tween Map traversal for each Hull/radius/stroke/alpha, color lookup/material cache lookup, optical density scalar, transformed point centers, JS `dots` array, `Float32Array(dots)` and `bufferData(DYNAMIC_DRAW)` for every point instance. Hulls use one or more pigment draws per Hull plus separate stroke draws, with per-Hull uniforms/state orchestration.

CPU on changed contour: `geographic-mesh.ts:flattenGeographicPath` parses M/L/C/Z and adaptively flattens Béziers to 0.35 px; `geographicMesh` uses ear clipping (nested candidates + all-vertex containment checks), emits nonindexed fill and six extrusion vertices per edge; then uploads static buffers and allocates VAOs. `geographic-mesh-reuse.ts` parses exact path controls and compares their screen error to 0.75 px, with 0.8–1.2 scale guard. Reuse reduces baseline GPU geometry rebuilds but does not remove the upstream contour rebuild.

CPU feather: `hull-feather.ts:geometryFor` flattens the path again, calls Clipper inward offsets, builds inset SVG strings, caches per path/width. Baseline then triangulates/uploads each inset and emits extra pigment draws. Two coats in current WebGL; four in SVG/Canvas fallback. This is the clearest native filter/analytic edge replacement candidate; do not copy it into alternatives.

GPU sync: no recurring `readPixels`. Palette parsing uses a one-pixel Canvas2D `getImageData` only per new color (bounded cache). Framebuffer completeness is checked after allocation; `getError` only after first real float accumulation; `isContextLost` each draw. Do not call this a demonstrated GPU synchronization bottleneck without measurements.

## Obvious structural findings (not benchmark conclusions)

- Camera-driven React state batches once per animation frame (`flushViewportMoves`, GraphShell 3772) and runs whole GraphShell preparation/JSX/SVG commit. Backend replacement alone cannot eliminate it. Native text/interaction are explicitly retained by scope.
- Zoom changes screen-space padded contour identity upstream; bounded baseline mesh reuse merely absorbs some resulting error. Stable world/support geometry plus a GPU screen-space offset could address this later, but changing padding must preserve the evolved contour specification.
- Instanced points still get CPU transformed and fully uploaded every draw. Alternatives can retain stable coordinates and use a camera transform plus dirty instance updates.
- Feather geometry multiplies geometry preparation, uploads and pigment draws. Filter/analytic edge is a separate axis from pigment composition.
- Hull cache has a hard `128` mesh / 8 MB limit (`geographic-webgl.tsx:589`, 737), triggering full SVG fallback; this is an implementation budget, not evidence that hundreds of Hulls exceed mobile GPU capacity.
- Per-Hull material math is mostly already cached (`lib/spectral-pigment.ts` cache 128, palette about 12 colors), so do not prioritize moving expensive Spectral.js work presumed to recur per pixel/frame. GPU performs the pixel mixing.
- Baseline memory counters report allocated mesh/target bytes, not device GPU memory. `onDraw` is CPU submission duration, not GPU elapsed time.

## Narrow renderer-neutral scene recommendation

Normalize once at the painter seam; alternative engines must not import GraphShell state or infer contains/Collection/representation rules. A Moirai scene can carry:

```
regions: id, stable geometry object/key, local contour/triangles + original path if baseline requires,
         geometry anchor view/viewport, local-to-current affine transform,
         authored fill/stroke material, target hull alpha/stroke alpha,
         point position/density/alpha, transition state
points:  id, kind event|composite, stable/anchor coordinates, radius, stroke, alpha, material
frame:   camera {x,y,scaleX,scaleY}, viewport {width,height}, now, reducedMotion
```

Prefer a retained geometry object with separate transform over a normalized new vertex array each pan. Stable identity must include geometry content/version, not region ID alone; incoming revisions may reuse IDs with different support. Keep geometry, pigment strategy and edge strategy independent. `mount`/`resize`/`render(scene, frame)`/`dispose` plus truthful capabilities/stats is sufficient. Existing baseline can adapt this contract while preserving its own mesh/feather/spectral path.

## UI and fallback

Actual settings lives in `urdr-port/src/App.tsx:277`; the settings copy in GraphShell is unused. `App.renderPage()` unmounts GraphShell when leaving graph for settings. Either keep GraphShell mounted behind settings or expose an inline graph settings sheet; simply persisting a renderer preference does not guarantee same camera/selection on a full graph remount. Key only the painter host by backend, never GraphShell. Keep `?gsGraphics=svg` and `canvas` diagnostic fallbacks. Current failure handler at GraphShell 2339 disables both GPU/canvas and paints SVG; alternatives should fail back similarly, with an honest capability/failure state and no infinite remount retry.

Existing cheap counters: GraphShell `graphWorkCountsRef` at 2322, phase timing behind `?gsProfile=1`, inspection CustomEvent; baseline canvas dataset meshBuilds, meshReuses, meshZoomReuses, meshFeatherBuilds, pointCount, regionCount, pigmentDraws, pigmentBytes. Reuse these distinctions in UI instead of adding GPU timing claims.


## Implemented boundary and remaining work

`components/geographic-renderer/contract.ts` is the Moirai-specific scene/frame/backend boundary. Input preserves region identity, paint-frame geometry and representation targets produced by GraphShell. `scene.ts` is the shared alternative scene preparation: bounded retained triangulation, authored material parsing, fades, World point coordinates and camera transform. Engines receive no GraphShell/domain objects beyond this contract. `baseline-backend.ts` uses the same semantic scene with the unmodified baseline paint algorithm; its spectral/feather cache and resource budgets remain selectable.

Alternatives remove CPU inset/coat construction, per-Hull paint draws and screen-coordinate point uploads on camera-only moves. Hulls/strokes use merged persistent batches; points are instanced. Pixi factors the shared camera out of the Hull material table. Three currently updates a small Hull transform/material texture during pan; neither needs to rebuild triangles for unchanged pan geometry.

Remaining CPU work includes upstream camera-driven padded contours, repeated control comparison during pinch, shared CPU tweens, typed-array/table dirty comparisons, visibility/label policy and GraphShell/SVG commits. A changed Hull can still rebuild the merged batch. These are follow-up profiling candidates, not reasons to remove visual information. No frame-rate winner or physical-mobile GPU limit is inferred.

Diagnostics report rolling JavaScript renderer-call duration and active draw interval (idle gaps excluded), actual engine/submission draw counts, prepared visible Hull/point counts, cumulative mesh builds and explicit buffer/material texture upload requests. Memory is an estimate for owned geometry/material/target allocations, excluding browser/driver overhead and drawing buffers; no timer query, VRAM claim or recurring readback is added. Counts are scoped to the active backend lifetime.
