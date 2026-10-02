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

## Second checkpoint — verification in progress

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
