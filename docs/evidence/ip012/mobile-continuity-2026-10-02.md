# Mobile continuity investigation — 2026-10-02

Active authority: [mobile continuity plan](../../implementation/IP-012-mobile-continuity-plan.md). This is ongoing investigation, not acceptance.

## Before

Production `91cffca`, World Revision 62, 30 Collections, compiler/4. iPhone 14 WebKit emulation in Codex Cloud, default GraphShell, broad viewport `(0,209900,1600,36000)`. Script: `scripts/ip012-mobile-continuity-profile.ts`. Thirty history-based visits/returns, each of start/middle/return includes 602 continuous RAF moves on a native captured pointer. This hybrid input is not physical iPhone evidence. Another local build/test used the host during this initial run, so these frame values are diagnostic and require an isolated comparison.

Initial scene ready: 2546ms; three Render calls including geometry work. Full scenario: 85 Render calls. Frame p95 start/middle/return: 149/82/121ms; max289/133/205ms. 113 point candidates,15 regions,1521 displayed vertices at initial state;584 DOM nodes at first checkpoint. No browser errors.

First602-frame work delta: point transforms67155, region transforms126666, label queries300211, world geometry batches3. This identifies repeated local label/geometry work alongside request reuse. It does not establish network bandwidth as the bottleneck.

## First checkpoint

[PR #304](https://github.com/neocjmix/moirai/pull/304): bounded6-snapshot metadata cache, spatial margin reuse, adjacent level preparation and promotion of useful geometry reads. A complete compiler/4 local snapshot can calculate finer visibility without a new metadata fetch; omitted candidates require bounded refinement. Revision/generation and30-second non-sliding expiry remain enforced.

Unit camera scenario:24 small pans previously required24 metadata calls; now1. Related client/loader/adapter35 tests pass. Composite label work preserves the original full placement output over1008 generated pan/XY-zoom/obstacle fixtures, including clipped geometry and previous-placement hysteresis; repeated polygon normalization and guaranteed-useless density queries are removed. Nine focused label tests pass and strict root typecheck passes. Synthetic parity runtime improvement is not a browser frame gate.

Independent remaining observations: Composite hull↔point swapped React element type, breaking paint continuity; gesture debounce continually reset during motion; Collection drawer focus feedback could create more than1000 repeated successful detail reads. These are separate fixes in progress.
