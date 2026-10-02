# Mobile Collection label continuity — 2026-10-02

Scope: IP-011 A5 semantic label continuity under ADR-012. No canonical changes,
backfill, density thresholds, camera rules, or label eligibility changes.

## Reproduction

At production `920e16ca693991f56135e204ab074982a8bbb31d`, iPhone 14 WebKit,
World `01995c2a-7b00-7000-8000-000000000101`, all 30 Collections, navigate to
shared Event `019f9280-a500-7000-8000-0000000003e8`, close the drawer, then
toggle the last synthetic Collection off/on:

- Before: one Event target and one Composite label target.
- After: zero Event targets and two Composite label targets.
- All nine visible Event points retained normal density (radius 6, opacity 1).
- The shared Event remained at approximately screen (195, 332).
- `gsViewport=-447.743311,193258.396819,390,664` was unchanged.

This is label-history loss, not density omission or missing Publication data.
The live test's Event target assertion was not removed or broadened to accept
a Composite instead. A general guarantee that every viewport has an Event target
would be inappropriate; the regression here is losing an already admitted label
through an unrelated Collection loader handoff.

## Cause and change

`V5GraphApp` recreates its loader on Collection changes. GraphShell correctly
excludes entities owned by the old loader until the new viewport is ready.
However, its semantic selection effect committed that transitional selection
to `previousSemanticIds`. Points disappear immediately, while Composite exit
paint can remain, replacing the prior label preference. Narrow mobile label
collisions then keep the Composite and remove the Event's primary target.

Commit label history only when a non-null viewport response is ready and owned
by the current loader and enabled Canon selection. Settled empty responses
remain eligible to clear history. Do not preserve stale data or broaden target
eligibility to geographic points.

## Verification

- New iPhone WebKit collision fixture: fails on the original renderer after
  Collection off/on; passes with the fix. Checks current-owner loading gap,
  admitted Event restoration, one shared identity, exact camera retention and
  keyboard Event drawer opening.
- Full unit suite: 527 passed, 2 skipped (129 files passed, 1 skipped).
- Local mobile suite: 29 passed, 5 failed, 1 skipped; production build completed
  as part of this run. This is not broad mobile acceptance.
- Full lint and formatting passed; changed source/test passed Gitleaks.

Remaining mobile failures in this run:

1. `atropos.spec.ts:8` and `:238`: WebKit access-control console errors for
   legacy `/graph/spatial` and `/graph/detail` reads.
2. `v5-collection-explorer.spec.ts:142`: legacy source panel text
   `탐색 범위와 시간 기준` click timeout.
3. `viewport-continuity.spec.ts:29` and `:71`: no `m_event_` points in restored
   far-away/outward-drag fixtures.

These are disclosed failures, not established new regressions or fixed by this
patch. Exact deployed SHA, Railway terminal status, and the unchanged live
four-test iPhone suite must be checked after main rollout.

## Codex Cloud review and rollout

Reviewed branch `fix/mobile-semantic-label-continuity`, exact head
`4f27be6f6802f6d37a20225407ed0618b251195b`, against `920e16c`. No blocking
review finding: the readiness and loader/selection ownership checks match the
existing point-source guards. Settled empty responses can still clear history.

[PR #302](https://github.com/neocjmix/moirai/pull/302) merged as
`19de027c588a2277e9cc38b6cda3ea63d69958f7`. Railway production Atropos
deployment `011665b7-0b17-489e-9d91-00dae6543a27` reached **SUCCESS**;
API `e0ce4b01-ff0f-454a-b503-02f969586ac4` and worker
`ec559dcd-af76-4ec6-a7f7-1be595beed68` also reached **SUCCESS**. Public
`/health` confirmed the merge SHA.

Independent Cloud verification: 527 unit tests passed, two skipped; lint,
format, root and web strict typecheck passed. The production Next.js build
and the new iPhone WebKit collision fixture passed. PR CI quality/integration/
build/audit and secret-scan jobs passed. Browser runtime libraries were installed
inside the agent's temporary/cache directories; the Cloud-only live configuration
uses the inherited HTTP proxy. Repository browser assertions were unchanged.

The unchanged four-test live iPhone suite passed after exact-SHA deployment
in 22.7 seconds: preview, synthetic render zoom/filter, 30-Collection shared
identity/keyboard narrative, and historical Collection/unplaced/Composite
navigation. A pre-rollout rerun on `920e16c` also passed (1.4 minutes), so the
previous live failure is not claimed to reproduce on every run. This does not
replace the deterministic loading-gap regression fixture or establish p95
performance improvement.

[Main A5 public mobile checkpoint 36960707808](https://github.com/neocjmix/moirai/actions/runs/36960707808) succeeded.
[Exact-SHA post-deploy smoke 36960825977](https://github.com/neocjmix/moirai/actions/runs/36960825977) succeeded, including readiness, live mobile navigation, and authenticated authoring-to-public-read verification.

### Reconciled baseline

Public semantic reads returned served Revision 62, 30 Collections, 677 placed
shapes and two unplaced Events. Public Render metadata returned
`render-compiler/4`, generation
`7b3c2fd8da688b17a6a5bd41ac90b97849fadbb4d8654220e4f39b340f4243e3`,
fixed origin `(0,0)`, L0 span `(4096,16384)` and spatial levels `-8..12`.
The normal GraphShell defaults to verified v3/v4 render data and preserves
its painter; `?tileData=0` retains the semantic rollback. The separate
`?renderTiles=1` scene remains a diagnostic surface.

IP-011 A1–A3 are complete, A4 is closed with deferred backlog, A5 is active
and incomplete, and IP-012 is active. A4-B01–03, broad mobile regression
failures, physical-device/heap evidence, A5 capacity/readability and pin/auto/
complete catalog work, and incremental Render reuse/invalidation remain open.
Passing the focused live suite does not close those gates.

The handoff's Collection-specific Event Narrative and no-orphan rules are
superseded by accepted CON-003: identity is World-scoped, Events without
Collection membership are valid, and each Event and each Collection has
one independent Narrative. ADR-012 excludes the global tile manifest from
the viewport critical path and rejects spatial count clusters as substitutes
for authored Composite semantics.
