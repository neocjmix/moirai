# IP-013 Composite / Layout Lab — 2026-10-04

## Reconciled authority and starting state

This user explicitly requested R representation experiments and an executable L strategy boundary together. Starting main and public deployment were `4c726661c913de5920b9866344f2ca76e80a388d` (#323). A fresh fetch during implementation still matched that SHA. #323 is merged and deployed; CURRENT's previous “#323 verification / history not started / last runtime #320” and IP-013's initial World API inventory were stale. The earlier documentation-only instruction does not describe this session. Historical performance closeout remains accepted; no performance tuning was reopened.

Read AGENTS, CURRENT, IP-013, IS-001, IP-001, CON-003, CORE-MODEL, TS-002/004/005/006/010 and RM-001. The actual architecture and coefficients are recorded in [layout analysis](layout-analysis.md); production representation coupling and research differences are recorded in [representation analysis](representation-analysis.md).

## Reviewable surface

- `/labs/layout?demo=1`: standalone research page, outside `/graph` layouts and GraphShell.
- `/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc&revision=26`: pinned actual-history read. If the served revision advances, the page explicitly rejects the stale pin instead of replacing it. The saved JSON input still replays offline.
- `/labs/layout/snapshot?world=…&revision=…`: GET-only complete public input. It reads one verified served root and authenticated public content/temporal shards. There is no DB, worker, authoring, compiler, PUT, promotion or backfill operation.

The UI receives one serializable frozen World input. Layout parameter changes debounce120ms then compute locally. Camera, Collection visibility and representation changes do not recompute World layout. A/B panes share snapshot, camera, viewport and active Collections; B→A captures a candidate and its hysteresis history. Controls include independent X/Y zoom, reverse wheel direction, pan, and bidirectional X/Y/XY sweeps. Event selection/focus makes offscreen support and nested cases inspectable. Short authored intervals are framed at their actual display span instead of imposing a one-year floor. Optional pinned mobile A/B switching keeps geometry visible while adjusting controls.

The simple SVG research renderer reuses the production Y-sweep hull function, complete authored child support, Event/Composite identity, relation lines and temporal axis. It uses stable-ID density ranking, bounds-based coverage suppression and local label collision; it does not duplicate tile admission, GraphShell HUD/editorial label rules, tile continuity, caches or production gesture machinery. These differences are visible in the UI and are not a claim of production pixel parity.

## Engine and configuration

`prepareV5LayoutInput` adapts public or canonical+projected facts once. `@moirai/graph-presentation/layout-engine` owns browser-safe `computeLayout(input, selection)`, algorithm registry and parameter schemas. `buildV5WorldLayout` used by Lachesis invokes that exact implementation with fixed `CANONICAL_LAYOUT_SELECTION`. Production read/render paths import neither Lab UI nor browser computation.

| Algorithm | Version | Parameters |
| --- | --- | --- |
| `legacy-force` | `1` | iterations32, repulsion.03, causesAttraction.22 (v5 adapter no-op), temporalAttraction.12, maxStep.22, repulsionMode auto/all/bounded, neighborsPerSide24, windowYears10 |
| `deterministic-slots` | `1` | slotSpacing110, collisionWindowYears.1 |

Both record `seed:null`; neither uses random input. Reference slots replace X before Composite geometry is derived and preserve baseline temporal placement. Constraint-based, packing, local-relaxation and other candidates remain unimplemented. The current force model is a baseline, not an adopted winner. Step clipping, cooling, inverse-square repulsion and attraction are coupled; more iterations changes the cooling schedule. Auto bounded repulsion counts all Events and activates above500.

Representation controls cover hull/ordinary/small paint, hidden density threshold, label/child/relation visibility,32px compact threshold,16px blend and ownership hysteresis,100px child reveal with.58 start ratio,64/96/128 density ranks with±8 retention, .35/.2 point radius scales, .35 coverage fade,220ms paint and260ms label durations. Contains, memberships, identities and canonical temporal facts are never parameters.

Local save stores a versioned JSON preset in `localStorage`. Export/download or text/file import includes algorithm/version/parameters/seed, World/source+served revision, SHA-256 input digest, representation version/config, camera+viewport, active Collections, A/B candidates, hysteresis histories and the complete public prepared snapshot. Import checks schemas, versions, numeric ranges, digest, World/revision, exact containment/relations, Collection reciprocals and temporal input consistency before freezing. Input digests detect corruption; a locally imported file is not independently authenticated historical provenance. No server-side preference or publication selection is created.

## Actual history, read-only

Connected Moirai `world_export` at revision26 returned complete content; this was a read-only operation. No ChangePlan, validate/commit, reset, publication compile/upload or served-pointer change was performed. For local actual-history browser verification the export was projected/prepared in memory, then imported as a research preset. Public new-route loading still requires this PR to be deployed.

- World `01a107fb-4018-7fcb-8390-836a40fa91cc`, Time System `01a107fc-3994-7889-969f-7a210c19fa24`.
- Source/served26;147 Events,386 Relations,3 Collections,270 memberships;19 Composites,92 Events shared across Collections;147 placed,0 unplaced.
- Observed public root digest `7d99a8c84f4444e62fcd6dcaec2bfcb0a26c9ecf689c928adc3326ed2c25d6dc`.
- Prepared input digest `c7a03e88039ee665e60051739fbefb9182d26d89bfd8c8fe2f8b41668bd3c4ea`.
- `한산도·안골포 작전` `01a107ff-8b3c-7f88-bac7-a721ce10410a` contains `한산도대첩` `01a107ff-8b3c-75eb-bc17-7166e9061e76`, itself with3children.
- `회령포 함대 수습→명량` `01a10816-b084-7744-8c7e-7cd6da80d61f` and `명량해전` `01a10816-b084-7829-b3c6-c58d01a342e5` give another nested example; Myeongnyang has3children and2Collections.
- `노량해전` `01a10817-869d-7d0f-ab52-d208b8648248` has3children and belongs to all3Collections.
- This revision has no child shared by multiple authored parents; overlapping containment is tested synthetically. Historical accuracy/pilot acceptance and iPhone17 physical-device acceptance remain user review.

Starting-main original `v5-world-layout.ts` and `urdr-chart-plane.ts` were executed beside the new implementation against this exact export. Full result JSON was byte-identical:19,500 UTF-8 bytes, SHA-256 `101e3474938c3be2a35a42dbb5854d1a0e320ca0e4b3d278cbf5c3b8ebf61c65`. Canonical production layout was not promoted or backfilled.

## Regression fixtures and verification

Synthetic fixture:174 Events,173 placed,6 Composites,160 dense atomic points, nested and multiple-parent overlap,550-year long span, two-day span, offscreen child, sparse Events, shared memberships and one unplaced Event. Pre-refactor174-Event `/1` and574-Event bounded `/2` output digests are fixed regression assertions. Tests also cover >500 branch controls, all algorithm schemas, repeatability, identity/Y/contains invariants, zero reads during tuning, tampered/missing shard failure, stale pin rejection, exact preset replay and production/research import closures.

Verification in this checkout:

- Final full unit suite:675 passed /2 skipped across155 passing test files.
- PostgreSQL17 integration/migration:49 passed, isolated ephemeral local database.
- Strict workspace typecheck, full ESLint and architecture checks passed.
- Production workspace build passed; final UI build repeated after integration changes.
- Dependency audit:0 high/critical;9 existing moderate findings. No dependency version changes.
- Staged-diff gitleaks scan passed; generated ignored Next build files are excluded from source evidence.
- Mobile WebKit iPhone14 emulation:4 permanent regression tests + actual-history revision26 smoke passed. Tuning produced0 fetch/XHR/write requests and0 browser errors. Exact JSON roundtrip also preserved camera, viewport, hysteresis and geometry after browser resize. Tap/button input is real browser input; wheel reversal uses a dispatched event because mobile WebKit does not expose hardware wheel input.
- Actual-history screenshots: [Hansan/Angolpo at the default focus](layout-lab-history-r26.png), [pinned mobile geometry and parameter controls](layout-lab-mobile-controls.png). These are automated emulation evidence, not physical iPhone17 acceptance.
- Final read-only public status and history-pointer recheck still showed deployed `4c72666`, source/served26 and the same root digest. CI links are recorded on the PR.

## Delivery and next human comparison

Implementation branch `feat/ip013-layout-lab`. PR-first/no automatic merge remains in effect. The observed deployed SHA is still starting-main `4c72666`; new Lab deployment is not claimed before a verified rollout. Existing staged Railway changes from another operation were observed and left untouched.

Compare Hansan/Angolpo and Noryang while sweeping Y separately from X; capture B→A before changing32/48px hull ownership and58/100px child reveal. Then compare force versus slots at the same camera, especially dense-year overlap and long thin hulls. Export a chosen preset for review. Canonical config adoption and publication/backfill remain separate, unperformed work.
