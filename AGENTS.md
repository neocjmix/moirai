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

- The user works primarily from mobile and should not be required to run a local full-stack environment.
- Define each task as a small externally verifiable outcome, preferably a vertical slice.
- State the relevant document IDs, observable behavior, automated checks and deployment route before deep implementation.
- Keep unrelated refactors, dependency upgrades and feature changes in separate commits.
- Do not stop at code generation: self-review the full diff, test, commit, push, deploy and verify when these actions are within the approved task and available authority.
- Do not claim success from a build alone. Verify the deployed commit through the public surface and synthetic smoke test.
- Keep `docs/implementation/CURRENT.md` short and current when implementation status, deployed URLs or the active milestone changes. Do not turn it into an execution log.

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
- Deploy small meaningful checkpoints frequently, with CI gating and a readiness healthcheck.
- Keep Atropos public. Expose only Clotho HTTP/MCP for authenticated operational clients; keep Lachesis application internal. Do not give the worker or PostgreSQL a public application route.
- Reuse the dedicated URDR Railway resources where safe, but do not copy URDR's application architecture or data model.
- For Atropos visual and interaction work, inspect and copy the corresponding URDR UI implementation by default. Preserve its visual identity and behavior unless accepted Moirai documents, an explicit user direction or a documented defect requires a change.
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
- Worker, migration, backup and recovery keep restricted internal paths. Do not add a public Lachesis route or a mandatory hidden tool sequence.

## Data and migrations

- World is the mandatory transaction, revision, export and access scope. Do not normalize it out of service/repository boundaries.
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

## Stop and ask

Stop for user direction when work would:

- change accepted product meaning;
- activate a deferred roadmap feature;
- delete possibly shared or non-URDR infrastructure;
- create meaningful recurring cost or provider lock-in;
- expand credential authority;
- irreversibly delete or transform canonical data;
- choose an unspecified security or publication policy.

Ordinary code failures, test failures and deployment errors are not reasons to hand work back prematurely. Diagnose and recover safely within scope.
