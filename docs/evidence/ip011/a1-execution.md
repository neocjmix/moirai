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

At commit `5f4b920e10952b7d4ed5160d36fead2a5ed117cb`, [CI](https://github.com/neocjmix/moirai/actions/runs/35781457832) and [100/1k/10k scale workflow](https://github.com/neocjmix/moirai/actions/runs/35781457890) are entirely green: format, lint, boundaries, strict types, 287 unit tests, PostgreSQL integration, production build, dependency audit, mobile regressions and secret scan. Two unit tests are explicitly gated. Numeric results are retained in [a1-ci-scale.json](a1-ci-scale.json).

PostgreSQL one-result search returns the same 510 bytes but reads 202 history rows at 100 Events and 2002 at 1000; first-query app time increases from 9.06ms to 18.36ms. There is no application read cache in this path; database buffers were warmed by fixture commits and were not flushed. We do not call these physical-disk-cold results.

Mobile WebKit graph-ready times at 100/1k/10k are 1242/2478/2936ms and drawer times 838/1918/1642ms. Decoded initial HTML is 1.07/8.65/9.53MB (compressed transfer 36/170/175KB). Pan frame p95 is 38/51/32ms and max 242/429/70ms over 120 frames per run. These samples are noisy and non-monotonic; they identify long-frame risk but do not establish a scaling law. No page errors occurred. React component commit attribution remains an A4 diagnosis task if frame gates fail; total browser/layout/DOM evidence is already captured.

No production data mutation has been performed. Deployment verification and the cached Live catalog limitation are recorded in [A2 execution](a2-execution.md). A2–A6 remain authorized and dependency-gated.

## Fixed A4 acceptance budgets

These are targets derived from the above misses, not claims that current v4 meets them. Run on the same CI profile (Ubuntu hosted runner, PostgreSQL 17, local object store, mobile WebKit iPhone 14, no network throttling). Record host/runtime versions. Do not compare laptop and CI latency as equivalent. Separately observe production network timing without substituting it for the repeatable gate.

- At 1k/10k/100k Events, keep the same local viewport, active membership, visible density and neighborhood while adding remote content. Run separate sparse, dense, shared-membership and very large Collection fixtures. Do not use the existing differently-shaped scale fixtures alone as the bounded-cost proof.
- Cold application-cache interactive read: total index plus artifact bytes <=1MiB, object reads <=256, p95 <=500ms. Warm p95 <=100ms. Use 20 cold process samples and 50 warm samples. Per-query read/fold rows must be bounded by the explicit query budget, with zero complete-history replay; bytes/rows for the fixed query must not grow more than 2x from 1k to 100k. Dense overflow returns explicit partial/continuation rather than reading everything.
- Initial decoded HTML <=1MiB; subsequent graph responses <=1MiB; no whole-World graph embedded in HTML/client state. Mobile graph-ready <=3000ms and drawer <=1000ms at p95 over 20 navigations, with zero page errors. Frame p95 <=33.4ms and max <=100ms over at least 600 post-ready frames per pan, zoom and Collection toggle. Account for React/layout attribution when exceeded; a small SVG node count alone is insufficient.
- Cold/warm authoring search and Collection discovery: same 500/100ms p95 gates, bounded candidate/row/index bytes and explicit continuation. Fix candidate cap at 500 per discovery request and page output at 20; no manual importance taxonomy. Search must not replay all Change Operations to return one match.
- Offline Publication worker is measured separately from interactive reads. Preserve the current 10k synthetic <=180s and <=3GiB regression gate. A4 must report 100k build CPU/RSS/output size, cancellation and restart behavior; a full rebuild may scale with World size and must never run inside an interactive request.

A4 cannot pass by raising these budgets or by reporting warm-only latency. If hardware variance makes a gate unreliable, retain raw samples and justify a profile change explicitly; do not silently weaken it.
