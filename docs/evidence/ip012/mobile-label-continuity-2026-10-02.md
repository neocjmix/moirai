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
