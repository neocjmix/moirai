# Moirai Agent Rules

## Read first

1. Start from `docs/INDEX.md`.
2. Read only the constitution, business requirements and accepted technical specifications relevant to the task.
3. Before implementation work, read `docs/implementation/IS-001-agent-mobile-strategy.md`, `docs/implementation/IP-001-first-product-plan.md` and `docs/implementation/CURRENT.md`.
4. `docs/roadmap/` is future guidance, not current implementation scope. Do not implement roadmap features without approved requirements and a plan.
5. A plan describes sequence and exit conditions; it does not activate a milestone by itself. Work only on the milestone named active in `CURRENT.md` or explicitly requested by the user.

## Source of truth

- Constitution outranks business requirements; business requirements outrank technical specifications.
- Accepted documents do not silently change to match convenient code.
- When code and an accepted document conflict, report the conflict and fix the correct layer explicitly.
- Do not edit accepted product documents unless the task explicitly authorizes the semantic change.

## Execution model

- The user works only from mobile and does not review code. The deployed production URL is their primary way to see development progress; do not require local commands or code review.
- The user's actual device is iPhone 17, using Safari and the installed PWA (confirmed 2026-10-02). Preserve both modes when assessing touch, navigation and lifecycle behavior. Current automated iPhone 14 WebKit emulation is a separate test profile, not real iPhone 17 evidence.
- Actual implementation and verification run in Codex Cloud. Begin each session by reconciling current code, documents, commit/PR/CI and deployed SHA; prior chat claims are handoff context, not evidence.
- Define each task as a small externally verifiable outcome, preferably a vertical slice.
- State the relevant document IDs, observable behavior, automated checks and deployment route before deep implementation.
- Keep unrelated refactors, dependency upgrades and feature changes in separate commits.
- Do not stop at code generation: self-review the full diff, test, commit, push, deploy and verify when these actions are within the approved task and available authority.
- Do not claim success from a build alone. Verify the deployed commit through the public surface and synthetic smoke test.
- Keep `docs/implementation/CURRENT.md` short and current when implementation status, deployed URLs or the active milestone changes. Do not turn it into an execution log.
- Keep dated evidence and superseded plans as history with an explicit disposition. Update active authority and its inbound links rather than rewriting past measurements as present success.

## Connected tools

- When a requested integration such as Moirai Clotho, GitHub or Railway is available in the current conversation, begin with the requested operation. Do not make a separate harmless call merely to confirm that the integration is connected.
- Treat the requested operation itself as the connection check. Request reconnection only after an actual call returns an authentication, authorization or connection error.
- This does not replace task-relevant state verification. Check repository, CI, deployment and production state when the task requires current evidence.
- Follow any platform rule that explicitly requires a preflight call.

## Mobile-first evidence

For a runtime change, hand off:

- outcome;
- public mobile URL;
- commit and deployed build SHA;
- tests and post-deploy smoke result;
- synthetic fixture used;
- known risk or unverified area;
- next smallest step.

Prefer this evidence packet over raw logs or a long file-by-file narrative. Never make line-by-line user review the primary quality gate.

## Public-by-default security

Treat the repository, GitHub checks, test artifacts and user-facing observation surface as public.

- Never commit or print secrets, tokens, passwords, private keys, connection strings or real `.env` contents.
- Never place secrets in prompts, issues, PR text, commit messages, URLs, screenshots, Playwright traces, snapshots or client bundles.
- Use only explicit placeholders in `.env.example`.
- Use synthetic or clearly public data in fixtures, demos and CI.
- Inject credentials from GitHub/Railway secret stores or an OS credential store with the narrowest practical scope.
- Run a secret scanner before push and in CI.
- If exposure is suspected, revoke and rotate first; deleting the visible text is not remediation.
- Public `/health` and `/__status` responses must use allowlisted fields. Do not expose raw logs, stack traces, environment dumps or private topology.

## Verification gates

Run the checks relevant to the change. The default set is:

- format and lint;
- strict typecheck;
- unit tests;
- PostgreSQL integration and migration tests;
- contract tests;
- deterministic projection tests;
- public/private leakage tests;
- production build;
- mobile Playwright flow for affected UI;
- dependency audit and secret scan;
- post-deploy health, status and synthetic smoke tests.

Do not weaken a requirement or delete a meaningful assertion just to make a gate pass. Report any check that could not run.

## Deployment and infrastructure

- Prefer the public cloud integration environment for user verification; local execution remains an agent diagnostic tool.
- Until the production environment is explicitly declared a public service, treat it as the primary development observation surface. Deploy small checkpoints as often as practical so the user can see the current implementation state.
- During that period, a failing check, incomplete slice or unmet exit condition does not by itself block deployment. Keep each deployment attributable to a commit and report its known failures and incomplete behavior plainly; continue fixing forward from the deployed checkpoint.
- A clean tree or all-green CI is not a prerequisite for a reviewable checkpoint. Create an attributable commit for the intended deployable slice without discarding unrelated work. Deploy independently useful runtime improvements throughout sustained tasks, rather than waiting for the whole milestone or documentation closeout.
- The 2026-10-02 user instruction preauthorizes writes, merges, deployments and incident recovery needed for the active performance/transition task. Do not request the same permission again. A broken development deployment is a reason to diagnose, roll back or fix forward, not to wait for user code review.
- Preserve readiness healthchecks and run the relevant CI, smoke and security checks, but use their results as visible implementation evidence rather than a prerequisite for exposing the current work. Never describe a failing or partial deployment as complete.
- Keep Atropos public. Expose only Clotho HTTP/MCP for authenticated operational clients; keep Lachesis application internal. Do not give the worker or PostgreSQL a public application route.
- Reuse the dedicated URDR Railway resources where safe, but do not copy URDR's application architecture or data model.
- For Atropos visual and interaction work, preserve the current authoritative Moirai GraphShell's UI grammar, authored hierarchy, hull/point/label/relation roles, HUD, camera, selection and drawer. URDR is provenance and a reference for missing or regressed behavior, not an instruction to replace evolved Moirai behavior with an older copy.
- Record the URDR source path and commit for non-trivial UI copies, but do not make URDR a runtime dependency or the source of product meaning.
- The URDR repository must remain. Its deployed services, database contents and artifacts do not require preservation.
- Before repurposing or deleting infrastructure, inventory exact targets and confirm they are not shared. Do not delete adjacent workspace resources.
- Rotate URDR-era credentials instead of reusing them.
- Do not acquire a new paid provider or materially expand cost without user approval.
- Do not copy the legacy URDR `railway.toml`; use Railway's current supported infrastructure configuration.

## Service boundary enforcement

- Clotho owns skill, CLI, external HTTP/MCP, authentication and authoring context. Lachesis owns canonical queries, final authorization, invariants and atomic commits.
- Clotho application must not import persistence. Only `apps/clotho-api/src/app.ts` may wire database, Lachesis and readiness/shutdown.
- Lachesis core must not import Clotho application, Fastify, MCP, OIDC or CLI. Internal calls require authenticated actor, World grants, action scope and expiry. Never trust actor fields from request bodies.
- Run architecture checks, transport parity tests and adapter-independent authorization tests for boundary changes. Same-process modules are not OS or credential isolation.
- Worker, migration, backup and recovery keep restricted internal paths. Do not add a public Lachesis route or a mandatory hidden tool sequence. The explicit authoring policy lookup/version contract in TS-004 is required; it is not a hidden receipt workflow.

## Data and migrations

- World is one reality/factual universe and the mandatory Event identity, transaction, revision, export and access scope. Do not normalize it out of service/repository boundaries.
- Use versioned migrations; do not perform untracked manual schema changes.
- Keep canonical writes behind Lachesis and keep projections reproducible.
- Treat Publication artifacts as rebuildable, but canonical PostgreSQL as durable.
- Early synthetic Moirai data may be reset only when the active plan permits it. The permission to discard URDR runtime data does not apply to later real Moirai data.

## Future compatibility without speculative work

- Review `RM-001` when changing publication, identity, storage, access, cache, queue, search or history boundaries.
- Do not equate future Publication permanently with anonymous public access.
- Do not create unscoped global entity access as a standard API.
- Do not bind durable actor identity directly to an OIDC subject or email.
- Do not implement Tenant, ACL, private Publication, E2EE or raw telemetry ingestion now.
- Choose reversible boundaries, not placeholder systems.

## Performance and continuity closeout

- On 2026-10-04 the user accepted the current production experience on iPhone 17 and explicitly ended performance tuning. `docs/implementation/IP-012-mobile-continuity-closeout.md` supersedes the earlier instruction to keep optimizing until all gates pass. Preserve the stabilized baseline and evidence; do not automatically resume tuning solely because the original frame gate remains unmet. New user direction or a concrete regression can reactivate scoped work. A5 and publication backlog are separate; this closeout does not complete or automatically start those features.
- Aim for ordinary mobile vector-map exploration: smooth pan/zoom and hull → ordinary point → small point → hidden transitions, without fetch-induced blanks or identity resets. Google Maps is a qualitative experience reference, not a measured parity claim.
- Preserve product/domain/UI invariants, not incidental architecture. Publication boundaries, caches, APIs, scheduling and rendering internals may change based on evidence; bounded XY/scale prefetch and frontend interpolation/cache are options, not mandatory solutions.
- Separate server latency, request count/waterfall, bytes, decode, geometry/layout/labels, renderer/frame and memory costs; compare cold and warm wide-view many-Collection scenarios. Keep A4's p95 ≤33.4ms/max ≤100ms gates and report real-device/heap limits honestly.
- The 2026-10-04 whole-scene gesture image cache was rejected for flashing/aspect distortion and frame regression. Keep native labels live; do not reintroduce anisotropically stretched glyph snapshots as a continuity fix. WebGL background vectors are an authorized renderer candidate. Report actual Cloud driver/GPU evidence separately from context availability or emulated vendor strings.

## Stop and ask

First apply explicit session authorization, including the task-specific delegation above. Ask only when an unresolved decision falls outside that authorization and work would:

- change accepted product meaning;
- activate a deferred roadmap feature;
- delete possibly shared or non-URDR infrastructure;
- create meaningful recurring cost or provider lock-in;
- expand credential authority;
- irreversibly delete or transform canonical data;
- choose an unspecified security or publication policy.

Ordinary code failures, test failures and deployment errors are not reasons to hand work back prematurely. Diagnose and recover safely within scope.

## IP-011 planning authority

2026-09-28 12:21 KST follow-up: HUD must rank all screen-related Composite candidates and select exactly one when candidates exist, not select only candidates exceeding eligibility/confidence thresholds. Completeness and specificity are relative ranking signals, not exclusion gates. Area/fade are not title eligibility. Existing paint suppression and camera invariants remain.

2026-09-28 A5 feedback override: the user explicitly authorized synthetic corpus mutations directly in the current development World (release data will be reset separately). A5 corpus writes are allowed through the existing v5 policy/transaction boundary, with synthetic labeling and idempotent batches; this is not authorization for a schema migration or A6/M5. HUD topic selection is independent of area/fade eligibility and may duplicate a visible graph label.

Read CON-003, entities/CORE-MODEL, TS-002/004/005/006 and IP-011 for the target model. CURRENT distinguishes accepted contracts, the deployed v5 baseline and deferred work. A4 was closed by explicit user decision on 2026-09-28 with unmet performance gates transferred to `docs/implementation/IP-011-A4-closeout-backlog.md`; this is not a full performance pass. A5 implementation is active by explicit user instruction on 2026-09-28 under `docs/implementation/IP-011-A5-collection-discovery-plan.md` (S0–S7). Code/document changes, tests, commits, push, PR merge and frequent production checkpoints are authorized; report failing checks without blocking otherwise deployable checkpoints. A6/M5, bulk historical input, canonical migration and new paid services remain inactive. Historical IP-003/IP-007 requirements do not restore Canon-specific Narrative ownership. The user authorized IP-011 execution on 2026-09-22 after merging #129, including writes, corrections, deletion, merge and deployment. The latest implementation-start instruction replaces the previous planning-only restriction. Any later authorized implementation follows A1–A6 dependency order and retains rehearsal/backup/validation gates before canonical migration.
