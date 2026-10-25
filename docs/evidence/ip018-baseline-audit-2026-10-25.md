# IP-018 — Lab v1 shutdown and baseline audit

Observed 2026-10-25 UTC / user decision 2026-10-26 KST. This records repository evidence, not aesthetic approval or a claim that deployment/republication has completed. Runtime/deployment results must be added after observation.

## Verified repository boundary

- Fresh clone from `neocjmix/moirai`, main `36520cfb62672dd9062ca9b27ae5be858070bd9c`, initially clean. One local worktree, no pre-existing local uncommitted work. The 349 remote refs (including origin/HEAD) were inventoried without deletion. Remote refs are retained history, not proof of active agents on other machines.
- **Selected pre-v1 baseline: `4c726661c913de5920b9866344f2ca76e80a388d`**, World lifecycle/Event browsing PR #323, 2026-10-04 16:49:24 UTC. It is the parent of the first v1 main commit. [Original Lab evidence](ip013/layout-lab.md) records this SHA as both starting main and observed public deployment.
- First v1 branch implementation: `b28c05b`, 2026-10-04 23:39:48 UTC, “isolate Composite and layout research with shared engine”. Main introduction: `290cbbe1ed15b4927a6bbeb964fcd37a40d9bf2d`, PR #324, 2026-10-05 01:01:34 UTC. It extracted `packages/graph-presentation/src/layout-engine.ts`, introduced `/labs/layout`, controls, reference-slot strategy and shared production adapter.
- The original extraction evidence executed pre-v1 `v5-world-layout.ts` and `urdr-chart-plane.ts` beside the extracted engine against immutable history r26: byte-identical 19,500-byte output, SHA-256 `101e3474938c3be2a35a42dbb5854d1a0e320ca0e4b3d278cbf5c3b8ebf61c65`. This is dated evidence for baseline choice, not a replacement for current regression checks.
- A whole-repository reset would discard independent valid changes, so recovery reconstructs only the layout default and removes v1 execution/UI on current main.

## Force and Y-sweep provenance

URDR was cloned read-only to inspect the pinned source (not imported as a dependency). `neocjmix/urdr@0267c8fd081ca9a3cd556f8f7319c600248c3760`, `shared/domain/src/chart-plane-projection.ts`, contains `optimizePointXPositions`: stable point/anchor preparation, fixed anchor X, inverse-square X repulsion, CAUSES/PRECEDES/temporal edge attraction, simultaneous next-X updates, clipped step and `1 - iteration / iterations` cooling. Constants are 32 iterations, 0.03 repulsion, 0.22 CAUSES attraction, 0.12 temporal attraction and 0.22 max step. The total-iteration cooling belongs only to the restored legacy baseline and explicitly fails v2's iteration-prefix requirement; it must not migrate into v2.

Moirai's `packages/graph-presentation/src/urdr-chart-plane.ts` identifies that source and documents later temporal repair/indexing. The pre-v1 v5 adapter already selects bounded repulsion for more than 500 World Events (24 neighbors per side within 10 years, `v5-world-layout/2`); smaller Worlds use the unbounded `/1` baseline. This pre-v1 optimization is retained. The adapter maps World temporal projection to presentation coordinates and keeps Collection selection out of World layout. Restoration must preserve authored temporal/identity contracts rather than restore URDR's older product/domain model.

The publication Y-sweep implementation `packages/graph-presentation/src/v5-render-hull.ts` was introduced at `f9732e9` (#266, 2026-09-28 16:59 UTC), before v1. It sweeps direct-child Y bands, includes nested child polygon intersections, builds left/right envelopes and uses a convex fallback for insufficient support. `buildYSweepHull` in `apps/atropos-web/src/urdr-port/src/components/graph-shell-region-geometry.ts` is the frontend counterpart. Existing parity tests cover nested/irregular support. No new surface algorithm is needed.

## Lab v1 lineage and disposition

| Work | Evidence | Disposition |
| --- | --- | --- |
| Shared Lab, force controls, slots and representation research | #324–328, `290cbbe` onward | Remove executable Lab; unfinished force/representation research cancelled |
| Collection/global incidence research | `5e6dc08` 2026-10-10 13:32 UTC, `bc06167` 14:26 UTC | Research cancelled; dated measurements retained |
| `global-incidence/1` operating promotion | #345 `45c637bce8e7730f562d0a7842ff9d9e1dbac03c`, 2026-10-10 15:12 UTC; #346 Lab copy fix | Restore prior Force default; published generations are rebuildable |
| TSTL A/B/C and fixed-coordinate Bubble/Ribbon | #351, #353–357 | Remove candidates/UI/scripts; unresolved semantic/visual checks cancelled, not passed |
| Lanes/Aligned/Anchored X candidates | #359–362 | Remove candidates/selectors; follow-up cancelled |
| Organic Surface | #363–365 | Remove runtime/controls; WebKit and real-device follow-ups cancelled, not completed |

Historical `docs/evidence/` and prior plan content remain. [Archived CURRENT](../implementation/CURRENT-HISTORY-THROUGH-LAB-V1.md) preserves the exact previous status under an explicit historical notice. IP-013 R/L, IP-016 and IP-017 now point to IP-018 and cannot authorize resumed v1 work.

## Independent improvements to preserve

- #323 World lifecycle/selection and Event browsing; canonical authoring, revisions, temporal projection, identity and authorization.
- #329–336 applicable GraphShell hierarchy transitions, right HUD, labels, retained geometry and pigment rendering.
- IP-015 #341–343 realtime camera/eventual scene, committed source retention, worker generation guards and custom WebGL2. Renderer comparison research is already closed; no reopening.
- #347 `f52b8d9` OAuth metadata/World authorization and dependency security fixes; #348 `8eea159` short-lived GitHub OIDC smoke. Authentication parameters are not rolled back.
- Immutable publication generations, source/revision validation, atomic pointer transition, worker recovery and general source-generation renderer recovery where still applicable.
- Pre-existing mobile performance closeout and its honest failed/unverified metrics. This task does not restart broad tuning.

## Open work and CI inventory

[Open PR snapshot](ip018/open-prs-before.json) contains only [#337](https://github.com/neocjmix/moirai/pull/337), `docs/ip014-pluggable-renderer-handoff`, still OPEN with no merge. It is unrelated renderer documentation and is left untouched. No open v1 implementation PR required closure. [Remote refs](ip018/branches-before.txt) and [worktree inventory](ip018/worktrees-before.txt) are preserved; remote v1 branches are historical and not deleted.

[CI snapshot](ip018/ci-before.json) records initial main CI in progress. The preceding `275eaaf` CI failed at **Dependency audit**, while its authenticated post-deploy smoke passed. No claim of all-green starting CI is made. These are observed states, not grounds to discard authorized work.

## Publication state before recovery: historical versus live

The audited #345 [rollout record](ip013/global-incidence/rollout.json) reports 2026-10-10 completion for two Worlds/Time Systems, failed 0. It is historical and must be compared with live pointers before any mutation:

| World | Historical revision | Pre-incidence generation | Incidence generation |
| --- | --- | --- | --- |
| `01995c2a-7b00-7000-8000-000000000101` (synthetic) | 62 | `7b3c2fd8da688b17a6a5bd41ac90b97849fadbb4d8654220e4f39b340f4243e3` | `765e6538e6a0bca9c4efe43223c8e6f17b7e4aa28849b33f5329cb26746c2c00` |
| `01a107fb-4018-7fcb-8390-836a40fa91cc` (history) | 56 | `b9c1eee826eea41121fe87cb532902250687381e6daac63dbdb15e23eb102857` | `25ebaa2fffb390c1394a50139d708a9129e6b76255f0615a95690fb2ac04b1af` |

Historical immutable backups are `worlds/<world>/render-rollbacks/global-incidence-20261010.json`. The [fresh live inventory](ip018/publication-before-2026-10-25.json) at 16:01 UTC confirms public SHA `36520cf`, both global-incidence generations above, unchanged source roots/revisions, synthetic r62 with 679 Events/30 Collections and history r56 with 539 Events/7 Collections. It records hashes for Event IDs, temporal extents/constraints, relations and Collections for post-recovery comparison. At that read the public smoke marker reported failed while the GitHub run was skipped; this discrepancy is preserved. Existing backup existence remains unverified through public routes; the recovery must create and read back its own immutable backup.

## Uncertainties and pending verification

- No visibility into unconnected machines or agents; only this session's worktree/remote Git/PR/CI state is verified.
- Fresh live status/pointers are recorded above; backup readback, republished generations and final deployment results remain pending execution evidence, not inferred from October 10 logs.
- New restored coordinates need current golden/parity checks; the old successful extraction is supporting evidence only.
- Actual iPhone 17 Safari/PWA visual acceptance cannot be established by desktop or WebKit emulation.
- P1 engine execution, prefix/replay/convergence checks and later P2/P3/P4 work must be reported separately from P0 cleanup.
