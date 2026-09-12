# M4.6-B — one-way Moirai presentation input

`packages/graph-presentation` is a downstream consumer of graph result v3. It is
not imported by contracts, canonical/domain, semantic projections or Publication.
The worker/Atropos wiring is deferred to C–E; B does not replace the mock loader.
Architecture checks enforce this direction across all four upstream packages.

| Moirai input | Presentation candidate | Preserved semantic record |
| --- | --- | --- |
| Atomic Event | point instance per matched Canon | World-level Event, all memberships, attributes and evidence |
| Composite Event | region with explicit direct-child references | original Composite, boundaries, Duration and descendant span |
| virtual Time Event | `t_anchor_` instance in a disjoint namespace | original reference, definition version and lossless coordinate |
| Relation | segment candidate, exact direction/type and scoped endpoints | single World-level Relation, all memberships and evidence |
| Subject, State, Narrative | no independent legacy geometry | full sidecar plus `m46_sidecar_only` diagnostic |
| unplaced/unsupported temporal result | no invented coordinate | original reason/evidence plus `m46_event_unplaced` |
| unavailable Relation endpoint | no fabricated endpoint | full assertion plus `m46_relation_endpoint_unavailable` |

The complete immutable-input v3 result remains the semantic sidecar, including
Revision vector, query budget/truncation, algorithm versions, artifact digests and
diagnostics. IDs encode structured tuples; labels and array position never become
identity. Selecting either Canon instance resolves the same World-owned Event.

## Canon temporal context safeguard

The current v3 composer retains `previous.temporal_position` when a shared Event
appears in another Canon. That field cannot be treated as each Canon's temporal
fact. The presentation input therefore leaves shared instance time unresolved and
emits `m46_context_time_requires_resolution`, preserving all original Relations.
C must independently resolve the requested Canon's Relations before running layout.
It must not copy the first Canon's coordinate or invent a new canonical field.
This is a known composition limitation, not a claim of completed runtime repair.

## Checks

Seven tests cover stable identity and full membership, disjoint virtual identity,
Canon-context time, missing endpoints/children, Revision mismatch, deterministic
instance input and unplaced evidence. Strict package typecheck and architecture
checks pass. Production data and renderer are unchanged in B.

## A checkpoint

[PR #54](https://github.com/neocjmix/moirai/pull/54) merged as
`2427b9b14c448abd0c889e576d05c353eb462b14` after
[PR CI](https://github.com/neocjmix/moirai/actions/runs/34683023863) passed.
[Main CI](https://github.com/neocjmix/moirai/actions/runs/34683157095) and
[post-deploy smoke](https://github.com/neocjmix/moirai/actions/runs/34683255320)
also passed. The PR CI artifact `graph-regression-evidence` records the mobile
baseline, mobile sheet and desktop baseline; mobile baseline was visually inspected.
This closes A, not the Moirai data integration or M4.6 milestone.
