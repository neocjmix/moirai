# IP-018 — actual GraphShell iteration overlay, 2026-10-26 UTC

## User correction and scope

The user rejected the standalone synthetic Lab as the review interface. The new d3 engine remains; the standalone drawing is removed. `/labs/layout-v2` redirects into the actual `/graph/v5` viewer with opt-in `layoutLab=force-v2`. The same GraphShell camera, selection, Event drawer, Collection controls, hierarchy, labels and time axis are used. The overlay provides exact tick, live range input, play/pause, reset, force settings and JSON replay. “현재 운영” restores the existing published baseline; v2 is not promoted.

P0 is not repeated. Canonical data, Event identity, authored times, r56/r62 and Render publication pointers are outside this correction's write scope. No backfill is requested.

## Implementation

- Bounded immutable public World snapshot loader: verified served root, revision, authenticated index/document hashes, public-read capability only, bounded process cache with visibility recheck. A changed revision is rejected. The initial baseline is computed once; iteration controls never refetch input.
- Real r56 fixture: 539 Events, 109 Composite regions and 430 physical point/segment nodes. Fixed initial X comes from the restored baseline; Y is fixed to the original temporal coordinate. Only directly authored relations with two physical endpoints become springs. Composite/Collection cohesion and type-specific controls remain later P2 work.
- Pure engine limit expanded to 2,000 nodes/16,000 links, with its original deterministic dynamics unchanged. Tick range remains 0–10,000. No target-dependent cooling or convergence stop is introduced.
- Worker advances in short batches and yields to new requests. Latest slider target supersedes older requests. Each frame is immutable; session/request identities prevent stale responses or old paint acknowledgements. Requested and committed ticks are separate.
- The semantic adapter derives existing Y-sweep ink from moved descendants. Tick-0 serialized hulls, depth, padding, bounds and relations match production compiler output. No new surface or v1 solver is imported.
- JSON import requires the same normalized World/revision/input, complete configuration, exact replayed state and checksum. Large World replay is asynchronous; a mismatched or tampered result is rejected.
- The normal viewer import closure cannot execute the server baseline compiler or experiment adapter. Only the snapshot route and Worker may import their exact research modules. Published Render remains the default.

## Verification and deployment

PR #370 deployed as `addf7871e879c276ee832074b4d38fc3b604774e` on all three Railway services. Production-build local Chromium covered the overlay on desktop/mobile (4 checks), then 15 affected mobile regressions passed against the exact non-Render CI fixture. Main CI `40339255998` passed 792 unit tests (2 skipped), 49 PostgreSQL integration tests, 68 mobile WebKit tests (1 skipped), 11 Render continuity tests, format/lint/typecheck/build/boundaries and secret scan. Its quality job failed at the existing dependency audit: critical 2 / high 7.

The first public cold snapshot exceeded the 120-second observation limit. After input loaded, actual r56 desktop/mobile Chromium passed the full replay/geometry/filter/selection suite in 38.1s /32.6s. Public WebKit reached iteration replay but its old stop test sampled before the final asynchronous paint (365→667); it failed. The same smoke run `40340259209` passed readiness, all four A3 mobile navigation cases and authenticated read/policy/validation with no persisted mutation. These failures are not recorded as success.

PR #371 (`c8d4ecce6fc6ef08beafcf4dce4c0fadd02938bf`) fixes both observed boundaries: authenticated index/payload reads share a 24-request cap and preserve branch order; the UI exposes pending paint until the latest command's exact frame is drawn. The stop assertion now waits for this acknowledgement, then compares the complete stationary state. Same-tick commands acknowledge without changing physics. All 27 focused follow-up tests and production build passed. Superseded PR CI/scale runs were cancelled after merge; main CI and public smoke remain the authority.

The c8d4ecc runtime passed the complete public real-history Chromium suite on desktop/mobile and postdeploy run `40342804168`: readiness, four live A3 WebKit cases, the new live WebKit Lab overlay and authenticated read/policy/validation all succeeded. The canonical/Render probe remained unchanged. c8d4ecc's first main-CI mobile run failed the pre-existing A5 escape test on a WebKit cancelled-request/access-control console message; the mobile job was rerun without changing or weakening that assertion. The dependency audit remains failed.

Cold input still exceeded120s after the first parallelization; warm input was1.204s and the entire JSON snapshot was identical. This is an unresolved measurement at that SHA, not an improvement claim. The final [PR #372](https://github.com/neocjmix/moirai/pull/372) prunes authenticated spatial/render index ranges, uses64 steady readers instead of batch barriers, and adds only aggregate phase counters/times plus Server-Timing. Tests prove4096 unrelated spatial objects are not read, the input digest stays identical, a blocked GET does not stall unrelated reads, and the cap is respected. Fifteen targeted tests, strict typecheck, lint and production build passed. Its PR description owns the final deployment SHA and cold-load observation; no further layout/physics/surface changes are included.

Canonical pointer bytes and complete Render manifest hashes for r56/r62 remained identical in the before/after public probe. No publication or historical write occurred. See [pointer and Render observations](ip018/graph-overlay-publication-2026-10-26.json), [public desktop](ip018/graph-overlay-desktop-chromium-2026-10-26.png) and [public mobile](ip018/graph-overlay-mobile-chromium-2026-10-26.png).

Data/adapter tests cover fixed Y/identity, production tick-0 parity, rewind prefix, immutable-root reads, tampering/withdrawal, and malformed baseline rejection. Engine and import tests cover deterministic replay and untrusted JSON. Browser tests exercise actual GraphShell geometry, live slider inputs before pointer release, 100→1000→100 exact replay, camera and selected Event, Collection-off/on, baseline switching, and read-only publication pointers.

Actual iPhone 17 Safari/PWA user acceptance remains separate from automated browser emulation. This slice does not complete all P2 cohesion options, full saved A/B comparison, P4 quality acceptance, or default promotion.
