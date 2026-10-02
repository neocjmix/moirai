# Mobile continuity investigation — 2026-10-02

Active authority: [mobile continuity plan](../../implementation/IP-012-mobile-continuity-plan.md). This is ongoing investigation, not acceptance.

## Before

Production `91cffca`, World Revision 62, 30 Collections, compiler/4. iPhone 14 WebKit emulation in Codex Cloud, default GraphShell, broad viewport `(0,209900,1600,36000)`. Script: `scripts/ip012-mobile-continuity-profile.ts`. Thirty history-based visits/returns, each of start/middle/return includes 602 continuous RAF moves on a native captured pointer. This hybrid input is not physical iPhone evidence. Another local build/test used the host during this initial run, so these frame values are diagnostic and require an isolated comparison.

Initial scene ready: 2546ms; three Render calls including geometry work. Full scenario: 85 Render calls. Frame p95 start/middle/return: 149/82/121ms; max289/133/205ms. 113 point candidates,15 regions,1521 displayed vertices at initial state;584 DOM nodes at first checkpoint. No browser errors.

First602-frame work delta: point transforms67155, region transforms126666, label queries300211, world geometry batches3. This identifies repeated local label/geometry work alongside request reuse. It does not establish network bandwidth as the bottleneck.

## First checkpoint

[PR #304](https://github.com/neocjmix/moirai/pull/304): bounded6-snapshot metadata cache, spatial margin reuse, adjacent level preparation and promotion of useful geometry reads. A complete compiler/4 local snapshot can calculate finer visibility without a new metadata fetch; omitted candidates require bounded refinement. Revision/generation and30-second non-sliding expiry remain enforced.

Unit camera scenario:24 small pans previously required24 metadata calls; now1. Related client/loader/adapter35 tests pass. Composite label work preserves the original full placement output over1008 generated pan/XY-zoom/obstacle fixtures, including clipped geometry and previous-placement hysteresis; repeated polygon normalization and guaranteed-useless density queries are removed. Nine focused label tests pass and strict root typecheck passes. Synthetic parity runtime improvement is not a browser frame gate.

Main `8f9e31a` deployed successfully and exact-SHA public smoke passed. [Raw initial diagnostic](mobile-continuity-baseline-91cffca.json) and [isolated first-checkpoint observation](mobile-continuity-checkpoint-8f9e31a.json) are retained. The isolated run had no concurrent build/browser workload: cold scene ready1600ms,4 Render calls including background geometry/level work;602-frame start/return p95 both49ms, max60/96ms, DOM584/587. This **fails** the33.4ms frame gate. A preceding run timed out awaiting settled viewport state after4 successful HTTP responses; retry success does not erase that lifecycle observation. The original contended run is not a valid numerical speedup denominator.

## Second checkpoint — deployed, sustained regression reproduced

[PR #305](https://github.com/neocjmix/moirai/pull/305), main `3ec0e1c`, deployed successfully for Atropos/API/worker. Exact-SHA public smoke and4 live mobile tests passed.567 unit tests passed/2 skipped; strict root/web typechecks, ESLint, formatting and production build passed. The actual compiler/4 browser fixture passed. Local affected browser batch5/8 passed: the transition-window failure was a hull-reversal observation race (not yet the child-fade assertion), alongside legacy navigation cancellation diagnostics and a broad-viewport restoration failure. These remained open during this authorized checkpoint.

[Sustained production measurement](mobile-continuity-checkpoint-3ec0e1c.json) **failed**:30 visits with602-frame start/middle/return p95 **84/95/121ms**, max144/158/241ms,382 Render requests. No browser page errors. The scheduler exposed a speculative-level refill defect: completed two-screen buffers were required to cover the next camera's entire same-sized two-screen buffer, so subpixel pan triggered another roughly515KB read. A short actual request trace confirmed22 finer-level requests during100 moving frames. Repeated decoded snapshots also rebuilt world geometry216 times in the first602 frames. DOM642/637/643 was bounded; bounded DOM alone does not establish memory or frame success. This regression is preserved as evidence and is being fixed forward.

The following causes were reproduced and corrected in the implementation:

- Composite hull↔point swapped React element types. One authored paint owner now retains both shapes, uses actual opacity crossfades and follows the current camera during exits. Identity is the authored Event ID across different transport variants.
- Gesture debounce reset on every camera frame. A single-flight scheduler finishes the current read and services the latest camera throughout sustained motion. Context disposal prevents stale results replacing a new selection.
- Exact-zero semantic child opacity immediately unmounted its node. Bounded220ms paint retention now permits180ms CSS fade and quick reversal; hidden paint immediately loses interaction/accessibility ownership. Outgoing client candidates use the same time window.
- Long offscreen label paths were scanned every6px. Segment clipping preserves the exact old sample-lattice output on1008 original and126 additional fixtures. Settled fade advancement preserves state identity instead of triggering another SVG render.
- Collection drawer external/local selection feedback repeatedly fetched the same detail (more than1000 requests observed). Local gestures notify the owner; incoming focus is not passively echoed. The delayed-detail browser regression expects exactly1 request. History restores the destination drawer stage.
- Disposed graph loaders could launch fresh reads during page navigation. Loader lifetimes reject new reads, abort pending detail and reject stale success; StrictMode deferred disposal and persisted back/forward-cache pages remain supported.
- Oversized geometry was admitted before rejecting the working-set budget. Admission now precedes writes, metadata is trimmed immediately, and250/750ms late-response tests check revision/generation isolation and post-disposal empty caches.

Full compiler scale evidence retains identical local tile payload across1k/10k/100k Events,128 primitive/<100,000byte tile bounds and bounded128 child hints for a100k-child authored Composite. These are synthetic CPU/working-set results, not physical-device frame acceptance. Existing GraphShell UI grammar, authored hierarchy and canonical data are unchanged.

The dedicated `playwright.ip012-continuity.config.ts` fixture publishes an actual render generation through the worker. It verifies the default compiler/4 path, same DOM identity on warm pan and no metadata requests for cached Collection reversal; semantic-route mocks remain separate transition tests. Post-deploy CI now retains public mobile failure screenshots/traces and structured GitHub annotations for future sessions.

## Third checkpoint — deployed, production loading failure retained

- A separate inner readiness margin for finer-level prefetch prevents subpixel refill churn. A60-camera regression reproduced60 speculative requests before the fix and1 after it.
- Bounded per-loader pan geometry retains the padded hull and SVG spline `d` while applying translation. Exact raw support still drives LOD, and labels/coverage use current screen coordinates.600 pan frames require1 build/600 hits. Measured approximation against repeated Clipper evaluation is<0.003px for padded vertices and<0.01px for label anchors; entries, total vertices and path characters have explicit caps.
- Bounded response-time structural sharing preserves World geometry when only density or transport order changed; actual coordinates, authored hierarchy/support and labels invalidate it. Live density remains independent.
- Broad temporal World camera restoration no longer rejects valid scaleY<0.01 returned by world-aware navigation. Positive/finite scale and existing upper/translation bounds remain validated. The old rejection reset a saved wide viewport to the origin.
- Production inspector exposes both adapter and Render metadata/geometry cache bounds. Profiling records request phase/level/bounds and confirms exit paint has settled before return-state observations.
- CI runs the dedicated compiler/4 browser suite after the existing semantic suite, reusing its build and retaining separate failure artifacts even if the earlier suite fails.

Production-body replay for21 camera positions changed21 requests (20 speculative) into2 (1 speculative), with metadata cache2.89MiB→830,076bytes.58 focused tests, root strict typecheck, lint and formatting passed; production build passed. The mobile batch passed21/26, including actual point/hull fades and the corrected broad camera. The delayed Collection-close race recurred with1,545 requests in5 seconds, so the selection-lifetime fix is **not complete**; hydration/owner reentry is being investigated. Other remaining navigation/fixture failures remain visible. Another confirmed next task is paint-only semantic label retention: admission changes still unmount text before its CSS fade.

Implementation `c4c2d61` merged through [PR #306](https://github.com/neocjmix/moirai/pull/306) as main `de8d60811fba7866bc69801c97457f7f957a6261`. Railway deployment succeeded. This establishes deployment, not a new performance pass.

Two isolated production profile attempts both failed with `viewport_settle_timeout` before the sustained-frame checkpoints. Both public health responses confirmed the deployed `de8d608…` SHA. Each recorded one successful cold viewport metadata response of 314,500 bytes, taking **9065ms** and **9737ms** respectively; the last inspection still showed `loadState: loading`, no active points/regions, one pending loader read, one cached Render snapshot and no cached geometry. Initial scene readiness and frame percentiles were therefore **not obtained**. The declared `30 visits`/`602 frames` in the profile header are requested scenario parameters, not completed samples.

The failed observations are retained as [first cold attempt](mobile-continuity-checkpoint-de8d608-cold-failure.json) and [cold retry](mobile-continuity-checkpoint-de8d608-cold-retry-failure.json). Earlier baseline/checkpoint JSON files remain unchanged.

The same investigation's Railway response observations were **3.4–11.9s for Render reads**, versus **8–120ms for canonical reads**. Observed CPU max was **0.361 cores of 8** and memory **0.357GiB of 8GiB**. These observations motivate separating publication object I/O/cache misses from app/browser work; they do not prove that server capacity is exhausted or that storage alone explains the pending scene. Correlated request timing and the browser's pending lifecycle remain to verify.

## Fourth checkpoint — implementation in progress, not deployed

The shared immutable-object cache recognized `worlds/{World}/revisions/{Revision}/…` but excluded independent `render-generations/{64-character hash}/…` assets. This meant immutable generation roots/index pages/tiles/geometry repeatedly reached the object store even when canonical assets could be reused.

The pending change admits valid World/hash generation paths to the existing bounded cache and coalesces concurrent reads of the same immutable object. Mutable World/Render-current pointers still bypass retention, generation namespaces remain separate, and missing/failed reads are retryable rather than negatively cached. Focused publication/cache/Render route verification reports **23 tests passing**. This is local correctness evidence, not measured deployed latency improvement.

The Render route now uses the existing publication profiler to emit allowlisted `Server-Timing` app wall time, summed object I/O time, object count and byte count. Object I/O durations overlap for parallel reads and must not be subtracted from app wall time as though they were a serial phase. No credentials, object names, Event text or private topology are added to this timing surface. Before/after production cold/warm measurements remain pending deployment.

The affected **27-test browser batch is still under investigation**. It exposed a WebKit `history.replaceState` rate-limit regression exceeding 100 calls within 10 seconds. A fix and rerun are required before claiming browser success. Delayed Collection-close/detail feedback, navigation cancellation, paint-only semantic-label continuity and actual compiler/4 behavior remain part of the same follow-up; earlier narrow successes do not close those reproduced failures.

Next evidence must tie a deployed SHA to scene readiness, cold/warm server timing and object counts, and then complete the isolated 30-visit frame/request run. Checkpoint deployment continues under the user's development observation policy while all unmet gates remain explicit.
