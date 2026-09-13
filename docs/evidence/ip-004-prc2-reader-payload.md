# IP-004 PR-C2c — reader payload and large-World browser gate

Status: local implementation verified; three-scale browser CI and production
verification pending. IP-004 active, M5 inactive.

The 1k/10k measurements exposed megabytes of initial data and up to 1,000
reader cards rendered at once. Inspection found that the client consumed only
`result.completeness` from the full query result; the Graph renderer uses its
existing bounded spatial loader and separate presentation props.

Send the completeness scalar across the server/client boundary. Keep the full
query on the server for no-JavaScript fallback and the separate public query
API. Canonical data, Graph budgets and renderer are unchanged. Reader lists now
page over 20 cards at a time, retaining all loaded records; scope, tab, search
and server-search page changes reset the visible page. Labels explicitly count
loaded records, not the entire World. Event membership and reader navigation
are preserved.

At 1k, the same local initial data measurement fell from 5,284,063 to 1,982,300
bytes (62.5% reduction). Warm serialization/parse p95 was 6.50/4.03 ms in the
new ten-sample run, compared with 23.93/11.40 ms in PR-C2a. These are serialized
data measurements, not yet actual HTML/browser timings. Server composition and
existing reader lists remain measured follow-ups; this does not claim Scale YES.

The opt-in workload can retain generated immutable artifacts and reuse them in
a separate read-only process. Reused directories are never deleted by the test.
This avoids rebuilding the same large fixture for each query/browser experiment.

`playwright.ip004.config.ts` reuses the existing production-build/mobile WebKit
setup with the generated synthetic World. The dedicated workflow runs 100,
1,000 and 10,000 Event cases when these IP-004 reader gate files change. It checks
actual Next routes, with no spatial/API interception: Graph readiness, at most
20 cards, next-page identities, Narrative-only search, Canon-aware Graph Event
drawer and stable Event reading page. HTML bytes, Navigation Timing, drawer
latency and page errors are saved as evidence. This synthetic browser check is
separate from the actual connected Clotho semantic E2E.

React review: no unused result enters the client context; props and hook
dependencies follow the consumed completeness scalar; page changes remain user
actions; records retain stable identity keys; previous/next controls have clear
labels and disabled boundaries. Existing source/pan/zoom/selection behavior and
mobile regression checks remain required.

Remaining: verify three-scale browser evidence and deployed reader; reduce the
measured full-query Event-document reads and bound retained cache memory. The
genuine new LLM-session refinement remains open. No new provider or cache
infrastructure was introduced.
