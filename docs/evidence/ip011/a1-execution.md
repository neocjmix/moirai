# IP-011 A1 execution evidence

2026-09-22; baseline main `814a5779147c8f458693029326e57885984f62c4` (PR #129). Railway API/web/worker all SUCCESS at that commit. Live historical World remains revision 30. User authorized IP execution, including writes/deletes/merge/deploy; backup and rehearsal gates remain required.

## Policy delivery

`packages/contracts/src/authoring-policy.ts` is the deployed transition policy artifact, with explicit v4 contract, version, SHA-256 of the complete document and completeness marker. `authoring.policy.get` uses the same authenticated, World-scoped Clotho/Lachesis path for HTTP, MCP and the CLI HTTP client. It does not reconstruct the World. The MCP inline instruction and repo skill direct writers to retrieve it; discovery stays under the existing 32KB budget.

This is a v4 transition, not v5 enforcement. The strict v4 write payload is unchanged. A1 tests the v5 missing/stale/digest rejection and authorized exact-retry ordering in isolation. Integration into the locked canonical transaction, durable policy provenance and old-writer rejection remain A2/A3. A digest is evidence of the submitted policy identity, not proof that an agent understood it.

## Measurements and interpretation

[a1-local-scale.json](a1-local-scale.json) contains reproducible 1k/10k synthetic measurements through the existing actual Publication and spatial reader. They use local filesystem storage, a separate worker process and ten warm repetitions; they are not production network SLOs.

At 10k Events, canonical Publication build takes 41.58s and spatial build 33.21s. Initial cold read takes 967ms and reads 59.3MB; cold viewport takes 726ms and reads 40.1MB to return 29KB. Warm viewport p95 is 408.5ms even with zero artifact I/O. The reader peaks at about 1.66GiB RSS; builder about 1.90GiB. These distinguish full-World reconstruction/CPU from network or cache misses. A4 must bound upstream work as well as response size.

`profileCanonicalRead` separates driver query time/count, operation-history rows, fold CPU and wall time. Counters are request-local numeric values only; SQL, identities and bodies are never retained. The disposable PostgreSQL integration test compares a one-result search across 100 and 1000 Events, with first-query and five-repeat samples. It deliberately captures the current unbounded history replay rather than claiming a new bounded implementation.

The scale workflow also measures the actual mobile WebKit reader at 100/1k/10k, and samples 120 animation frames around a pan after graph readiness. It records DOM size and frame p95/max separately from initial page and drawer latency. These are observations, not yet a React component-level profile or proof that all pan/zoom paths are bounded.

## Gate status

Local unit suite: 286 passed before the additional CLI parity test; focused policy/profile/parity tests: 7 passed after that addition. HTTP/MCP policy parity, credential/World expiry rejection, stale/digest guard and exact-retry prototype pass. No production data mutation has been performed.

PostgreSQL and mobile scale evidence are pending CI. Local PostgreSQL installation is unavailable in this runtime; the existing disposable PostgreSQL CI service is the execution environment. Fixed A4 acceptance budgets will be recorded after those samples. A1 is not complete until measurement, budget and deployed policy verification are recorded. A2–A6 remain authorized pending the dependency gates, not completed by this checkpoint.
