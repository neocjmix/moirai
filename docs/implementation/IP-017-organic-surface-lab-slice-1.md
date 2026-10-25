# IP-017 — Organic Surface Lab: Slice 1 (visual acceptance only)

> **2026-10-26 KST disposition: 전체 실험 및 후속 실행 종료 — cancelled / superseded by [IP-018](IP-018-layout-lab-v2.md).** 아래 승인·“다음 작업”은 역사 기록이다. 미완료 시각 검수·WebKit 검증·후속 구현·기본값 승격을 완료 처리하거나 재개하지 않는다. Git 이력과 날짜별 evidence는 보존하며 v1 runtime·실험 UI는 제거한다.

Status: **approved experiment scope; implementation not yet verified**. 2026-10-15 KST.
Owner decision: add exactly **one** selectable surface-generation candidate to the existing Moirai Layout Lab. The deliverable is an honest, high-fidelity visual review surface, **not** production adoption, a new X-layout, or a performance project.

## Authority and baseline

Read `AGENTS.md`, `docs/INDEX.md`, `docs/implementation/CURRENT.md`, `docs/implementation/IP-016-tstl-product-lab.md`, and the currently applicable constitutional/BR/technical contracts before touching code. This document is a narrowly scoped implementation experiment; it does not override higher-level semantic contracts or replace IP-016. Respect the actual current code rather than assuming document-era filenames.

Keep existing Y-sweep/contains-hull and Bubble Sets/ribbon experiments intact as visual baselines. Existing experiment X positions are promising but **not accepted**. Use the *same immutable event XY, Composite geometry/anchors, Relation data, and Collection memberships* for side-by-side evaluation; do not adjust positions to flatter the new field. Identify the actual current selected X candidate and freeze it for the comparison. If the baseline cannot be reproduced, report the discrepancy, do not silently substitute another layout.

## Exact purpose

Develop a hierarchical anisotropic implicit-field surface candidate that can be visually judged at near-final boundary quality using real Moirai historical data, with controls to inspect and reproduce its shape.

This slice covers surface generation, independent Composite-overlap padding, and inspection controls **only**. Slow recalculation is acceptable. A rough proxy, rectangles, raw grid cells, thick polyline substitutes or deliberately low-resolution contour are **not** acceptable as final visual evidence.

## Visual geometry contract

- Soft, organic, ribbon-like visual flow without requiring a ribbon topology or a single continuous outline.
- A Collection may branch/rejoin, enclose holes, and comprise disconnected islands. Allow multiple rings with holes; do not artificially join distant islands.
- Distinct Collections may overlap where the underlying membership/Composite semantics call for it; do not turn them into mutually exclusive partitions.
- Event-centered node fields are anisotropic: stronger/longer influence along time Y than across X. Structural Composite depth/level may affect influence footprint; it is **not** a subjective historical importance score.
- Relation-linked events have unusually strong long-range adhesion, even at considerable XY distance. Model connecting influence along the relation's support/path, rather than treating every far pair as automatically adjacent. Prefer strong tendency, not an unconditional topological guarantee. Relations are semantic inputs; do not replace the actual relationship with arbitrary visible straight-line strokes and call that a successful area.
- Preserve existing glyph inclusion, nonmember avoidance, shared-event membership, temporal Y, identity and source data. Report trade-offs honestly if every geometric desire cannot be satisfied simultaneously.
- Judge silhouettes, gradually changing widths, junctions, curvature, hole boundaries and distant connected regions **at final display scale**, not just whether an algorithm executes.

## Critical: Composite nesting / overlap padding is separate from blob radius

Keep two independently adjustable concerns:
1. **Base field shape**: node kernels (X radius, Y radius, level footprint), relation support strength/width and contour threshold decide organic connectivity and topology.
2. **Nesting/overlap padding**: derive required clearance from the existing Composite nesting and overlapping-membership rule, and apply it as a distinct boundary-expansion operation to the base surface. Prefer geometric contour offset or an equivalent distance-field/SDF expansion that can express actual spatial clearance. A changed field threshold alone is **not** constant-distance padding; expanding every blob kernel changes connectivity and hole structure. Do **not** use either as an undocumented substitute for the padding contract.

Inspect and record the current Y-sweep padding rule before mapping it; preserve its *meaning*, not necessarily its implementation. Show **base boundary versus padded boundary** in the Lab and expose padding separately from kernel sizes. Padding can legitimately join islands or close small holes; this must be visible and testable, not silently forbidden. A single global padding value may be inadequate for different nesting depths; demonstrate at least one actual nested/overlapping Composite case.

Do not confuse Composite hierarchical nesting with independently overlapping Collections. Do not enlarge everything indiscriminately or claim exact clearance without verifying the final geometry.

## Lab UX / reproducibility

Add exactly one new option within the existing Lab comparison mechanism; leave all existing candidates, ordinary default, selection and camera behavior unaffected. On real shared-event/nested-Composite data, support:
- current baseline vs new candidate at identical event coordinates and viewport;
- tunable X/Y node kernel radii or ratio, level-dependent footprint, relation strength and width, contour threshold, and independently tunable Composite padding;
- enough boundary smoothing/quality adjustment to judge the intended final appearance;
- base-versus-padded overlay/inspection, including branches, enclosed holes and disconnected components;
- stable parameter export/copy (e.g. compact JSON) to reproduce a screenshot exactly;
- diagnostics for failures or unsupported topology, rather than masking defects.

User can tune and explicitly recompute; instant response is unnecessary. Reuse existing renderer/UI seams unless small targeted additions are necessary. Make final preview contours genuinely smooth and correctly filled (outer rings and holes) at the tested view scale. Visual acceptance is by the user; the agent must not declare the candidate aesthetically accepted.

## Deliberate non-goals — do not implement

No performance benchmark, target FPS, caching, tiling, Worker migration, WebGPU/compute acceleration, GL mesh/polygon production pipeline, runtime pinch-zoom optimization, LOD system, automatic Collection activation, Collection add/delete/toggle handling, layout recalculation, X/Y repositioning, renderer rewrite, publication/backfill/served-pointer mutation, canonical authoring/data-model changes, or production-default promotion.

Do not broaden into an end-to-end dynamic graph architecture. Existing Lab navigation can continue operating as-is; extending its behavior is not part of this slice.

## Implementation sequence

1. Inspect current code paths for X positioning, Y-sweep padding, Bubble Sets/ribbon field and Lab comparison controls. Document the actual reuse boundaries and frozen fixture/view settings.
2. Add **one** isolated implicit-field surface candidate, with topology-complete contour extraction and smooth final display. Mathematical choices (RBF/convolution kernel/contour extraction) are implementation hypotheses, not mandated libraries.
3. Implement and expose padding as an explicit post-base-shape stage; preserve Composite nesting/overlap intent and permit visual comparison of before/after.
4. Add parameter controls and deterministic export, then verify on actual historical shared-event and nested Composite examples plus small constructed branch/hole/island counterexamples.
5. Record visual evidence, repro settings, known defects, and any mismatches with the current Y-sweep rule. Run proportionate relevant regression checks. Stop without promotion or next-slice development.

## Acceptance gate

Slice 1 is complete only when the new candidate can be selected in the existing Lab; existing algorithms and default remain intact; same-layout comparisons are genuine; branches/holes/separate islands/Collection overlaps can be visually inspected; relationship adhesion and vertical anisotropy are observable; nesting padding is **independent of kernel footprint** and before/after effects inspectable; parameters are reproducible; and boundaries are of sufficient quality for final visual critique.

Passing code/tests does **not** equal aesthetic acceptance. If the result remains ugly, keep the baseline, report why and hand off editable parameters/screenshots. Do not solve dissatisfaction by changing X positions, hiding difficult groups, or starting performance and automation work.

## Decision log

Accepted for this experiment: one Lab candidate; fixed XY; relation-sensitive anisotropic organic regions; free topology; independent Composite padding; visual-quality-first.
Open hypotheses: field kernel and blend; route support; threshold; exact offset/SDF implementation; level-to-radius mapping; interpolation/smoothing.
Deferred entirely: speed, dynamic Collection lifecycle, automated activation, GPU pipeline and default promotion.
