# IP-004 — production-readiness evidence checkpoint

Observed 2026-09-14 UTC. **IP-004 active; M5 inactive.** This packet closes the
Product and measured Scale tracks at the runtime below. It does not close the
whole gate: PR-B's genuine independent-session refinement remains unverified.

## Acceptance decision

| Axis | Decision | Evidence and boundary |
| --- | --- | --- |
| Product | YES | Reader-first Island, Graph Event drawer and Event reading page; same-head mobile CI and actual Revision 5 public navigation. Graph renderer/layout remain the baseline. |
| Semantic E2E | OPEN | Actual Clotho coarse input plus three refinements reached Revisions 2–5 with identity, N:M membership and conflict recovery verified. A new LLM session must still rediscover context and perform the next refinement. |
| Scale | YES within the recorded workload | 100/1k/10k actual application paths and Next/WebKit CI pass fixed budgets. Existing 100k bounded spatial tests remain. This does not claim a full 100k canonical workload or production WAN p95. |

## Runtime and checks

[PR #93](https://github.com/neocjmix/moirai/pull/93) merged as
`c687fe94e751999d2df54d78abe94db188b34fbd`.

- Same-head [PR CI](https://github.com/neocjmix/moirai/actions/runs/34783354536)
  and [three-scale CI](https://github.com/neocjmix/moirai/actions/runs/34783354524): success.
- [Main CI](https://github.com/neocjmix/moirai/actions/runs/34802375906) and
  [post-deploy smoke](https://github.com/neocjmix/moirai/actions/runs/34802541817): success.
  These cover strict types, unit/contract/projection tests, PostgreSQL migrations
  and integration, boundaries, production build, mobile WebKit, audit and secret scan;
  the deployed smoke covers public health/status and the synthetic flow.
- Railway Atropos `ff7de7b3-7a95-4b76-a4eb-bf5e40bf86fc`, Clotho
  `751774db-3794-42ca-8188-29d724b360a7`, worker
  `ed8de969-25c6-4e8d-933a-dc037ab6ace0`: SUCCESS at the same merge SHA.
- Public [`/__status`](https://moirai-production-8ed1.up.railway.app/__status)
  matched the SHA, with health/status/Atropos OK. Direct browser navigation to
  `/health` was blocked by the browser environment; the successful deployed smoke
  is the health endpoint evidence, not that blocked navigation.
- Actual connected Clotho `world_get` confirmed current/target/served Revision 5
  ready for World `01995c2a-7b00-7000-8000-000000000101`. Two Canons, 42 Events
  (33 atomic, nine composite), 133 Relations. This closeout made no canonical writes.

## Product and semantic readback

The [PR-0 baseline](ip-004-pr0-baseline-2026-09-13.md),
[Island](ip-004-pra1-island.md), [Event](ip-004-pra2-event.md), and subsequent
semantic fixes preserve the M4.7 Graph interaction/geometry boundary and PR #77
label hysteresis. The 1k full spatial artifact and full query compatibility
hashes remain unchanged through the measured optimizations. Operational details
remain in secondary disclosures; they do not lead Island search or Event reading.

Actual public browser verification on the SHA above:

1. Graph baseline rendered the existing 황산대첩 and 건국 과정 geometry.
2. Island `찾기` searched `사료비판`; exactly the existing 훈민정음 반포 result
   displayed its matched interpretation Canon and both Event memberships.
3. `그래프에서 보기` opened the Graph Event drawer (`role="dialog"`) with
   the matched Canon, 1446년 범위, the source-critical Narrative and NIKL source.
4. `사건 상세 읽기` opened the stable Event reading page. Both named Canons'
   Narratives and year contexts appeared, with process/creation navigation and
   separate interpretation links. The text distinguishes book completion from
   letter creation and does not invent a recorded ceremony or October 9 date.
5. `그래프로 돌아가기` restored the selected Event drawer and Canon context.

The same-head mobile suite additionally checks failure/retry, empty/partial and
pinned-revision states, focus restoration and route/viewport continuity. Actual
Island 20-record paging was verified on PR #91, whose reader code is unchanged
by the later query/cache slices.

Actual public Revision 5 semantic acceptance was rerun after PR #93:
`IP004_PUBLIC_READBACK_URL=<public Atropos URL> IP004_PUBLIC_READBACK_REVISION=5
pnpm exec vitest run scripts/clotho-semantic-acceptance.test.ts`.
All five tests passed, including the live Publication/graph check of exact
Event/Relation identities, Canon memberships, temporal constraints, Narratives
and public references. It verifies readback of the earlier actual Clotho writes;
it is not a new authoring session. The actual write evidence is
[coarse](ip-004-prb1-coarse.md), [time](ip-004-prb2-time.md),
[motivation](ip-004-prb2-motivation.md), and [Canon/conflict](ip-004-prb2-canon.md).

## Scale and cache evidence

The workload grows the public Revision 5 knowledge patterns at 100/1k/10k scale
without writing synthetic scale data into the production World. It uses actual
Atropos functions/route handlers and the actual Next/WebKit reader. See
[baseline](ip-004-prc1-scale-baseline.md),
[temporal projection](ip-004-prc2-temporal-projection.md),
[spatial projection](ip-004-prc2-spatial.md),
[reader payload](ip-004-prc2-reader-payload.md),
[bounded reads](ip-004-prc2-bounded-query.md), and
[cache contract, budgets and final table](ip-004-prc3-query-cache.md).

The final 10k CI sample passed Graph-ready 3,091 ms and drawer 1,176 ms. Ten-round
warm server measurements passed initial p95 42.61 ms, Event read 5.19 ms and
spatial 219.51 ms. Full bounded query was 810 ms (one sample). Builder cost was
92.7 seconds / peak RSS 2,115,212 KiB; separate read process peak was 1,250,452 KiB.
These stay inside the fixed 8-second Graph / 5-second drawer, 180-second builder
and separate 3 GiB process budgets. Fixture repetition compresses well; the
decoded 10k HTML was still 9,437,265 bytes, not its smaller compressed wire size.

Revision-addressed caches have explicit keys, rebuild paths, LRU/entry/weight
bounds and failure handling. Mutable World/current pointers bypass caching;
tests cover old/new Revisions, pointer advance, missing-object retry and query
scope separation. Cache weight accounting is not an RSS claim. PostgreSQL and
immutable Publication retain their existing authority. No Redis, provider,
replica, paid-tier change or global mutable canonical cache was introduced.

After the semantic readback warmed the actual 42-Event World, three public POST
samples reported the following `Server-Timing` values:

| Path | Application | Physical object reads | External wall time |
| --- | ---: | ---: | ---: |
| Search | 2.14 ms | 0 | 12.64 s |
| Detail | 0.96 ms | 0 | 12.74 s |
| Query | 285.81 ms | 1 (306 bytes) | 13.09 s |

The query's mutable discovery read remains uncached. These are single warm
samples through this environment's WAN/proxy path, not end-user latency or p95.
They demonstrate deployed immutable read reuse without hiding the external delay.

## Remaining action

[IP-004 §3 PR-B scenario 5](../implementation/IP-004-production-readiness-gate.md)
requires a **new LLM session** to rediscover context through allowed Clotho reads
and then refine the World. The current implementation conversation already knows
the fixture identities; continuing it, compacting it or replaying its plans does
not establish session independence. No assertion is waived to close this gate.

Use the [fresh-session handoff](../implementation/IP-004-fresh-session-handoff.md).
After that actual write/publish/readback and current Product/Scale verification,
the next session can record all three axes YES and IP-004 complete. M5 must still
remain inactive until the user's separate entry decision.
