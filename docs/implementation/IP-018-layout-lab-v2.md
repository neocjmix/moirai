# IP-018 — Layout Lab v2: X-force convergence research
Status: active user direction (2026-10-26 KST). Supersedes all pending Layout Lab v1 and IP-017 follow-up execution. Documentation and transition first; runtime work follows a fresh repository audit.

## Immediate stop and disposition
Stop all further implementation, tuning, verification campaigns, promotion and deployment of Lab v1 experiments: TSTL A/B/C, bubble/ribbon, Lanes/Aligned/Anchored, Organic Surface, and earlier X-layout candidates. Mark their unfinished follow-ups cancelled/superseded, not completed. Preserve commits, evidence, fixtures and deployed assets for audit; do not delete blindly. This stop does not authorize cancelling unrelated security/operational work or discarding uncommitted changes. Inventory active branches, PRs, CI, local worktrees and deployed state before changes. Historical claims in CURRENT and IP-013/016/017 remain dated evidence, not permission to resume. PR #337 renderer handoff is separate: inspect and report its state; do not close unrelated work without evidence.

## Operating safety
Do not change canonical data, World/Revision, temporal coordinates, Event identity, served Render pointer, publication generation, production default, or live deployment while preparing v2. The currently deployed global-incidence/1 is a preservation baseline, not an accepted v2 algorithm. No automatic promotion/backfill. The Y-sweep Composite surface is the sole intended geometry baseline for future integration, not an active research subject; audit exact Y-sweep implementation and reuse only after verifying its compatibility. Do not resume Bubble Sets, ribbon, organic-field, padding or topology optimization.

## Objective
Implement a new isolated, reproducible, browser-observable Layout Lab v2 for node X placement only. Preserve authored temporal Y and semantic graph. Begin from a recognized force simulation design (d3-force is a candidate, not mandated), with fixed Y and independently controlled iteration count. Avoid importing legacy-force force laws, step clipping or total-iteration-dependent cooling without explicit evidence and approval.

## Architecture
1. Immutable prepared input with exact World/revision/digest, Event IDs, Y, direct authored relations, Composite containment and Collection membership.
2. Force-model adapter: separately selectable direct-link attraction (CAUSES/PRECEDES/CONTAINS), primitive repulsion scope (all, temporal neighborhood, spatial neighborhood), center policy (global, temporal bands, composite), collision geometry, Composite cohesion (off, normalized all-pairs, virtual hub), optional Collection cohesion and weighting. Do not confuse Composite membership with Collection membership.
3. Simulation engine: deterministic initialization and ordering, fixed Y, evolving X and optional X velocity, configurable damping/cooling as independent parameters; force calculations may use 2D separation while applying X-only displacement. Explain exactly how each force handles fixed Y. Composite membrane/area-area physics is deferred, not a prerequisite.
4. Read-only Lab UI with same frozen snapshot and camera; independent parameter controls, explicit reset/restart, iteration seek/replay, checkpointing, comparison presets, JSON export/import and no publication writes.
5. Diagnostics: per-tick RMS and max X displacement, velocity/kinetic proxy when meaningful, collision violations, relation strain, X spread, elapsed CPU time and reproducibility digest. Stable motion is not sufficient evidence of good geometry.

## Critical iteration contract
For identical input, seed, initialization, parameter values and algorithm version, the state at tick N MUST be byte-identical whether stopped at N or inspected during a longer run. Changing requested total iterations must never change cooling or forces at earlier ticks. Iterations are an observation/control variable, not a schedule length. Show intermediate states. Define a measurable convergence window and report non-convergence or stalled poor-quality equilibria. Do not silently auto-stop when the user requests an exact tick; convergence may be separately annotated.

## Phases and gates
P0 inventory and interruption: reconcile main SHA, open PRs, worktrees, CURRENT, deployment, active agents; classify v1 work and preserve work safely. Document supersession without rewriting history.
P1 isolated deterministic engine and fixtures: direct-force baseline with Y fixed; prove prefix invariance, deterministic replay, invariants and zero canonical writes.
P2 adapter alternatives: introduce force categories independently, with clear semantics, bounded computational complexity and fixtures including shared Events, nested Composite, long spans, dense same-time Events.
P3 UI and measurement: seek/replay, parameter A/B, per-tick metrics and visual comparison on pinned real-history data; measure runtime vs quality and report candidate configurations.
P4 user visual acceptance only: no default promotion or geometry redesign without separate authorization.

## Acceptance and non-goals
Acceptance requires independently reproducible trajectories, Y/identity invariants, meaningful convergence diagnostics, honest performance measurements, and real-history visual comparison. Do not equate passing tests with aesthetic approval. No membrane solver, no new surface rendering algorithm, no production X change, no new publication, no renderer rewrite, no unrelated optimization. Preserve current GraphShell interactions if Lab shares a viewer.
