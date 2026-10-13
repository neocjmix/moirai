# Exact-signature temporal lanes: separation experiment

2026-10-13 UTC. **Reviewable experiment, not a recommended production replacement.**
The lane candidate makes exclusive peer histories easier to distinguish in the
overview captures, but widens the drawing and increases lateral movement where
histories share Events. The subsequent **Aligned** iteration below cuts that travel
while retaining most separation, but is still experimental. Dense mobile labels and all-Composite fill overlap remain
unresolved. No user perception result or global optimum is claimed.

## Baseline and authority

Started from and rechecked main `29f1a9e32f11d9a2199546da03a6d264cdd7f774`.
The design and handoff match documentation commit
`0ead253b4cb71742d7c1ef78c480e66dff708a82` byte-for-byte. This work follows the
explicit follow-up request for an isolated implementation, visual iteration,
draft PR, and experimental preview, with no merge or default promotion.
CON-003, CORE-MODEL, TS-002/005/006/010 and IP-016 remain unchanged.

The unchanged `history-r56.json` SHA-256 is
`5957645873d0484244e317a99c459df025e2d80d07dc5819e79c62569c716b64`:
539 Events, 109 Composites, 430 leaves, 614 contains edges, 7 Collections.
The scalar snapshot cannot recover lossless time semantics. Original point Y,
Composite temporal bounds, IDs, DAG, and Collection data are preserved.

A fresh replay reproduces **5,349 constraints / 1,000,000 visits /
BUDGET_EXHAUSTED / feasible fallback**. The fallback in `candidate.ts` starts
from its existing ancestor-root mean anchors and performs forward packing.
B/C still reuse A X. Bubble/Ribbon still use B0 X. No existing candidate is edited.
The observed public application SHA is now `29f1a9e`, later than the earlier
`14895db` runtime checkpoint; see the saved public status.

## Figures and hypothesis

Inspected actual rendered figures, not just abstracts:

- [TimeSets accepted PDF, printed p4, Figures 3–4](https://openaccess.city.ac.uk/id/eprint/15534/1/IVI605347_REV2.pdf#page=5):
  exclusive set interiors and shared seams motivate signature bands. Figure 4a's
  long cross-set links are a relevant warning; 4b's Event duplication is rejected.
- [StoryFlow PDF p3, Figure 2](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/storyflow.pdf#page=3):
  ordering, alignment, and compaction are separate operations. This prototype
  tests ordering/packing; it does not import a session tree into Moirai's DAG or
  claim to solve the paper's alignment problem.

`semantic-lanes.ts` retains A's deterministic root order, but **does not use
root-anchor averaging as its new X algorithm**. Each leaf belongs to exactly
one full ancestor-signature group, within one exact root-signature band.
Temporally overlapping groups reserve separate horizontal intervals. Events
with overlapping nominal support within a group use separate columns; disjoint
temporal episodes can reuse space. Groups are drawing allocations, never new
Events, contains edges, Collections, or asserted historical durations.
Each Event receives one X. Composite headers use descendant medians and keep
their own exact parent/ancestor lists. Equal-membership Composites can have
coincident anchors and distinct owner labels without duplicating their leaves.

The first prototype reserved 2,750 units. The revised `Lanes` preset uses a
10-unit support pitch, 8-unit peer gutter, 28-unit root-signature gutter and
120-unit metric idle-gap threshold, reducing allocated width to 1,640. All
parameters are serialized. The wide trial is retained for inspection.

## Controlled comparison and results

The static diagnostic has B0/A/B/C/Bubble/Ribbon, A-Bubble, Lanes-wide and Lanes.
**Bubble, A-Bubble and both lane variants use the same unmodified capsule-union
region generator and parameters, regenerated from each X placement.** No old
polygon is moved or frozen around new points. Original B0/A/B/C/Ribbon remain
as reference renderings with their own geometry. Point-only views remove paint.

The [metric file](tstl-separation-2026-10-13/metrics.json) gives definitions and
all results. Peers share a direct contains parent or are roots, with ancestry
pairs excluded. This is a semantic context in a DAG, not integer tree depth.
For 100-source-unit windows where both peers have exclusive leaves:

| Diagnostic | B0 X | A X | Lanes-wide X | Lanes X |
| --- | ---: | ---: | ---: | ---: |
| Overlapping exclusive-peer windows / 166 | 65 | 46 | 21 | 23 |
| Sum of exclusive-envelope overlap widths | 1,964.9 | 3,416 | 1,145 | 863 |
| Leaf X extent | 810.6 | 1,318 | 2,736 | 1,630 |
| Mean short-gap Composite-center travel | 46.9 | 76.6 | 207.0 | 122.5 |
| Nominal 5×5 leaf-support collisions | 83 | 0 | 0 | 0 |
| Same-Bubble nominal covered memberships / 1,390 | 1,210 | 1,390 | 1,390 | 1,390 |
| Same-Bubble connected Composites / 109 | 89 | 103 | 106 | 105 |

Membership coverage alone does not distinguish A from the lane candidate. The
separation improvement comes with a clear flow cost. These are drawing proxies,
not a proof of human readability, true region-intersection semantics, complete
arrangement certification, or screen-space clearance under independent zoom.
The unchanged Bubble validator rejects nominal nonmember penetration and proper
self-crossings; global exact-atom and temporal certification remain unresolved.

The measured narrow placement took about 2–3 ms and region regeneration about
2–3 seconds on Node 22 / macOS arm64. The final preview includes `runtime.json`
with exact build measurements. These exclude network, browser interaction,
physical iPhone performance and human task time.

## Visual critique

The production baseline has **36 captures**: all six existing modes × overview,
Imjin/Yi middle, event detail × 1280×800 desktop and 390×844 mobile Chromium,
DPR 1. [Inspection summary](tstl-separation-2026-10-13/baseline/summary.json)
confirms matched camera transforms and zero page errors. The historical B0
self-intersecting hull and its renderer fallback were left untouched.

The new diagnostic has **96 matched-comparison captures**, plus dense-all-region
and shared-membership captures. Every comparison uses the same SVG/font/DPR,
scope and time window; fixed cameras and per-layout fit-to-content cameras are
both included. Fit views preserve visible leaf IDs; fixed views honestly expose
offscreen Events. Counts and omitted labels are displayed. It uses the existing
Lab gesture math but is **not GraphShell or production LOD acceptance**.

- Overview: [B0 Bubble](tstl-separation-2026-10-13/comparison/desktop-Bubble-overview-fit-regions.png)
  versus [Lanes](tstl-separation-2026-10-13/comparison/desktop-Lanes-overview-fit-regions.png).
  The lane view has distinct exclusive Chinese/Korean/Japanese columns. Shared
  signatures form intervening groups; long bridges remain, and blank space grows.
- Middle: [B0 Bubble](tstl-separation-2026-10-13/comparison/mobile-Bubble-imjin-fit-regions.png)
  versus [Lanes](tstl-separation-2026-10-13/comparison/mobile-Lanes-imjin-fit-regions.png).
  Yi's exclusive portion separates from Imjin's shared wartime portions, but the
  mobile fit view loses label capacity. Following a Composite through shared
  country signatures still requires lateral jumps.
- Detail, paint removed: [A X](tstl-separation-2026-10-13/comparison/desktop-A-Bubble-detail-fixed-points.png)
  versus [Lanes X](tstl-separation-2026-10-13/comparison/desktop-Lanes-detail-fixed-points.png).
  This is actual changed placement, not a region-color effect; the wider lane
  candidate also puts more IDs outside some fixed cameras.
- All 109 regions: [B0 Bubble](tstl-separation-2026-10-13/comparison/desktop-Bubble-all-composites.png)
  versus [Lanes](tstl-separation-2026-10-13/comparison/desktop-Lanes-all-composites.png).
  Separation helps some peer clusters but nested alpha overlap and annotation
  load remain substantial. Region paint is not a sufficient solution.
- [One shared Event's exact memberships](tstl-separation-2026-10-13/comparison/mobile-shared-event-memberships.png).
  The 539-entry reveal control provides access to offscreen or unlabeled Events.
  Imjin itself still has only Korea/Japan as direct parents; Chinese membership
  of shared descendants is not promoted to a false China→Imjin edge.

**Disposition:** keep the narrower lane candidate as an experimental comparison,
not a canonical winner. A next iteration should align the same Composite's
exclusive/shared episodes before compaction and compare the flow cost against
the gutters. Do not merely tighten all gaps or change alpha to hide the problem.

## Targeted alignment iteration

After the first review checkpoint, `Aligned` translates complete temporal
signature episodes while retaining the order and minimum gutters of all 643
overlapping episode pairs. Empty-time root-band reservations can move. A bounded
coordinate descent minimizes squared adjacent 100-source-unit Composite-window
center changes, plus a weak centered-position penalty (0.005). Every Composite
has equal weight; there are no historical importance scores. It stops at a
movement tolerance or 500 sweeps; this run converged in 466 sweeps. This is a
fixed-order local alignment, not a global ordering optimum or StoryFlow's solver.
Bubble geometry is regenerated again with the unchanged generator.

| Diagnostic | A | Lanes | Aligned |
| --- | ---: | ---: | ---: |
| Overlapping exclusive-peer windows / 166 | 46 | 23 | 24 |
| Sum overlap width | 3,416 | 863 | 960.4 |
| Mean short-gap center travel | 76.6 | 122.5 | 58.4 |
| Leaf extent | 1,318 | 1,630 | 1,630 |
| Nominal support collisions | 0 | 0 | 0 |

Localized **total** travel / directional reversals (same source windows):

| Composite | A | Lanes | Aligned |
| --- | ---: | ---: | ---: |
| 한국사 | 4,816 / 27 | 10,616 / 25 | 4,156 / 21 |
| 일본사 | 4,769 / 24 | 8,578 / 25 | 4,198 / 20 |
| 중국사 | 2,461 / 14 | 4,455 / 13 | 2,665 / 11 |
| 호종헌의 절강 진압과 해상 세력 교섭 | 495 / 2 | 2,120 / 2 | 332 / 2 |
| 이순신의 생애 | 856 / 7 | 1,395 / 6 | 1,056 / 8 |
| 정유재란: 재침략과 마지막 공방 | 161 / 1 | 419 / 1 | 254 / 1 |

[Exact IDs, centers, leaf witnesses and transition windows](https://neocjmix.github.io/moirai/tstl-separation/continuity.json)
are reproducible with `separation-continuity.mjs`. China, Yi and Jeongyu still
regress against A in total travel. The objective is not a stopping criterion:
actual desktop/mobile overview, middle and point-only detail captures were
reviewed alongside A and both retained lane trials.

- The fitted middle camera shrinks from 1,602 (Lanes) / 1,342 (A) to 889 units.
  Desktop omitted labels fall from 110 / 105 to 101. Yi's exclusive vertical
  stretch and the two shared wartime episodes remain distinguishable, although
  the wide horizontal war clusters and overlap of Yi/Imjin fills remain.
- Overview country centers take fewer lateral reversals. Temporally disjoint
  exclusive episodes can now share X, so this is not a globally straight country
  column design. Peak width remains 1,630 because simultaneous groups bind.
- Point-only detail confirms actual placement changes. The desktop fit omits
  43 labels versus A's 44: essentially no label-capacity gain at that scale.
- The fixed middle camera clips leaves (114/430 in Aligned); the fitted view
  retains the same 150 leaves as A/Lanes. Fit and fixed captures are both exposed.
- Mobile remains crowded; its fitted middle view omits 119 labels. Nested
  all-Composite fill remains unsuitable as an unqualified membership map.

**Disposition:** a defensible alignment improvement over the first lane trial,
with mostly retained peer separation and lower aggregate travel than A. Retain
all candidates for review. Do not promote it: local flow regressions, screen
labels, region semantics and production LOD integration remain open.

## Verification and isolation

- New invariant tests: 5 passed, including r56 identity/time/source immutability,
  all-pair nominal support clearance, input-order determinism, AB/AC/BC,
  equal-membership peers, and invalid input rejection.
- Whole suite after alignment: 974 passed, 2 skipped, 1 failed. The untouched
  `composite-label-density-order.test.ts` hash mismatch reproduces on a clean
  main checkout: [baseline reproduction](tstl-separation-2026-10-13/existing-failure.txt).
  No assertion or timeout was weakened. An earlier sandbox-only run also hit
  existing localhost-listener EPERM; the authorized rerun removed that obstacle.
- Workspace typecheck, lint, formatting and full production build passed.
- Desktop/mobile Chromium diagnostic smoke passed: mode/camera and ID round
  trips, direct-parent semantics, shared memberships, all-Event reveal, label-only
  filtering, selection stability and pan. [Records](tstl-separation-2026-10-13/browser-results.json).
  The test caught and fixed pointer capture swallowing header clicks.
- Gitleaks 8.30.1 scan passed; dependency audit reported 9 moderate, no high or
  critical advisories. No dependency changes. PostgreSQL integration was not run
  because this slice has no persistence or service changes.
- Physical iPhone 17 Safari/PWA and WebKit are unverified for this new diagnostic.
  Existing synthetic Collection frame debt is separate and is not a Lab timing result.

All implementation files are isolated under `scripts/tstl-research/`; the
production selector, asset pins, rendering code, history, Publication manifests,
served pointer and database are unchanged. No merge is authorized in this task.
Deployment is verified at the [isolated Pages preview](https://neocjmix.github.io/moirai/tstl-separation/). It is a new `tstl-separation/` subtree on the existing
Pages branch, preserving all pre-existing paths and blobs. The preview's
`build.json` owns its source SHA and artifact digest; draft-PR HEAD may include
later evidence-only updates.

## Reproduce

Use the repository's Node 22–24 and pnpm 10.17.1. The preview is not a new package
and adds no dependencies.

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run scripts/tstl-research/semantic-lanes.test.ts
node --import tsx scripts/tstl-research/separation-build.ts .artifacts/tstl-separation/preview
python3 -m http.server 4173 --directory .artifacts/tstl-separation/preview
node --import tsx scripts/tstl-research/separation-smoke.ts http://127.0.0.1:4173
node scripts/tstl-research/separation-product-capture.mjs
```

The last command is a read-only capture of the deployed baseline. The static
preview verifies its comparison artifact digest before drawing, never fetches
canonical history, and never runs a layout solver on camera changes.


## Published review access

- [Draft PR #359](https://github.com/neocjmix/moirai/pull/359)
- [Interactive comparison](https://neocjmix.github.io/moirai/tstl-separation/?mode=Aligned&view=imjin&fit=1)
- [Full capture gallery](https://neocjmix.github.io/moirai/tstl-separation/evidence/)
- [Build provenance](https://neocjmix.github.io/moirai/tstl-separation/build.json)

Initial source `ab3c6defc9176a69b8a95999acb29280387b65c8` was deployed with
Pages commit `36b56271df817a24615d25698e5fa34a1d0a5b58` and passed 98 public
browser check records. Pre-existing Pages paths and blob SHAs were unchanged.
Production history pointer was byte-identical before/after publication (r56).
The final alignment build's source is recorded in `build.json`.

CI on the initial source caught undefined browser globals in the `.mjs` capture
helper; these were corrected to `globalThis` with an explicit Node console
import. The earlier local lint run had not covered that untracked file. This
was a new helper defect, separate from the reproduced baseline unit hash failure.

Alignment verification: all 5 invariant tests and full workspace typecheck/lint
pass. The full suite retains only the same clean-main hash failure (974 pass,
2 skip). Local Chromium generated 120 controlled comparisons and passed 122
check records. Public alignment verification is recorded with the final build.


Final alignment source: `aa9db45900f18d62419e9567919d9648932606d4` (clean build).
Pages commit: `4b7cd098c04bf802d1b3ea71fa44c492a7fdfe5a`.
[Aligned metrics](tstl-separation-2026-10-13/aligned/metrics.json),
[runtime](tstl-separation-2026-10-13/aligned/runtime.json), and
[browser records](tstl-separation-2026-10-13/aligned/browser-results.json)
are saved separately from the initial trial. The final gallery retains all
36 production baselines and 130 diagnostic captures (166 total).

Representative Aligned captures:
[overview](tstl-separation-2026-10-13/aligned/desktop-Aligned-overview-fit-regions.png),
[middle fit](tstl-separation-2026-10-13/aligned/desktop-Aligned-imjin-fit-regions.png),
[middle fixed](tstl-separation-2026-10-13/aligned/desktop-Aligned-imjin-fixed-regions.png),
[point-only detail](tstl-separation-2026-10-13/aligned/desktop-Aligned-detail-fit-points.png),
[mobile middle](tstl-separation-2026-10-13/aligned/mobile-Aligned-imjin-fit-regions.png),
[all Composites](tstl-separation-2026-10-13/aligned/desktop-Aligned-all-composites.png).
The all-Composite capture makes overlapping header annotations especially clear;
its leaf-label omission counter does not count or certify header collisions.

The final measured Aligned placement is 28.7 ms and regenerated geometry 2.50 s.
Whole offline comparison-build peak RSS is 843 MB, exceeding the earlier 250 MB
research target; it includes baseline/A and four geometry variants, not one
placement or browser memory. No runtime or memory acceptance is claimed.

Final public Aligned preview passed **122 Chromium browser check records**,
including shared identity/parent inspection, matching fixed cameras, point-only
comparisons and pan. Production r56 pointer remained byte-identical after this
second publication. All original Pages paths/blob SHAs remain unchanged.
