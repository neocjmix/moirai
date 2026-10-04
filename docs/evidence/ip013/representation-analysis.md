# IP-013 R: Composite representation baseline and research policy

Inspected main `4c72666` (PR #323), 2026-10-04 UTC. This is implementation evidence, not an amendment to CON-003, TS-002, TS-005, or TS-010. PR #323 added World lifecycle/selected-World browsing after the IP-013 planning PR #322. Recent rendering commits #318–#320 changed native contour/label reuse and viewport reads; they do not establish a new representation policy. The production code remains the authority for the measured constants below. CURRENT's W/C-in-progress and not-yet-started-history descriptions must be reconciled separately against current deployment and read-only history evidence.

## Actual production behavior

| Decision | Current implementation | Coupling / implication |
| --- | --- | --- |
| Hull vs compact ownership | `compositePointDisplay`: raw screen hull max(X span,Y span) ≤32px enters compact; an existing compact owner remains until >48px | Either axis can retain the hull. Direction/history matters within 32–48px. |
| Hull/point paint blend | `compositeRepresentationDisplay`: smoothstep over 32–48px; point opacity is 1−hull opacity | Paint is continuous and independent of hysteretic label/interaction ownership. Reversing a pinch does not replace identity. |
| Child reveal | `getCompositeChildrenOpacity`: smoothstep of `(min(height/100,1)−.58)/.42` | This uses the **padded screen hull Y height**. Children are hidden through 58px and fully visible at 100px. The exported 220px width parameter is currently ignored (`_minWidthPx`). Exposing it as a working slider would misrepresent the code. |
| Nested/overlapping descendants | Minimum opacity contributed by all represented authored ancestors | A different visible ancestor may continue to suppress a shared child. Contains remains a DAG with multiple parents. |
| Hull padding | `6 + depth*5` screen pixels | Also changes child reveal because children use the expanded hull; raw hull/point switching uses unexpanded support. |
| Large hull paint | Full paint through viewport coverage .35, linearly falls to zero at coverage 1 | Coverage is clipped polygon area, independent of point blend and ancestor opacity. Label/HUD ownership is not identical to hull paint. |
| Density ordinary points | `selectRenderDensity`: normal rank <64; with >64 candidates, previously normal permits <72, previously small requires <56 | This is **rank**, not physical screen separation or a universal zoom level. Selected Event is first, then prepared publication priority and ID. Composites and Events compete together. |
| Density small points | Rank 64…95 normally small, radius scale .35, label opacity 0 | Only compact Composite point paint receives density scale/opacity. Authored hulls keep their separate paint policy. |
| Density outgoing/hidden | Ranks 96…127 fade linearly 1→0, radius .35→.2; visible admission limit128 | World/tile viewport composition changes rank. 5% offscreen buffer admits at most32 additional candidates without consuming visible ranks. |
| Relation admission | At most32 viewport relations whose endpoints have visible representation | GraphShell applies descendant opacity and can substitute a hidden sibling endpoint with a Composite label attachment under far-zoom editorial rules. |
| Editorial zoom buckets | `abs(scaleY)` ≥.6 near, ≥.22 mid, otherwise far | These are Y-only scale bands, separate from screen hull span and density rank. |
| Composite labels | Editorial priority + min(60,round(sqrt(footprint)/3)) −8 per level after depth1; full/short label collision attempts | Legacy editorial fields affect text budget and elision. No editorial values are changed by the Lab. |
| Final semantic labels | Viewport area /28000 clamped to8…32; selected then previously admitted then center-distance/ID, 8px collision spacing, top72/bottom56 exclusions | A further history/viewport-dependent admission layer can suppress a geometrically eligible label. |
| Retained paint | Composite/point exit retention220ms, label exit260ms; Composite point group opacity CSS180ms | Duration is distinct from the screen-space fade interval. Identity remains mounted for exits. |

Source: `apps/atropos-web/src/urdr-port/src/components/{composite-point-display,graph-shell-composite,point-density-display,graph-shell-label-policy,graph-shell-world,composite-frame-paint,graph-shell}.ts(x)`; `apps/atropos-web/src/lib/{v5-render-density,graph-semantic-budget}.ts`.

Publication also bounds candidates before the renderer: each render bucket reserves32 Composites and80 Events within112 non-relations, up to16 relations, then fills remaining capacity through128. The browser's128/64/96 density bands operate on this prepared candidate set, not on every canonical Event. The Lab deliberately receives a complete snapshot and does not simulate tile admission, fetch timing, cache, or geometry availability. These differences must not be mistaken for a production policy regression.

There is no single zoom scalar that explains the current sequence hull → ordinary → small → hidden. X/Y span, padded Y height, viewport coverage, density competition, previous ownership, and label collisions compose. A long thin Composite can keep its hull during X zoom; Y zoom can both reveal children and change editorial text. Showing the numerical inputs and weights is more useful than naming one coefficient a semantic “detail” control.

## Research boundary

`apps/atropos-web/src/labs/layout/representation.ts` is a pure browser-safe screen policy. The research renderer passes screen bounds, complete authored child IDs, explicit Collection visibility, optional polygon viewport coverage and padded child height. `evaluateRepresentationScene` returns hull/ordinary/small/hidden weights, label/child/relation opacity, density rank, compact ownership, and serializable history. It cannot produce layout geometry, change canonical time/identity/contains/membership, call a network endpoint, publish, or move a served pointer.

`REPRESENTATION_PARAMETERS` is the runtime control schema. Toggles cover hull, ordinary point, small point, labels, children and relations. Numeric controls cover the32px compact threshold,16px blend interval,16px compact hysteresis,100px child reveal height/.58 fade start,64 ordinary/96 outgoing/128 hidden ranks with8 rank hysteresis, .35/.2 radius scales, .35 large hull suppression coverage,220ms paint and260ms label transitions. Density ranks require ordinary ≤ small < hidden; invalid presets fail validation rather than silently change values. Hidden is the zero-paint result at the exported threshold, not another ontology state.

History records `{compact, normal}` by Event ID and is exported with the preset. A World/revision, camera, config and history together reproduce directional hysteresis. Evaluating each candidate uses its own history; comparing candidates uses the same immutable input and camera. Input array order does not change evaluation.

The policy defaults match the production pure helpers for raw-span blend/ownership and Y-only child reveal. Research choices are explicitly narrower than full GraphShell behavior:

- It ranks the loaded snapshot by supplied presentation priority or stable Event ID. It does not reproduce prepared tile pruning, selected-ID promotion, or an offscreen buffer budget.
- It keeps authored hierarchy and overlap suppression but does not reproduce editorial point elision, relation endpoint surrogates, context HUD, or GraphShell's full label placement/retention machinery.
- Optional `childScreenHeight` and `viewportCoverage` let the renderer provide production-like padded height and clipped polygon area. Omitting them uses raw bound height and no coverage suppression. A renderer using bounding-box coverage must identify it as an approximation.
- Ordinary/small/hidden weights are density-controlled. Hull weights remain independent of density rank. Display toggles are experimental paint policy, not changes to the immutable snapshot.
- Returned opacities are deterministic target weights. Transition duration is a renderer concern; the evaluator has no clock, timer, or random input.
- Compact labels follow the visible ordinary-point weight and hull labels follow hull weight ×.45. This simplifies GraphShell's retained label owners and prevents a zero-paint Lab point from retaining a standalone label.

No production GraphShell, publication reader, tile admission, or renderer flag was changed to introduce this policy. The research surface imports the module directly; production does not import it.

## Regression evidence

`representation.test.ts` passes8 tests covering bidirectional compact threshold crossings against the actual production helper, independent X/Y spans, child reveal parity, nested/overlapping ancestor suppression, offscreen descendants, density normal/small/outgoing/hidden and rank hysteresis, full history/config JSON roundtrip, input-order invariance, display/Collection visibility toggles without input mutation, zero-width fade boundaries, and malformed preset rejection.

These tests establish representation policy behavior. They do not claim real-device acceptance or pixel identity with the production renderer. Browser interaction, actual historical IDs/revision, and deployment evidence belong to the overall Lab verification report.
