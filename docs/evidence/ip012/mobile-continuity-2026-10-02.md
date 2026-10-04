# Mobile continuity investigation — 2026-10-02

Active authority: [mobile continuity plan](../../implementation/IP-012-mobile-continuity-plan.md). This is ongoing investigation, not acceptance.

Actual user environment confirmed on 2026-10-02: **iPhone 17, Safari and installed PWA**. The automated observations below use iPhone 14 WebKit emulation unless explicitly stated otherwise. They are not physical iPhone 17 or installed-PWA measurements.

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

## Fourth checkpoint — server cache deployed, sustained frame still fails

The shared immutable-object cache recognized `worlds/{World}/revisions/{Revision}/…` but excluded independent `render-generations/{64-character hash}/…` assets. This meant immutable generation roots/index pages/tiles/geometry repeatedly reached the object store even when canonical assets could be reused.

The change admits valid World/hash generation paths to the existing bounded cache and coalesces concurrent reads of the same immutable object. Mutable World/Render-current pointers still bypass retention, generation namespaces remain separate, and missing/failed reads are retryable rather than negatively cached. The earlier focused publication/cache/Render route verification passed **23 tests**. The later focused root cache/paint batch passed **30 tests**, along with strict root typecheck, lint and formatting; that mixed local batch also covers pending UI work and does not imply that the UI changes shipped with this server commit.

The Render route uses the existing publication profiler to emit allowlisted `Server-Timing` app wall time, summed object I/O time, object count and byte count. Object I/O durations overlap for parallel reads and must not be subtracted from app wall time as though they were a serial phase. No credentials, object names, Event text or private topology are added to this timing surface.

Server-only implementation `7c10614` merged through [PR #307](https://github.com/neocjmix/moirai/pull/307) as main `eaa9002769fa1a4a9f9499ae05761006413c9a00`. Atropos Railway deployment `2393bf27-f747-477a-8db3-3ae4c51b81f6` reached **SUCCESS**. UI source changes were kept out of this server deployment and subsequently shipped in the separate fifth checkpoint below.

The [isolated 30-visit profile](mobile-continuity-checkpoint-eaa9002.json) completed without page errors: initial ready **2099.7ms**, **4 Render calls**; total **68 requests/16,227,968 decoded bytes**, versus the failed second checkpoint's382/183,276,719. Start/middle/return602-frame p95 **68/76/96ms**, max **119/148/192ms** still fail. This single ready sample is not a latency-p95 acceptance result.

Cold metadata reported app475.43ms, summed I/O660.90ms/10objects; first14-geometry response app255.61ms, I/O245.76ms/20objects. Later cached metadata reported app33.28/44.95ms with only2 mutable pointer reads. Browser headers/body-complete times and transferred/decoded bytes are separately retained. The server cache reduces repeated reads; client work remains material.

First602 moving frames still rebuilt World geometry116 times (3→119), despite only7 additional HTTP calls. Pan hull paths were largely reused (12 additional builds versus19,077 hits), and returned cache/DOM counts were bounded, but frame time degraded. This identifies remaining adapter identity/reconciliation and duplicate Composite frame work for the next slice. A single sampled WebKit process RSS during the last interaction was about2.15GiB; this is process memory, not a JS heap measurement or a proven leak.

## Fifth checkpoint — UI deployed, functional CI and smoke pass

The corrected affected browser batch passed **24 of 27 tests**. It had previously exposed a WebKit `history.replaceState` rate-limit regression exceeding 100 calls within 10 seconds. A fresh follow-up observed **2 history writes with stable idle work**, without that runaway loop. Later focused label/point/history browser tests passed. These are local, specific results, not full browser acceptance or deployed behavior.

The final three focused mobile tests now pass: V5 initial Event1/Collection1 reads, canonical Back/Forward with full/peek restoration, and legacy failed detail1 plus explicit Retry1. Network detail identity is Event+loader+locale+Retry version; drawer presentation actions retain their independent history key. Pure action allocation also prevents React updater replay from multiplying reads. No request-count assertions were relaxed.

Labels retain bounded noninteractive outgoing paint for260ms, covering their220ms CSS fade. Newly admitted text enters through a dedicated RAF; pruning does not advance an unpainted entry. Actual boundary pan, intermediate-opacity exit/reversal, same text/Event DOM, prune and re-entry tests pass. New point groups also animate their entrance after prior paint has been pruned. StrictMode RAF cleanup clears cancelled handles. Semantic admission, UI roles and target ownership remain unchanged.

Implementation `559c11e` merged through [PR #308](https://github.com/neocjmix/moirai/pull/308) as main `a8e5f5abba4429015e07026ea10f6e009e33c4ff`. Atropos Railway deployment `1372943e-0e23-4619-b274-31e5fcb9821b` reached **SUCCESS**, and exact-SHA public smoke passed. GitHub [main CI 36979941038](https://github.com/neocjmix/moirai/actions/runs/36979941038), [A5 public mobile 36979941085](https://github.com/neocjmix/moirai/actions/runs/36979941085) and [post-deploy 36980410885](https://github.com/neocjmix/moirai/actions/runs/36980410885) all completed **SUCCESS**. The existing actual compiler/4 browser fixture passed in **4.1s**. Functional CI/smoke success does not close sustained performance gates.

### Isolated same-SHA short controls

Three separate short diagnostics used the same deployed `a8e5f5…` SHA, World and iPhone 14 WebKit emulation without a concurrent local build/browser workload. Each has **0 visits** and two **602-frame** checkpoints named start/return; this is not the 30-visit acceptance run. All reported zero page errors and no JS heap measurement. The controls modify the observed runtime only and are not deployed visual changes.

| Mode and raw evidence | Start/return p95 (ms) | Start/return max (ms) | Interpretation |
| --- | --- | --- | --- |
| [Normal production blend](mobile-continuity-diagnostic-a8e5f5-baseline.json) | 57 / 53 | 89 / 148 | Both p95 checkpoints fail; return max also fails |
| [Blend disabled for diagnosis](mobile-continuity-diagnostic-a8e5f5-no-blend.json) | 49 / 45 | 64 / 72 | Cheaper in this short observation, but still fails p95 ≤33.4ms |
| [Unchanged scene RAF control](mobile-continuity-diagnostic-a8e5f5-static.json) | 17 / 17 | 17 / 18 | Host/browser can schedule near 60Hz when scene does not change; this is not active-gesture acceptance |

The visual blend remains enabled. Its removal would not meet the frame gate in this comparison, and the unchanged-scene control cannot establish normal navigation performance or Google Maps parity. These controls support investigating changing-scene computation/reconciliation and paint together; they do not uniquely attribute the remaining cost to one subsystem.

## Sixth checkpoint — deployed, default-DPR frame remains above budget

Current-coordinate Composite paint now derives in the same render as point geometry. Committed refs retain fade history; only new enters, exits and deadline pruning schedule lifecycle state. The HUD memoizes unchanged topic/locale while keeping context and local controls live. Optional `gsProfile=1` records bounded aggregate CPU phase times; it is disabled for acceptance profiles.

New browser instrumentation uncovered a real idle feedback path:452 commits in one idle second and1053 commits during50 tiny pans, despite unchanged camera numbers and no network. Restored camera objects were repeatedly cloned during state rebasing. Camera identity now follows its complete numeric value; idle same-view reset returns the existing state, while active resets still rebase the gesture baseline. Scheduling uses pointer count rather than equivalent pointer-object identity. The original browser regression now passes **zero idle commits over15 RAFs**, **≤78 commits for50 pan batches**, **zero stale semantic region passes** and **zero extra Composite lifecycle ticks**. Unit coverage preserves the next pan delta after an active same-camera reset.

Assets read in waves of at most8, preserving ordered results/first error, digest checks,4MiB response budget and total256 object reads.27 focused tests pass, including duplicate read coalescing and no next batch after an error or oversized result. No geometry membership is artificially retained to improve counters.

The shared production build and root strict typecheck passed. The latest expanded functional batch passed27/28: a legacy initial-detail test intermittently observes3 reads instead of1 and remains open. The new frame regression passes. Actual compiler/4 fixture coverage with real metadata/geometry responses at **0/250/750ms artificial delay**, fresh XY/scale coverage and reversal, plus the touch scenario, passed **4 tests in 13.3s**. Persisted camera/selection restoration proof is still pending its next run; these four cases do not imply that separate proof passed.

Implementation `1d768af` is deployed as main `0069c094308acdf0636f593dd0d56570d0c91bc9`. The following short production diagnostics both confirm that SHA in public health. They use **0 visits**, two **602-frame** start/return checkpoints and opt-in `gsProfile=1` CPU instrumentation. These are diagnostic profiles, not the uninstrumented 30-visit acceptance run.

| Profile and raw evidence | Start/return p95 (ms) | Start/return max (ms) | Interpretation |
| --- | --- | --- | --- |
| [Default iPhone emulation DPR 3](mobile-continuity-phase-0069c09-dpr3.json) | 55 / 54 | 71 / 88 | Both p95 checkpoints remain above 33.4ms |
| [DPR 1 control](mobile-continuity-phase-0069c09-dpr1.json) | 34 / 32 | 86 / 47 | Start p95 still exceeds the gate; altered DPR is not the baseline profile |

In the first default-DPR 602-frame checkpoint, measured World preparation increased by only **4ms** (3→7ms total), while region projection/label work increased by **4413ms** (44→4457ms). The count of preparation calls alone therefore overstated this phase's current measured CPU importance. Aggregate JavaScript phase timers do not account for all browser layout/paint/compositing or instrumentation cost. The DPR control supports further investigation of changing geometry and raster/compositing work; it does not establish a real-device bottleneck or justify a quality change by itself. Existing blend and UI grammar remain in place. The follow-up SVG controls below narrow the investigation further; there is no new performance-pass claim.

### Same-DPR SVG visibility controls

The follow-up controls use the same deployed SHA, DPR 3 and two 602-frame checkpoints. The normal visible SVG remains the real product condition; hiding/removing it is diagnostic only.

| SVG control and raw evidence | Start/return p95 (ms) | Start/return max (ms) |
| --- | --- | --- |
| [Visible](mobile-continuity-svg-control-0069c09-visible.json) | 56 / 54 | 77 / 71 |
| [Hidden](mobile-continuity-svg-control-0069c09-hidden.json) | 25 / 24 | 35 / 37 |
| [Display none](mobile-continuity-svg-control-0069c09-none.json) | 25 / 23 | 52 / 40 |

Keeping the same camera-update workload while suppressing SVG display removed much of the measured frame cost. This identifies the displayed SVG/paint path as a dominant component in this emulated environment, while the remaining hidden-scene work still deserves optimization. Neither hidden nor display-none is a product or acceptance pass. Separately, 604 bounds reads totaled **380/362ms** across the two samples (roughly 0.6ms/frame), so those reads do not explain the observed frame cost on their own.

The Cloud host has no `/dev/dri`; the active WPE process loaded Mesa EGL and `libLLVM19.1`. This is environment evidence, not proof of a particular active graphics driver or parity with iPhone 17 hardware. Preserve the original failed gate and investigate drawing/React cost without claiming an environment exemption. Existing hull/point/label/relations, blend, hit targets and mobile interaction remain required.

### Dense 10k semantic continuation — built-app mobile proof passed, deployment pending

A separate A4 harness investigation found obsolete locale/UI assumptions and a real dense10k continuation failure: the reader issued a valid **20,821-byte cursor with 78 references**, while the shell rejected its **21,463-byte continuation request** against the old generic 16KiB body cap. The first response was valid; the rejected second request produced the blank graph. Changing a selector alone cannot fix this API contract mismatch.

The pending correction keeps the cursor-stripped query within **16KiB**, and admits at most the existing **1MiB response budget** as extra cursor data only for a schema-valid viewport continuation. Total streamed body remains bounded by **1MiB + 16KiB**. Search, detail, Collection and non-continuation queries retain the 16KiB budget. The 16-page traversal, 64-node page and 1,024-object limits are unchanged.

The actual dense10k canonical/layout selection contains **262 Events**. The local complete Publication→route→client regression now receives two HTTP 200 responses with **160 + 102 Events**, and the second response has no cursor. **16 focused tests**, ESLint and app/root typechecks passed, including exact identity parity, the object-read limit and cache reuse. This correction remains separate from the deployed sixth checkpoint; its new built-app proof is recorded below and deployment evidence is still pending. The old [A3 16KiB observation](../ip011/a3-ui-restoration.md) remains a dated record, not the current continuation policy.

The shared built app was then exercised with fresh mobile WebKit: scene readiness **786ms cold / 466ms repeat**, the actual Event Narrative drawer opened, and two trusted Collection toggles used the current HUD. Closing the drawer returned to `ready` with **262 source Events, 28 painted points and 2 primary targets**. Browser continuation requests of **21,623–21,680 bytes** were accepted; each viewport completed its **160 + 102** pages with no remaining cursor. All recorded responses were HTTP 200, with zero page errors or failed requests. [Retained raw mobile proof](mobile-continuity-dense10k-fixed-mobile.json) contains the repeat run (466.4ms), response sizes/counts, trusted-input count and final inspection; the cold value is the preceding fresh-run observation. This is a targeted functional proof, not the 20-navigation/600-frame A4 acceptance matrix or real iPhone 17 evidence. Partial relation completeness in the inspection remains explicit.

### Next slice — shared build and 28-test functional batch passed, not deployed

The shared build and the complete affected **28-test batch passed**. The formerly intermittent legacy detail fixture now deterministically covers the RSC initial state with **one failed detail request and one explicit Retry request**; those count assertions remain intact. A no-op color setter skips unchanged state dispatch. Commit/deployment and new performance measurements remain pending for this slice.

### 2026-10-04 resumed verification

The actual compiler/4 suite passed **all five cases in 16.1s** using the shared production build. It includes 0/250/750ms monotonic-delay reads, XY/scale reversal, real glyph-hit touchscreen activation, warm Collection reversal and synthetic persisted pagehide/pageshow. The lifecycle case verifies application disposal ownership and subsequent successful coverage reads; it does not establish actual iOS suspension, process eviction or bfcache eligibility. The three delayed-read per-frame records are retained as [0ms](compiler4-continuity-2026-10-04-0ms.json), [250ms](compiler4-continuity-2026-10-04-250ms.json) and [750ms](compiler4-continuity-2026-10-04-750ms.json).

The resumed focused route/cursor/harness batch passed 7 tests, including the complete dense10k route/client test. Root and Atropos strict typechecks, repository ESLint, full formatting and service boundary checks passed after correcting explicit types in the measurement script. No product assertion or performance threshold was weakened. General CI and the full scale matrix must be rerun against the forthcoming commit; the previous deployed SHA's failures remain historical failures.

### Seventh checkpoint — deployed and all CI families recovered

Implementation `8e7e659` merged through [PR #310](https://github.com/neocjmix/moirai/pull/310) as main `f8143aea339410e7d8d477e180667583bdee93e2`. Railway deployment `055e8174-2cb5-4927-b1a1-44151d774cfd` reached SUCCESS and exact-SHA smoke passed. Main CI `37198660922`, public A5 `37198660937`, post-deploy `37198956945`, branch actual worker/mobile scale matrix `37198651207`, IP-004 scale `37198651208` and live mobile profile `37198651221` completed SUCCESS. Local unit verification passed 603 tests; the explicit IP-004100 compatibility browser passed paging/search with ready449ms and drawer637ms.

The [isolated, uninstrumented 30-visit production profile](mobile-continuity-normal-f8143ae.json) still fails the frame gate: start/middle/return p95 **53/57/60ms**, max **63/94/90ms**, each602 frames. Initial readiness1729.7ms, cold3 requests, total64 requests and14,735,587 decoded bytes; zero page errors. Returned scene113 Events/15 Composites, DOM579/579/580, bounded caches and no pending geometry or level reads. The browser-reported WebGL vendor/renderer strings in that emulated profile are not physical graphics-driver evidence.

Short same-SHA controls hide [hulls](mobile-continuity-hull-hidden-f8143ae.json) or [text](mobile-continuity-text-hidden-f8143ae.json): hull-hidden p95 **42/41ms**, text-hidden **53/53ms**. These are diagnostics, not acceptance. Together with the earlier all-SVG-hidden control, they support reducing background geometry painting rather than suppressing labels or adding more World preparation caches.

### Geographic painter checkpoint — local functional/visual verification

Background hulls and point ink now have a bounded Canvas painter. Full-resolution SVG continues to own labels, authored groups, semantic targets, keyboard behavior and drawer gestures. The same semantic paint inputs drive Canvas; per-ID opacity/radius/stroke tweens preserve reversal and 180/220ms transitions. Canvas uses at most1.5 raster pixels per CSS pixel for background geometry, while SVG text retains device density. This is a deliberate small geometry anti-aliasing approximation, not a reduced-device-DPR acceptance profile. Path caching is bounded to128 entries/1,000,000 source characters; transient IDs are pruned with the live scene. Canvas failure falls back to SVG and `?gsGraphics=svg` provides an explicit diagnostic rollback.

Local production build, strict typechecks, lint, formatting and boundary checks pass. Full mobile suite passed37/38 with the explicit-scale-only case skipped. Actual compiler/4 suite passed6/6 in17.7s, including pixel ink, stable Canvas owner and SVG rollback alongside delayed reads, real touchscreen glyph activation and persisted lifecycle. Same-camera synthetic Canvas/SVG screenshots were visually reviewed: hull/dot layout, text, HUD and navigation remain consistent, with slightly softer background edges. Operating performance evidence for this painter is still pending; the seventh checkpoint's frame failure remains open.

### Eighth checkpoint — functional deployment, sustained frame regression

PR #311 merged as `58a670ecc75697b6bdc1d7918a049fc2fc8986dc`. Railway deployment `a88bbe97-788d-4d63-b44b-a6668c5beeb4` reached SUCCESS; exact-SHA smoke, main CI `37199995745`, public A5 `37199995743` and post-deploy `37200260134` passed. Branch CI `37199982236` failed the steady-pan commit-count assertion (93/86 versus78), and A4 matrix `37199982224` failed its sustained1000 job. These branch failures require diagnosis and are not replaced by main CI success.

The [normal, uninstrumented30-visit profile](mobile-continuity-normal-58a670e.json) returned p95 **62/59/60ms**, max **122/125/75ms**, with602 frames per checkpoint. Initial readiness1570.4ms, cold4 requests, total66 requests, zero page errors. This regresses the previous checkpoint and fails the unchanged frame gates. The [short CPU-phase diagnostic](mobile-continuity-phase-58a670e.json) measured1128 Canvas draws totaling653ms during the first602-frame checkpoint (about0.58ms per draw), while region projection/labels added4983ms. Native draw-call time does not account for subsequent browser raster/compositing work. Moving only that small JavaScript duration to a worker is not established as the solution.

The next slice reuses a buffered background raster during camera-only pans. Authored World coordinates, material and screen-sized point density determine reuse; scale, membership, meaningful alpha/material changes or exhausted buffer trigger a redraw. The bitmap has96 CSS pixels of overscan and a4,000,000-pixel bound. SVG labels and live interaction geometry continue following every camera commit. The compiler/4 suite passed6/6 locally in17.2s; operating performance remains to be measured.

### Ninth checkpoint — background reuse verified, surface frame cost remains

PR #312 merged as `dfd754eb4c4bd6067e403c6891b40929a3b14477`. Railway `649e8b72-cd64-4198-ad69-5fc141d9d18c` reached SUCCESS and exact-SHA smoke passed. Main CI `37201527429`, branch CI `37201506592`, public A5 `37201527437` and post-deploy `37201750599` succeeded. A4 matrix `37201506566` still failed sustained1000; the eighth checkpoint's downloaded artifact confirms its failure was start/middle/return frame p95 **55/53/52ms** (ordinary gesture/read checks passed).

The [short, instrumented profile](mobile-continuity-phase-dfd754e.json) returned p95 **62/62ms**, max78/81ms. Camera reuse occurred214/172 times, but active tweens/material changes still caused934/1037 native draws; the larger backing bitmap used4,483,728 bytes. This does not pass the original30-visit gate. Same-SHA isolated controls [hide Canvas](mobile-continuity-canvas-hidden-dfd754e.json) (58/56ms) or [hide SVG](mobile-continuity-svg-hidden-dfd754e.json) (51/51ms). Other short controls hiding text/grid or removing unpainted-ink effects also remained above58ms. None is an acceptance condition; the displayed surfaces' raster/compositing remains a candidate cost beyond the measured JavaScript calls.

### Gesture-frame experiment — local glyph/input/identity proof

The next renderer slice keeps semantic/layout/Publication state and native SVG input current, but displays two bounded composite raster frames during camera gestures. Current geographic Canvas and SVG paint are captured from the **same committed camera before asynchronous SVG decode**. Frames align by World camera transforms and crossfade with isolated `plus-lighter` alpha composition; two4,000,000-pixel limits,96px overscan,200ms refresh and1.5 raster cap are explicit. Gesture-end, Collection/workspace changes, unsupported decoding or exhausted bitmap coverage immediately restore the current native scene. Idle SVG text retains original device density; movement text is temporarily softer and is an intentional rendering approximation.

Actual compiler/4 mobile verification passed **7/7 in20.4s**, including real dark glyph pixels at their native label bounds while SVG opacity is0, native glyph hit identity, bounded bitmap dimensions, the same DOM label before/after gesture and immediate native restoration. Existing0/250/750ms coverage/reversal, actual touchscreen activation, synthetic lifecycle and warm Collection cases still pass. The final shared build rerun passed7/7 in23.2s after the boundary fix. [Gesture](gesture-cache-appearance.png) and [native](gesture-native-reference.png) screenshots were visually reviewed: the same layout/input grammar with temporarily softer movement text/edges. Production frame results are pending. No threshold or original failure was removed.

Full mobile verification initially exposed a reduced-motion end/persistence race: a URL could briefly record the elastic released camera before its hard-boundary commit (centerY−50,213→30,799). The last release now commits that hard boundary atomically for reduced motion, protects a newer contact from a queued old settle, and explicitly signals releases batched without an intermediate pointer-count commit. The original repeated-drag assertion remains unchanged. Two new same-task burst cases cover reduced and normal motion; the complete suite then passed **39/40 in1.2m**, with only the explicit-scale-only test skipped. Strict root/app types, repository lint/format, service boundaries and production build passed.

### Tenth checkpoint — gesture cache rejected, recovery in progress

PR #313 merged as `6f037032483fbcf78e1a0a1a6aafb0eb75e58c4d`. Railway `020a06f4-4302-4ac5-a311-2a1cc16f39d2` reached SUCCESS and exact-SHA smoke passed. The uninstrumented short DPR3 profile (0 visits, two602-frame checkpoints) returned p95 **90/88ms**, max **123/114ms**, readiness1635.4ms, cold4/total12 requests and zero page errors. This regresses #312 and fails both original frame limits. The user also reported flashes and temporarily incorrect image proportions. The preceding local glyph proof did not establish production visual continuity.

The whole-scene raster strategy is rejected and removed; historical screenshots remain explicitly superseded experiment evidence. Native SVG text stays visible during gestures. The independent batched-release/reduced-motion boundary fix remains. WebGL background vectors are the next candidate; current Cloud has no `/dev/dri`, so context support and emulated vendor strings cannot establish actual GPU acceleration.

### Recovery deployment and local WebGL candidate

PR #314 merged as `105e6530045ba66a8d4c525b223f2d41327f35ce`. Railway `4a620f42-63c7-45d4-9a37-f5c71a8ece02` reached SUCCESS and exact-SHA smoke passed. Recovery verification passed the seven compiler/4 cases, strict root/app types, relevant lint, boundaries, production build and secret scan. The rejected image cache is removed, not merely hidden behind an experiment switch. The [failed short profile](mobile-continuity-normal-short-6f03703.json) is retained.

The separate WebGL2 candidate renders background hull triangles/strokes and instanced screen-sized dots; no whole-scene or glyph snapshots are transformed. Concave/curve/collapsed/unsupported tessellation tests passed4/4. The actual compiler/4 browser suite passed10/10 in22.9s: real WebGL pixel ink and GL error0, unequal XY camera scales, bounded buffers, stable native labels and canvas owner, context-loss recovery with the same semantic path, unsupported fallback, existing delayed reads and touch/lifecycle/Collection flows. WebGL is opt-in pending operating measurements; local success is not original frame acceptance or physical iPhone17 evidence.

The full existing mobile suite passed39/40 in1.1m, with only its explicit-scale condition skipped. A native surfaceless EGL/GLES probe using the installed Mesa/WPE libraries reports `Mesa`, `llvmpipe (LLVM 19.1.7, 256 bits)`, `OpenGL ES 3.2 Mesa 25.0.7-2+deb13u1`. With no `/dev/dri`, the current container's native driver is software; this is separate from the browser's privacy/emulation vendor strings. Cloud is useful for rendering correctness and software comparisons, not proof of hardware iPhone performance.

### Eleventh checkpoint — opt-in WebGL deployed

PR #315 merged as `61671ddf4e4b60301998903ff09b796b8fe0dddf`; Railway `0ae9434d-158a-4e76-8f34-a52e887a8eb9` reached SUCCESS and exact-SHA smoke passed. Public A5 `37207624036` and IP-004 `37207588628` passed. Main/branch CI and A4 matrix were still running at this observation. Full unit verification passed607 tests (two existing conditional skips). The opt-in [WebGL screenshot](webgl-appearance.png) preserves native labels, authored hull/point positions, relation grammar, HUD and navigation at unequal XY camera scales. Default remains the recovered Canvas/native SVG route while same-SHA software comparisons and actual iPhone feedback are gathered; this is not a frame-gate closeout.

Main CI `37207624110` and branch CI `37207588664` subsequently passed. The [uninstrumented DPR3 WebGL30-visit production profile](mobile-continuity-webgl-normal-61671dd.json) returned start/middle/return p95 **55/52/51ms**, max **76/70/70ms**, each602 active frames; readiness1861.4ms, cold4/total62 requests and zero errors. Every checkpoint remained on WebGL, not a silent fallback. Meshes stayed at14/250,680 bytes and backing pixels at2,330,640 RGBA bytes; final113 Events/15 Composites and DOM580/580/581, with the existing bounded publication caches and no pending reads. These explicit buffer bytes exclude driver/MSAA allocations and are not actual heap evidence.

The same-SHA [normal Canvas0-visit comparison](mobile-continuity-canvas-short-61671dd.json) returned p95 **62/60ms**, max82/80ms, readiness1548.3ms, cold4/total10 requests and zero errors. Start/return WebGL p95 is about11/15% lower in this software environment. The different visit counts prevent calling this a complete matched30-visit comparison or hardware gain; both remain above33.4ms. Promote the functionally verified WebGL candidate through a separate default-path regression/deployment slice while retaining `?gsGraphics=canvas` and `?gsGraphics=svg` diagnostic rollback. Physical iPhone17 frame/heap and visual feedback remain unverified.

### WebGL default-path verification

Selecting WebGL as the default passed the complete mobile suite **40/41 in1.2m** (the existing explicit-scale case skipped) and actual compiler/4 suite **10/10 in23.0s**, now exercising WebGL by default for delayed coverage, glyph touch, lifecycle and Collection reversal. Both Canvas and WebGL steady-pan cases retain the original commit/batch/identity assertions; the WebGL case additionally proves no new mesh builds during50 camera batches and actual native-buffer reuse. Root/app strict types, repository lint, service boundaries and production build passed. Default-path deployment is the next checkpoint; original performance and actual-device gates remain open.

### Twelfth checkpoint — WebGL default deployed, resize distortion reproduced

PR #316 merged as `368fe9da7ecde7fd9eb8fd4df35e67a1bdcdeab1`. Railway `d11ef487-8af8-44fc-9d49-4e44698c59ac` reached SUCCESS and exact-SHA smoke passed. The [short phase diagnostic](mobile-continuity-webgl-phase-368fe9d.json) measured52/52ms p95 and62/62ms max. The legacy phase name `geographicCanvas` now records the selected WebGL painter:1169/1234 draws took1991/2092ms (about1.7ms each); region projection/labels took4833/4631ms over698/693 calls. Native-call duration excludes later raster/compositing work. This is a diagnostic, not original frame acceptance.

A browser reproduction exposed a distinct resize gap: reducing the viewport width from390 to350 immediately shrank the old Canvas/SVG CSS box before ResizeObserver could publish a matching camera. The new regression failed with expected390/actual350. Explicit committed CSS extents now travel with the WebGL backing buffer and SVG viewBox, so the old complete frame keeps its dimensions until the new frame is ready. The same regression then passed within the full compiler/4 **11/11 in24.3s** batch. This reproduces a browser resize distortion mechanism; it does not prove every reported iOS flash had that cause.

### Thirteenth checkpoint — atomic resize deployed, label contours prepared

PR #317 merged as `4df5ce0a4acf2cd620faed0dc07b382b2f4cec95`. Railway `3d5e26c8-bd0a-48e5-8247-ce8a6045a58f` reached SUCCESS; exact-SHA smoke and the post-deploy workflow passed. A5 and IP-004 passed. Main CI `37210719084` failed the WebGL steady-pan commit budget:86, retry81 versus the unchanged78 limit; quality and secret scan passed. A4 remains a performance failure. This is a deployed checkpoint, not an all-green closeout.

The next slice prepares translation-invariant label contours and measured segment lengths in the existing bounded pan-geometry cache (128 entries/20k source vertices). Clipping, current nearby-point density, edge selection and hysteresis still run for the current camera. Fractional translations retain the original0.001px normalization; half-grid rounding ties fall back to the original calculation. Tests compare cached and original placements across convex/concave/reversed/offscreen shapes, unequal scales, fractional pans and nearby points. The pre-existing1008-placement digest remains unchanged. Focused tests passed8/8; strict root/app types and production build passed; mobile40/41 (one existing conditional skip) and actual compiler/4 **11/11 in24.0s** passed. Operating CPU/frame benefit remains unmeasured until deployment. The CI commit-count failure remains open independently of these local passes.

### Fourteenth checkpoint — label contour cache deployed; no-op read publication fixed locally

PR #318 merged as `c1bf7b682385742aea1bd5b0cc4da25b1be115d6`. Railway `beea5e8a-7829-4dab-ba05-c38d1f8a6eaf` reached SUCCESS; exact-SHA smoke passed. The [same-condition short phase profile](mobile-continuity-webgl-phase-c1bf7b6.json), DPR3/0 visits/602 frames per checkpoint, returned p95 **50/48ms**, max66/81ms, readiness2008.0ms, cold4/total11 requests, zero errors. Region/label work fell from6.92/6.68ms per call to**4.33/4.01ms** (2969/2735ms across685/682 calls). Contour cache retained21 shapes/8512 contour points,25 builds and21,998 hits. This CPU improvement does not satisfy33.4ms or replace the30-visit gate.

The branch CI still failed the unchanged WebGL commit budget (retry81 versus78). Local repeated diagnostic runs showed50 camera batches but61/64/61/62 commits, with no new World preparation or Composite lifecycle ticks. Re-reading identical parsed content returned a new response object and invalidated density/label work; even immediately resolved reads published loading state. The next fix preserves exact equal response identity (all fields, including density/diagnostics/revision) and only publishes loading if the read remains pending into the next task. Genuine delayed/error and context ownership behavior remain unchanged.

With this fix, full mobile verification passed40/41 in75.1s (one existing conditional skip). Canvas and WebGL each produced**50 commits for50 batches**, while11/18 viewport reads still completed; no fetch starvation or assertion relaxation. The test now attaches work counters and requires completed reads. Exact response equality/change and World geometry tests passed11/11; root/app strict types passed. Actual compiler/4 delayed reads, identity, touch, resize and fallback passed**11/11 in26.2s**. CI recovery and operating measurements require the next deployment.

### Fifteenth checkpoint — no-op publication deployed; original30-visit gate rerun

PR #319 merged as `03d324eb91fc13e58c5d8fd92ce1be55947b18da`. Railway `f3b4c5f1-f369-4715-afb1-1b2bceacb802` reached SUCCESS; exact-SHA smoke passed. Main CI `37212062612`, branch CI `37212040257`, A5 `37212062600` and IP-004 `37212040053` passed. The steady-pan CI regression is resolved without changing its78-commit limit. Full unit verification passed609 tests (two existing skips).

The [uninstrumented normal30-visit profile](mobile-continuity-webgl-normal-03d324e.json), original DPR3 and602 active frames at start/middle/return, returned p95 **48/48/47ms**, max **62/60/61ms**, readiness2579.9ms, cold4/total62 requests and zero errors. Original33.4ms remains unmet. Every checkpoint stayed on WebGL; DOM622/580/581, viewport cache8 entries under8MiB, Render snapshots2/6/6 under16MiB, no pending reads. Hull cache21/84/85 entries under128 and2432/8826/9099 vertices under20k; retained contour points8528/30972/31936 plateau across middle/return. These are explicit working-set counts, not measured heap.

A further native-text candidate retains the selected prepared SVG contour and translates the live text instead of rewriting its referenced path during pure pan. This does not rasterize glyphs or change their scaling. Eight geometry/density tests including the original1008-placement digest passed. Actual compiler/4 **11/11 in40.9s** passed, and two targeted browser cases then verified unchanged contour `d`, same native text identity, unchanged glyph width/height and exact2px horizontal movement without vertical drift. Delayed reads, touch, resize and fallback remain covered. Operating benefit is not yet measured.

The #319 [WebGL/SVG-hidden diagnostic](mobile-continuity-webgl-svg-hidden-03d324e.json), DPR3/0 visits/602 frames, measured43/42ms p95 and53/52ms max, cold1647.6ms/4 requests, total10 and no errors. Hiding native SVG saves only part of the remaining frame time in this software-WebGL configuration. This is not a normal-screen pass or proof that physical iPhone hardware has the same limit.

### Final runtime and user-directed closeout

PR #320 merged as `d3e79d7fdd92e6977cf68af0cb8f9a9a85a99521`. Railway `5e869ff6-f3ff-4363-8e17-2f8eff4e8b25` reached SUCCESS; exact-SHA smoke passed. Main CI `37212609953`, branch CI `37212514229`, A5 `37212610010` and IP-004 `37212514173` passed. Full mobile40/41 passed in1.2m (one existing conditional skip). The [last normal short regression](mobile-continuity-webgl-normal-short-d3e79d7.json), DPR3/0 visits/602 frames per checkpoint, measured49/48ms p95,64/60ms max, readiness1718.5ms, cold4/total11 requests, zero errors. It does not replace the prior normal30-visit measurement or meet33.4ms.

On2026-10-04 the user reported that the operating experience was substantially smooth and explicitly ended further performance tuning, requesting stabilization and cleanup. [The closeout decision](../../implementation/IP-012-mobile-continuity-closeout.md) supersedes autonomous optimization to the original numeric gates. Preserve failed sustained-frame evidence and deferred device/heap work; do not resume solely because a numeric target remains unmet. A5 and incremental publication remain separate backlog.

The final cleanup removes the unused gesture-image-cache inspection block from the profile script. The rejected runtime implementation was already removed; its absence regression and historical JSON artifacts remain. Supported Canvas/SVG fallback/diagnostic routes remain. The inspected renderer/contour/GraphShell scope contains no additional TODO or unimplemented stub. This is scoped stabilization, not a claim that every product backlog item or every possible bug is resolved.
