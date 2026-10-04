# World lifecycle and discovery — local review candidate

Scope authorized 2026-10-02: World creation, recoverable deletion/restoration, authenticated operator access across Worlds, and Atropos World/Event selection. Related authority: CON-003, JRN-001, BR-001/003/005/007, TS-004/006, RM-001. This slice does not activate person-specific modelling or historical imports.

## Observable behavior

- `world.create` accepts the v5 ChangePlan with `expected_revision: 0` and a `create world` operation whose explicit `entity_id` equals `world_id`. Events, Narratives, Time Systems and Collections may be included atomically. `change.validate` uses the identical transaction and rolls back new Worlds too. `change.commit` supports the same creation plan.
- Obtain the current authoring policy for the prospective World ID before creation. Authorization is checked even though the World does not yet exist. UUIDs/client references remain World scoped.
- `world.delete` is **recoverable withdrawal**, not physical erasure. It accepts `contract_version`, `world_id`, `change_set_id`, `expected_revision`, `intent`, `policy_version`, `policy_digest`. `world.restore` has the same contract. Exact retries are idempotent; a new action requires the latest revision. Content rows, IDs and history remain intact. `world.get/list` support `include_withdrawn: true` for recovery.
- The worker publishes an empty tombstone revision with `withdrawn: true`. Current v5 readers reject it; the selector excludes it. Restore builds a new active revision from unchanged canonical identities. Historical immutable artifacts remain retained; this is not a privacy purge. Publication remains asynchronous and its served revision must be checked.
- `/worlds` selects from complete active public Worlds. The existing HUD World name opens this selector. Normal links enter a fresh World URL without old camera, Event or Collection selection. Each graph root is keyed by World and existing World/revision-scoped caches are retained.
- `/worlds/:worldId/events` provides bounded 128-Event pages and selected Narrative reading, including Events without Collection membership or a Time System. Empty Worlds have a usable landing page. Older publications without the new Event index explicitly offer graph navigation until the next publication.

## Publication and live activation remain separate

This checkout is based on main `d0f935d2ec9d4ae27fced1e5793b173aff09453e`, including IP-013 and the accepted performance baseline. The 2026-10-04 follow-up authorizes merge after review and passing PR CI, followed by normal deployment verification. No existing live World is created, withdrawn, restored or edited by this implementation phase.

The proposed access change is exactly: add `"all_worlds": true` to the existing Clotho `CLOTHO_OIDC_JSON` JSON, preserving its issuer, JWKS URL, MCP audience, operator subject and internal actor ID. The variable is consumed by apps/clotho-api/src/config.ts. It expands only that configured, authenticated operator to read/write all current and future Worlds, including create/withdraw/restore, subject to token `world:read` / `world:write` scopes and expiry. Token claims cannot grant this flag. Omission or false retains the existing one-World scope. No anonymous writes, Auth0 user changes, token lifetime changes, new credentials or public database routes.

Per-action approval required before live activation: identify the existing Clotho service/environment and operator mapping, approve the all-World scope, then change this one config flag. Roll back by removing it. Separately approve deployment of this PR and any disposable production smoke World. Never delete an existing World as a smoke test. Historical pilot input remains a later stage.

No schema migration is needed: existing World withdrawal columns, revision/history and outbox tables carry the changes. New v5 Worlds have a revision-one create baseline; existing migrated Worlds continue replaying from their migration baseline.

## Verification — 2026-10-02, local Mac

- Separate checkout; integrated main `0069c09` with no conflicts, preserving concurrent HUD memoization and render/GraphShell changes.
- Strict root and Atropos TypeScript checks, ESLint, changed-file Prettier, architecture boundary check and all workspace production builds pass.
- PostgreSQL 16 disposable cluster bound to loopback: full integration/migration suite **12 files / 48 tests passed**. New vertical test passes again after final validation hardening. It covers rollback-only validation, create/replay, two-World isolation, Event/Narrative creation without Collection or time axis, withdrawal, retained rows, rejected writes while withdrawn, publication tombstone, same-ID restore and scoped discovery.
- Full unit/contract suite: **597 passed, 2 skipped, 1 failed** (142 files). The remaining `composite-label-density-order.test.ts` golden hash mismatch reproduces identically on a pristine archive of `0069c09`: expected `619d6f9f…`, actual `0659a969…`. This patch does not alter its source or expected value. All lifecycle-related tests pass.
- Dependency audit at high threshold passes; **9 pre-existing moderate vulnerabilities** remain. No dependency changes included.
- Browser verification against the production build and local synthetic publication at 390×844 and 1440×900: World list; new World's Event list; selected Narrative; switch to another empty World without stale Event content; empty World graph landing; existing graph HUD → World selector. Mobile empty landing has scrollWidth=innerWidth=390. No real-device or automated WebKit E2E claim. Current live Atropos was inspected read-only before editing and had a plain World title with only a Collection selector.
- No historical pilot input, live permission changes, real World mutations, merge or deployment performed. Post-deploy smoke remains pending approval.


## Verification — 2026-10-04, latest main checkpoint

The October 2 results above are historical. Rebased without conflicts to `d0f935d`; no renderer/layout tuning or historical input.

- Full local integration/migration suite: **12 files, 49 tests passed**. Added new-World Gregorian TimeSystem ownership and returned client-ref identity, sourced dated Event with membership zero, validate/commit/readback, upload failure preserving old served pointer and successful retry. Withdrawn Worlds are excluded from deferred Render scheduling, including a pointer race guard.
- Workspace strict typecheck, production build, ESLint, full format check and service dependency boundaries pass. Dependency audit has no high/critical findings; 9 existing moderate advisories remain.
- Full local unit/contract suite: **610 passed, 2 skipped, 1 failed**. The same existing `composite-label-density-order` golden mismatch reproduces on a fresh pristine `d0f935d` archive on this Mac. No assertion or renderer implementation changed. PR Linux CI is required before merge; local unit is not reported as fully green.
- New WebKit browser acceptance: **3 tests passed**, 390×844 and 1440×900. World selector → no-TimeSystem landing → Event → Narrative/source → reload → other empty World, no stale content or overflow. Explicit withdrawn URLs never fall back to another World; pending artifacts, unknown World and malformed ID have distinct states. Next streams an HTTP 200 shell before its async malformed-ID 404 boundary; the test asserts the rendered 404 page. This is emulation, not iPhone 17 hardware evidence.
- `authoring.schema.get` exposes complete exact JSON input schemas even when a connector truncates `operations` to `Array<unknown>`; HTTP/MCP parity is tested. CLI continues to expose the same shared schemas.
- A new World with no uploaded artifact yet is not publicly discoverable; once uploads begin, a missing complete pointer is shown as publication pending. Complete active pointers alone populate selectable Worlds. Old publications retain graph fallback until rebuilt with the Event catalog.

Exact activation target: Railway project **Moirai** (`67754889-5b80-4503-b368-95e7d0768d84`), environment **production** (`990773c0-31d9-435c-8d36-21c15352fe51`), Clotho service **desirable-vitality** (`fe402236-354f-4088-8182-aaf5f7b34a99`). Change only the existing OIDC JSON flag described above after exact approval. One API replica may briefly reconnect during redeploy. No worker/database restart is needed for this config change. Existing unrelated Railway staged changes must not be accepted. The plugin exposes variable names only; the operator's human-readable identity could not be resolved through that read-only interface.

Proposed disposable production verification World: `world-lifecycle-smoke-20261004` / “World lifecycle verification 2026-10-04”; preserve it through recoverable withdrawal after smoke, never purge or mutate the existing World. Production verification and permission activation are not claimed by these local results.
