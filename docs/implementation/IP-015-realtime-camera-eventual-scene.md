# IP-015 — Realtime camera / eventual scene reconciliation handoff

Status: **next active Atropos performance slice**  
Date: 2026-10-08  
Baseline main: `da2bc71666bc40d61591f829e4c2313f723549cd` (#338)

## 1. Decision from IP-014

IP-014 answered the renderer-selection question sufficiently for the next step.

The user compared the deployed implementations on the real iPhone:

- current custom/raw WebGL2 is the fastest of the tested renderers;
- Three.js is roughly comparable but not faster enough to justify replacing the renderer;
- PixiJS is slower;
- Three's blurred Hull edge looks better than the current geometry-feather result;
- pan is normally fast;
- continuous zoom is slow, especially while zooming in;
- after zoom-in settles, pan becomes fast again;
- after zooming back out, subsequent pan can remain slow.

Therefore **renderer replacement is not the primary performance direction**. Keep the custom WebGL2 renderer as the production renderer and investigate the camera/scene preparation path.

IP-014's useful architectural output remains valuable: keep the renderer-neutral scene/backend boundary if it is clean and does not add material overhead. Remove the experimental PixiJS and Three.js runtime implementations, dependencies, settings choices and tests that exist only to support those engines. Do not undo a good separation between GraphShell scene semantics and the renderer merely because the experiment ended.

The renderer boundary should make a future backend replacement possible without making today's hot path more expensive.

## 2. Primary interaction rule

Adopt this design rule:

> **Camera is realtime; scene consistency is eventual.**

During pan/pinch/inertia, the first priority is that already-prepared visual content follows the user's fingers smoothly. Full frame-by-frame agreement of visibility, representation stage, padded Hull geometry, labels and support data is not required.

A stale but spatially correct scene is preferable to a semantically perfect frame that blocks interaction.

The live camera should be able to transform a stable prepared scene immediately while slower reconciliation catches up.

Conceptually:

```text
pointer / pinch / inertia
          |
          +--------------------------+
          |                          |
          v                          v
     live camera                reconciler
     realtime RAF              throttled work
          |                          |
          v                          v
 GPU transform of              next stable scene
 current stable scene          visibility / geometry /
          |                    representation / labels
          v                          |
       display <--------- atomic publish/swap
                                      |
gesture/inertia end ------------------+
        start latest full reconcile
        (do not block current display)
```

## 3. Do not drive expensive GraphShell reconciliation at gesture frequency

Audit the current gesture path and separate camera motion from expensive scene preparation.

Where practical, `liveCamera` should not require a full React/GraphShell render on every pointer/pinch frame. Prefer a ref/external camera channel that can update the active renderer transform directly.

Maintain a separate committed/reconciled camera for scene generation.

A prepared scene must remember the camera/frame in which it was prepared. Rendering a slightly stale scene at the current live camera should use a relative transform equivalent to:

```text
relativeAffine(liveCamera, sceneCamera)
```

so stale semantic/LOD state can still remain spatially attached to the current gesture. Compute this transform in the same coordinate convention already used by `geographicPaintTransform` (anisotropic `scaleX`/`scaleY` plus translation); the formula above is conceptual, not permission to introduce a mismatched generic matrix convention.

Do not sacrifice exact pointer-to-content spatial motion merely because semantic reconciliation is deferred.

## 4. Reconciliation cadence: hybrid throttle + final reconcile

Do not solve this with one global debounce.

A pure debounce would leave newly exposed areas stale/empty throughout a long gesture. Use tiered reconciliation.

Suggested model, to be tuned from behavior rather than treated as fixed constants:

- camera transform: every animation frame, no throttle;
- cheap bounds/visibility/support check: roughly 20–50 ms throttle if needed;
- expensive Composite geometry/representation/label reconciliation: roughly 80–200 ms throttle;
- gesture end: immediately **start/schedule the latest full reconcile**;
- inertia end: immediately **start/schedule the latest full reconcile**;

“Immediate” here does not mean synchronously blocking the main thread until the full scene is rebuilt. Keep displaying the current stable scene under the live camera while the final reconcile runs, then atomically publish its result.
- data/revision/Collection changes: preserve their required correctness semantics and reconcile promptly.

Intermediate reconciliation is desirable when it can be produced without compromising camera responsiveness. The exact frequencies are implementation choices.

Never queue every missed reconciliation. Latest state wins.

## 5. Stable-scene atomic replacement

Do not destroy the currently visible prepared scene when a new camera state begins.

Keep scene S0 rendering under the live camera while S1 is prepared. Publish S1 atomically when it is ready and still relevant.

Use generation/revision tokens so an expensive result calculated for an older camera can be discarded instead of committed after a newer result.

This is especially important if work moves to a worker.

## 6. Overscan and working-set policy

Use bounded overscan/support so ordinary pan can stay renderer-only for meaningful distances.

The prepared scene may cover a viewport larger than the visible viewport. Reconcile when the live camera approaches/exceeds the safe support region rather than on every translation.

Do not allow overscan to become an unbounded retained set.

Track at least conceptually:

- visible set;
- prepared/overscan set;
- query/support set;
- retained mesh/label/point set.

These sets must have explicit eviction/shrink behavior.

## 7. Investigate the zoom-out → slow pan symptom explicitly

This is a primary diagnostic target, not a side observation.

Observed device behavior:

```text
initial pan: fast
zoom in: slow while scaling
zoom-in settled pan: fast again
zoom out: slow while scaling
post-zoom-out pan: remains slower
```

This strongly suggests that zoom-out may enlarge a retained working set or leave work active that later pan continues to traverse, even when much of it is not visible.

Measure before and after the sequence:

- viewport query/support candidates;
- `worldCompositeRegions` / equivalent input count;
- `chartCompositeRegions` input/output count;
- visible/presented region count;
- retained region/mesh cache count;
- painted point count;
- label candidate and mounted SVG text/path counts;
- renderer Hull/point count;
- active tweens/transitions;
- pending reconciliation jobs;
- relevant cache sizes.

Determine whether objects that are no longer visible or no longer inside required overscan/support remain in per-pan CPU work.

Fix lifecycle/culling/eviction rather than merely increasing a cache cap.

## 8. Zoom-dependent geometry is the first structural hotspot

The current audit found that `composite-pan-geometry` can reuse expanded contours at the same scale, while changed scale rebuilds padded screen-space contours. Downstream bounded mesh reuse reduces some triangulation/upload cost but does not remove the upstream zoom work.

Inspect and instrument:

- `chartCompositeRegions`;
- padded spline/contour preparation;
- polygon/viewport clipping;
- coverage calculations;
- label placement/policy;
- representation/hierarchy interpolation;
- path serialization;
- `geographicPathControls`;
- `reusableGeographicPaintTransform`;
- actual triangulation/upload.

Do not optimize all of them blindly. Establish which stages run during pinch and which dominate or grow with the retained working set.

The desired long-term direction is to keep stable World/support geometry independent of the camera wherever semantics permit, and express camera scale/padding/edge behavior as transforms or GPU-side screen-space treatment rather than rebuilding polygons every pinch frame.

## 9. Representation consistency may lag camera consistency

During a gesture it is acceptable for a Composite to temporarily remain in the representation selected for a nearby scale bucket.

For example, a Hull does not need to become a point on the exact frame that a threshold is crossed.

Reuse existing hysteresis concepts and consider explicit scale buckets/epochs so continuous pinch does not create a new expensive geometry identity for every tiny scale delta.

A representation update should transition cleanly when the reconciled scene arrives.

At gesture end, reconcile to the exact intended representation.

## 10. Early culling before expensive preparation

Do not perform expensive contour/label/representation work merely to discover later that an object is outside the useful support area.

Prefer:

```text
cheap World-space bounds
        ↓
visible / overscan / required support?
   no ──┴──> stop
   yes
        ↓
expensive contour / representation / label work
```

Cull against the **prepared support/overscan bounds plus explicitly required semantic support**, not merely the visible viewport. Otherwise early culling would defeat the overscan strategy. Use conservative bounds so culling does not introduce visual holes.

LOD remains an information-design mechanism. Do not hide objects earlier solely to make an inefficient pipeline pass.

## 11. GPU Gaussian edge treatment: adopt the technique, not Three.js

The Three prototype produced a visually preferable soft edge without a meaningful enough renderer advantage to retain Three itself.

Its useful technique is renderer-independent:

1. accumulate Hull pigment/density into a bounded half-float target;
2. horizontal optimized Gaussian pass;
3. vertical Gaussian sampling combined with pigment resolve;
4. composite to the main surface.

The prototype uses a five-fetch separable Gaussian approximation with linear sampling and caps the working target around 300k pixels.

Evaluate porting this approach to the custom WebGL2 backend and replacing the current CPU `clipper2-ts` inset/coat feather path if visual parity/quality is retained.

This should remove:

- CPU inset generation;
- feather path serialization;
- feather triangulation;
- feather GPU buffers;
- extra per-coat pigment draws.

Do not import Three.js to obtain the effect. Port only the rendering technique.

Keep pigment mixing and edge treatment independent. The current six-band spectral pigment remains a valid baseline unless evidence shows another approach is materially better.

## 12. Worker/off-main-thread reconciliation

After removing unnecessary gesture-frequency work, consider moving genuinely CPU-intensive reconciliation/preparation off the main thread.

Strong worker candidates may include:

- expensive contour/spline preparation;
- polygon clipping/offset/boolean work that remains necessary;
- path flattening;
- triangulation when it cannot be made infrequent;
- large visibility/spatial calculations;
- other deterministic geometry preparation identified by profiling.

Worker use is **not** a substitute for eliminating unnecessary work. Do not move a calculation to a worker if it should not run during the gesture at all.

Keep latency and transfer cost in the design:

```text
benefit ≈ main-thread work removed
          - serialization/copy/transfer cost
          - coordination latency
          - duplicated memory
```

Prefer transferable `ArrayBuffer`/typed-array payloads or compact immutable inputs over large object graphs. Avoid repeatedly serializing SVG path strings and React-shaped structures when a compact geometry representation can cross the boundary.

Where practical, keep worker-owned caches/state so each job does not resend/reconstruct the entire World working set.

Use generation tokens:

```text
camera generation 41 → worker job
camera generation 42 → worker job
camera generation 43 → worker job

result 41 arrives → discard
result 42 arrives → discard
result 43 arrives → publish if still relevant
```

Do not let stale worker results overwrite a newer camera/Collection/revision state.

Do not build an elaborate worker pool before evidence justifies it. One dedicated geometry/reconciliation worker may be sufficient.

OffscreenCanvas is a separate decision. Since raw WebGL rendering itself is currently the fastest tested path and the suspected bottleneck is upstream scene preparation, do not move the renderer off-main-thread merely because workers are being introduced.

## 13. Keep the useful IP-014 architecture, remove experiment baggage

From #338:

Keep, if still clean and cheap:

- the narrow Moirai-specific render-scene contract;
- the renderer host/lifecycle boundary;
- separation of GraphShell/domain semantics from GPU implementation;
- truthful lightweight diagnostics that remain useful for the custom renderer;
- ability to add another backend later without rewriting GraphShell.

Remove:

- PixiJS backend implementation;
- Three.js backend implementation;
- Pixi/Three dependencies and type packages no longer needed;
- renderer choices/settings entries for removed engines;
- candidate-specific tests;
- candidate-specific resources and dead abstractions that exist only because those engines were present.

Simplify any generic abstraction that adds measurable hot-path overhead without serving the retained boundary.

The end state may expose only the production custom WebGL2 renderer while still retaining an internal backend interface/factory seam.

Do not keep a user-facing renderer selector with one meaningless choice.

## 14. SVG live-transform constraint

Native SVG text, relations and interaction targets remain valuable and should not be discarded casually. During direct manipulation, a committed SVG overlay may follow the same live relative camera transform while expensive membership/label/path reconciliation is throttled.

However, apply the live transform to geometry/position without accidentally scaling visual properties intentionally defined in CSS pixels. Font size, stroke width, label halo and similar screen-space styling must preserve the existing Atropos convention unless a deliberate visual change is separately approved.

If stale hit targets are unsafe during an active gesture, temporarily suppressing hit activation while the gesture is moving is preferable to forcing a full semantic reconcile every frame, provided normal interaction returns immediately when the gesture settles.

## 15. Profiling strategy

This step needs targeted instrumentation, not another large benchmark campaign.

Profile the actual symptom sequence:

1. initial pan;
2. zoom in continuously;
3. pan while zoomed in;
4. zoom out continuously;
5. pan after zoom-out.

Measure stage counts/timings and working-set sizes sufficiently to explain the qualitative device behavior.

Do not use Cloud llvmpipe timings as evidence of physical iPhone GPU throughput.

Useful distinctions:

```text
input handling
live camera update
React/GraphShell reconciliation
visibility/support selection
geometry preparation
SVG/label commit
renderer scene preparation
GPU submission
browser composition
```

Existing diagnostics should be reused where possible. Add counters around suspected GraphShell phases rather than a large new telemetry framework.

## 16. Success criteria for this slice

The main success condition is architectural and user-observable:

- pan/pinch visually follows touch without waiting for full scene reconciliation;
- zoom does not require full expensive scene correctness every frame;
- scene catches up during a long gesture when practical;
- exact scene reconciliation occurs promptly after gesture/inertia end;
- zoom-out does not permanently poison subsequent pan performance;
- offscreen/obsolete objects do not remain in hot per-pan work without a justified support role;
- custom WebGL2 remains the production renderer;
- Pixi/Three experiment code is removed while the useful renderer seam remains;
- GPU-native soft edge is adopted or left as a narrowly justified next step if implementation risk blocks the same slice;
- no canonical data, Publication identity, authored layout or semantic hierarchy is changed.

Do not claim success from synthetic FPS alone. The user's iPhone Safari/PWA interaction is the qualitative acceptance surface.

## 17. Execution order

Recommended order:

1. reconcile latest main/deployment and preserve #338 evidence;
2. instrument the five-step interaction sequence and working-set counts;
3. identify why zoom-out changes later pan cost;
4. decouple live camera from expensive reconciliation;
5. add throttle/overscan/latest-wins/final-reconcile behavior;
6. establish culling/eviction so retained work shrinks again;
7. profile remaining main-thread CPU-heavy reconciliation; move only the stages whose measured cost justifies worker transfer/coordination overhead;
8. opportunistically port the Three prototype's bounded separable Gaussian technique into raw WebGL only if it does not delay the camera/working-set work; otherwise leave it as the next isolated visual/performance change;
9. remove Pixi/Three implementations/dependencies/UI while retaining the useful backend boundary;
10. run focused functional/mobile regressions, deploy a checkpoint and let the user assess the real device.

Steps may be reordered when measurements show a clearer dependency, but do not spend the slice micro-optimizing the abandoned candidate engines.

## 18. Stop/report

At the next meaningful checkpoint report:

- root cause(s) found for zoom-time cost;
- root cause found or ruled out for post-zoom-out slow pan;
- what work was removed from gesture-frequency reconciliation;
- reconciliation cadence/overscan behavior;
- whether a worker was used, for which exact stages, and transfer/stale-result policy;
- whether Gaussian edge treatment replaced geometry feather;
- retained renderer abstraction and removed IP-014 experiment code;
- public mobile URL;
- commit/deployed SHA;
- focused verification results;
- known remaining bottleneck.

Then use the user's real-device observation to choose the next optimization.
