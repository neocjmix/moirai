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

Deployment SHA, exact CI and public smoke results will be appended after readback.
