# Semantic X placement in production Labs

## Authority and outcome

The user's 2026-10-13 11:29 UTC correction explicitly requests selectable modes
inside **production Atropos Labs**, authorizing review, merge and deployment.
This supersedes the earlier standalone-preview/draft-only stop. IP-016's normal
renderer, default layout, Event identity, time, contains DAG, Collection and
served-publication boundaries remain intact. Pages is supporting evidence only.

Settings → Labs → Layout adds three options:

- **Lanes / 분리:** exact-membership temporal lanes, favoring stable orientation.
- **Aligned / 흐름:** whole-episode alignment, favoring shorter lateral travel.
- **Anchored / 절충:** alignment with exclusive country episodes constrained to
  ±20 world units from their lane allocation. This preserves narrow orientation
  corridors while shared episodes can move; it is not historical importance.

All use the same regenerated Bubble geometry algorithm and production GraphShell
renderer. The ordinary Current option is unchanged. The experiments are opt-in
and frozen to the existing history World, r56 and TimeSystem. The solver and
region generator run offline, never during pan/zoom or Collection switching.

## Artifact and compatibility

The lab-only format is bumped from `tstl-product-experiment/3` to `/4`, with three
required candidate fields. Client and asset ship together, pinned by full SHA256.
Old immutable assets remain available. Old clients retain their old pin; a new
client rejects an old or corrupted body before committing the mode and preserves
the current view. No Publication format, database schema, manifest or pointer is
changed. Existing B0/A/B/C/Bubble/Ribbon payloads are byte-for-byte preserved.

New mode validation checks 539 finite X values, 109 owner bounds, exact original
Composite temporal boundaries, complete genuine membership pairs, finite
contours and even-odd fill. All primitive identities, Event Y and relation Y
remain exact. Current makes no lab-asset request. The one opt-in artifact grows
from 5,049,276 to 9,412,301 bytes (local gzip comparison 812,356 → 1,585,469 bytes).
This is a cold-load cost, not browser interaction or real-device performance.

## Visual review requirements

The earlier independent review found free Aligned motion weakened overview
orientation, especially China; Yi also retains local continuity regressions.
Anchored addresses the exclusive-episode part without changing history. Shared
country events can still require movement and peer fills can remain ambiguous.
Production's existing date axis, density/label policy, selection drawer and
Collection controls are retained, avoiding the standalone diagnostic's raw Y
labels and header carpet. Test actual fixed cameras at overview, Imjin and
shared-detail scales; clipping is not a readability gain. Do not promote any
candidate to the ordinary default or describe nominal geometry as semantic proof.

## Verification

Pre-integration HEAD `442e16932ffc22d6e37faaee64229043eee9afdf` CI completed green:
[quality/integration/build/audit, mobile WebKit and secret scan](https://github.com/neocjmix/moirai/actions/runs/38390052948).
The Mac local unit label-order hash mismatch was independently reproduced on
clean main; Linux CI passes it. Standalone preview WebKit found a header hit-test
failure; that surface is not production acceptance.

The extended `smooth-product-smoke.ts` with `TSTL_PLACEMENT_SMOKE=1` checks the
same production WebGL renderer, supplied coordinates/rings/holes, settings,
selection across modes, both zoom axes, all historical drawers, Collections,
reload, one asset fetch and return to Current on desktop/mobile Chromium and
mobile WebKit. Physical iPhone 17 Safari and installed PWA remain untested.

Deployment readback and public verification are recorded below.

## Reviewed source checkpoint

Source `14519b45e79087a488ea5b52b959d8b76cbc355e` passed
[core CI](https://github.com/neocjmix/moirai/actions/runs/38392198041): unit 985,
PostgreSQL 49, mobile WebKit 75, compiler continuity 11, plus format/lint,
boundaries/typecheck/build/audit/secret checks. Full immutable asset replay
matched exactly in 15.2 seconds. A contended Mac full-suite run hit the unchanged
30-second export-test limit alongside the known Mac label-order hash mismatch;
no timeout or assertion was changed. The same export and full suite pass CI.

The separate A4 scale workflow still reports known synthetic Collection-frame
debt. Dense 1k: Collection toggle p95 17 ms / max 112 ms (limit max 100 ms),
versus the previous source `09e7ecd` run's same failing check at p95 17 / max
130 ms. [Current scale run](https://github.com/neocjmix/moirai/actions/runs/38392198061)
and [baseline scale run](https://github.com/neocjmix/moirai/actions/runs/38378638639)
remain visible; no workflow or gate is weakened. These synthetic worlds cannot
activate the r56-only experiment, and the ordinary renderer is unmodified.

## Production deployment and public verification

PR [#359](https://github.com/neocjmix/moirai/pull/359) merged reviewed source
`cea4a74b36e3df36c5b90adacd237c9f12898c47` as
`85a5d11f0cb5d9dcd1eabfc7c0ca51e98aa92fbf`. All three Railway application
services reached SUCCESS; public `/status-public` reported that exact SHA.
[Main CI](https://github.com/neocjmix/moirai/actions/runs/38394199797) and
[post-deploy smoke](https://github.com/neocjmix/moirai/actions/runs/38394818955)
completed successfully. Local final production build also passed after removing
the temporary local diagnostic mount and proxy configuration.

[Open production Anchored](https://moirai-production-8ed1.up.railway.app/graph/v5?world=01a107fb-4018-7fcb-8390-836a40fa91cc&layoutLab=anchored&gsViewport=260,223420,650,1800),
or select 분리 / 흐름 / 절충 in Settings → Labs. The normal 운영 option restores
the ordinary renderer. The publication current.json remained byte-identical:
SHA256 `ef4c07b2b64188d0573ea4ab94e6e46b38765c7dc4b5b443047295586699072a`,
r56, source manifest `d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54`.

Final reviewed-source [A4 scale run](https://github.com/neocjmix/moirai/actions/runs/38393493083)
finished with 13 passing jobs and two failing Collection-toggle frame gates:
100k dense and 1k sustained each p95 17 ms / max 110 ms against max 100 ms.
This is existing synthetic performance debt, not an all-green acceptance claim.
No frame gate or test assertion was weakened.

### Visual disposition

Matched public cameras confirm wider separation of many exclusive histories,
but do not establish lower cognitive load. Lanes adds lateral travel; Aligned
reduces average travel while weakening overview orientation and retaining local
Yi regressions. Anchored preserves the exclusive-country ±20 corridor at a
higher travel cost. In the dense Imjin/detail views, coincident fills and small
holes remain hard to distinguish. Label density is the existing product policy;
there is still crowding and clipping at fixed narrow mobile cameras. Five
matched cameras, including a wider overview, expose this rather than concealing
it through per-mode camera fitting. No candidate is promoted to the default.

The earlier point-only controlled comparisons remain supporting evidence at
[the diagnostic gallery](https://neocjmix.github.io/moirai/tstl-separation/evidence/).
Actual production captures and read-only browser reports are published separately
[here](https://neocjmix.github.io/moirai/tstl-separation/evidence/product/).
Physical iPhone 17 Safari and installed PWA remain untested. The next useful
iteration is dense-region ambiguity and local shared-flow continuity, not
another numerical-objective-only promotion. The existing floating lab comparison
bar also overlaps part of an open mobile drawer; selection and drawer assertions
pass, but the screenshot makes this presentation limitation explicit.

Public acceptance passed **3/3**: desktop Chromium, mobile Chromium and mobile
WebKit, with zero browser/HTTP errors. Each uses the actual public `/graph/v5`
(no local proxy/mount), verifies exact deployed SHA, five matched cameras × four
modes, shared leaf identity, six historical drawers, selection across modes,
actual geometry/holes, both zoom axes, Collection off/on, membership lists,
reload persistence and return to Current. Each produces 25 screenshots;
[compact acceptance record](tstl-positioned-product-2026-10-13/acceptance.json)
links the full read-only reports. This is emulation evidence, not physical-device
or human-perception certification.

## Mobile drawer obstruction follow-up

Independent production review identified the expanded floating comparison bar
as a material regression: its second row covers the open Yi drawer around
y=649–749 on 390px-wide Chromium and WebKit. The follow-up hides the floating
bar only while an Event drawer is selected at widths up to 700px. Settings
retains mode switching and the selected Event/camera; closing the drawer restores
the bar, including return to Current. Desktop controls remain available.

`TSTL_DRAWER_SMOKE=1 TSTL_PLACEMENT_SMOKE=1` runs the targeted production
regression in `smooth-product-smoke.ts`. It fails on the pre-fix production SHA
`3d11d5502934ba59f8118558700d9a41c075085f` in both mobile engines. Assertions
cover hidden bar, pointer access at y650/690/730 inside the drawer, clickable
Notes/Links tabs, selection/camera across B0/Lanes/Aligned/Anchored via Settings,
bar restoration on close, and return to Current. The full acceptance suite also
checks drawer access during each historical selection. Post-deploy results and
exact SHA belong to the follow-up PR and public production evidence gallery.
