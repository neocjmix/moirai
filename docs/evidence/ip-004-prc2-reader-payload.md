# IP-004 PR-C2c — reader payload and large-World browser gate

Status: PR #91 merged and deployed as `4cc5e54ebd8ef1e47d811ab6f4d5c495c1d021e8`.
All three Railway services SUCCESS. PR CI `34782393469`, three-scale WebKit
workflow `34782393447` and main CI `34782620473` passed. IP-004 active, M5 inactive.

PR #90 deployed as `236dbc04d5dfdbdc75987b6c76a9e54b4735def2`; final PR CI
`34780504340`, main CI `34780771685` succeeded. All three Railway services were
SUCCESS at this SHA and the public health/status identified it. Reloaded public
Graph retained the baseline chart and interaction controls. Its post-deploy
smoke is tracked as `34780889158`.

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
The first browser workflow passed at 100 and 1k. At 10k, canonical generation
took 61.4 seconds on CI and starved Vitest's RPC despite yielding between phases.
The test reached readback but exited nonzero; it is not accepted evidence.
`ip004-build-scale-artifacts.ts` now builds in a separate process so the runner
remains responsive without ignoring errors or extending an assertion timeout.
Builder and Atropos-read peak RSS are reported independently, matching their
separate production service roles. Browser measurements are also printed in CI
logs for review, in addition to downloadable JSON evidence.

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

## Stable checkpoint and browser measurements

The initial traced 10k runs failed the 120-second whole-test limit. Phase logging
showed Graph ready in 4.0 seconds, but subsequent browser commands took tens of
seconds. Moving paging controls above the list improved their reachability but
did not by itself make the traced run pass. Separating per-action DOM/screenshot
trace capture from the scale timing run removed that delay. Functional assertions
remain intact; failure screenshots/context and phase timings remain enabled.
The normal mobile regression suite continues to retain traces.

Final same-head WebKit evidence (one sample per scale, not p95):

| Events | Graph ready | Drawer | Encoded HTML bytes | Decoded HTML bytes |
| --- | ---: | ---: | ---: | ---: |
| 100 | 1,951 ms | 433 ms | 34,274 | 1,056,902 |
| 1,000 | 2,336 ms | 472 ms | 162,749 | 8,557,744 |
| 10,000 | 3,748 ms | 2,163 ms | 167,567 | 9,437,265 |

All scales passed visible paging controls, 20-card pages, next-page identity
change, Narrative-only search, Canon-aware drawer, stable reading page and no
page errors. Compression reduces transferred bytes but not decoded HTML work;
these columns deliberately remain separate. The 10k flow reached next-page
content at 8.3 seconds and completed its entire reader journey in about 14 seconds.

Public Revision 5 verification on the deployed SHA: Graph baseline rendered;
Island showed loaded records 1–20 then 21–40 with changed Event identities;
`사료비판` found the existing 훈민정음 반포 Event in the second Canon; its drawer
preserved the 1446 range, qualified narrative and public source link. The same
Event reading page remains linked. No canonical write was made for this check.

Full-query read volume and cache resource accounting continue in PR-C2d/PR-C3;
the genuine independent-session semantic refinement remains open. This slice
introduced no new provider or cache infrastructure.
