# IP-004 PR-B3 — independent-session discovery and refinement

## Discovery recorded before prior authoring evidence

This is the fresh Work session requested by the user through
`IP-004-fresh-session-handoff.md`. It is separate from the earlier implementation
conversation, not a compaction or a fixture replay. The session received repository
rules, the handoff's World ID and natural-language task. Earlier authoring fixture
files and PR-B evidence were not read before this discovery record. `CURRENT.md`
was read as required for the active scope; entity identities below came from live
Clotho responses, not from its links to earlier evidence.

- Repository baseline: `585852e35400f239cc0490956c3a5b2a33e9f825` (PR #94).
- Open PRs: none. Baseline CI `34803398308` and smoke `34803539882`: success.
- Railway Atropos, Clotho and worker: SUCCESS at the same SHA.
- Live `world.list`: World `01995c2a-7b00-7000-8000-000000000101`,
  `early-joseon`, “조선 전기 — 건국에서 세조까지”, current Revision 5.
- Live `canon.list(at_revision=5)`: `chronicle`
  (`019f5b00-0000-7000-8000-000000000002`) and
  `hunminjeongeum-record-and-interpretation`
  (`019f60ab-0000-7000-8000-000000000401`). Both lists were untruncated.
- Live `event.search(query=훈민정음, at_revision=5, limit=12)` in each Canon
  independently returned the same three identities, each with both memberships:

| Event | ID | Meaning discovered |
| --- | --- | --- |
| 훈민정음 반포 | `019f5b00-0000-7000-8000-000000000112` | Existing 1446 completion record; title does not establish a ceremony or exact date. |
| 훈민정음 창제와 해설서 완성 | `019f60ab-0000-7000-8000-000000000101` | Composite process containing creation and completion. |
| 훈민정음 문자 창제 | `019f60ab-0000-7000-8000-000000000102` | Distinct earlier letter-creation record; uncertain Gregorian range. |

Live `context.slice` used both Canon IDs and these three discovered seeds at
Revision 5, depth 1, max 15 Events / 40 Relations / 16,000 narrative characters.
It returned 4 Events, 12 Relations and 997 narrative characters with no truncation
or warnings, and an explicit depth boundary. This bounded neighborhood is not
claimed to be the entire World. All returned Narratives were complete.

The existing context already includes 28 letters, the creation purpose, uncertain
dates, containment/precedence/start/end/enables links and a Canon-specific caution
about the word “반포”. The interpretation Canon shares identities rather than
duplicating events; its interpretation is not an official or superior truth.
The proposed useful addition is an explanation of the contents of the completed
해례. It belongs to the existing completion Event as authored prose, not as new
Events for each chapter, a new Canon, or a mutation of the creation Event.

## Actual source, validation and commit

The public [우리역사넷 훈민정음 article, section 5](https://contents.history.go.kr/mobile/kc/view.do?code=kc_age_30&levelId=kc_r300900)
was opened and checked. It describes 제자해, 초성해, 중성해, 종성해, 합자해 and
용자례. The new annotation paraphrases this useful detail; it does not create
chapter-as-Event identities, assign chapter dates or assert a recorded ceremony.
The full completion Event context was read again at Revision 5 with complete
Narratives; this information was absent there.

The [actual submitted plan](../implementation/fixtures/ip004-semantic/05-fresh-session-haerye.change-plan.json)
contains one `create narrative` operation, attached to the existing completion
Event in the records-and-interpretation Canon. This matches that Canon's declared
purpose. A Narrative has one Canon context; Event membership in both Canons does
not implicitly copy the new text into the chronicle. Source facts and editorial
attachment are distinguished in origin references. No M5 update/lifecycle
implementation is required for this additive refinement.

Actual connected Clotho results:

| Call | Result |
| --- | --- |
| `change.validate` | `valid=true`, source Revision 5, no errors or warnings, only the new Narrative ID affected |
| Plan digest | `a066f358bd70d7bd95e46998d41b46460d5d3d734e032c0ff39fb9987e3c079b` |
| `change.commit` | Change Set `019f62b7-6aa0-7000-8000-000000000001`, current/target Revision 6, served 5 at commit, `idempotent_replay=false`, no warnings |
| Subsequent `world.get` | current/target/served Revision 6, `projectionStatus=ready`, two Canons |
| New Narrative | `019f62b7-6aa0-7000-8000-000000000002`, “해례에는 무엇이 담겼나” |

Numeric contract `4` succeeded through the actual connector. Its advertised
`"0.3.0"` metadata remains stale, as previously recorded; authentication and
server validation were not bypassed. This session needed one accepted connection
authentication retry before discovery, but no per-write reconfirmation.

The same bounded `context.slice` was repeated at Revision 6. Deep equality of
Events, Relations and all previous Narratives passed; exactly one new complete
Narrative appeared. The response was untruncated. No revision conflict occurred
during this write; the prior actual Revision 4→5 conflict/replan evidence remains
separate and is not attributed to this session.

## Automated public readback and regression

The existing acceptance harness now includes stage 5. Its new regression checks
full Event, Relation, Canon and membership preservation, all previous Narratives,
the new Narrative attachment/source, and old/new Publication separation.

Actual command (read-only):

```sh
IP004_PUBLIC_READBACK_URL=https://moirai-production-8ed1.up.railway.app \
IP004_PUBLIC_READBACK_REVISION=6 \
./node_modules/.bin/vitest run scripts/clotho-semantic-acceptance.test.ts
```

All six tests passed. The live test checked the actual World, both Canon
documents, both temporal artifacts, Graph query identity sets and all affected
Event documents against the authored fixture. Event 42 / Relation 133 / Canon 2
were preserved. Both Canon memberships and prior Narrative bodies remained;
the new public Narrative and source matched exactly. Live readback took 91.4
seconds through this environment's network path; this is not a user latency SLO.

Ten additional bounded-cache, Publication and public-readback tests passed;
root strict typecheck and the changed test's ESLint check passed. The local
runtime's pnpm wrapper stopped on esbuild lifecycle-script approval after package
linking. The already-installed test/format binaries worked without enabling that
script or changing repository build policy; its generated workspace marker was
removed. CI remains the full build/mobile/security gate.

## Product and Scale recheck

Public `/__status` and `/status-public` both reported baseline SHA `585852e...`,
all public surfaces OK and successful smoke `34803539882`.

The scale workflow `34783354524` was reread: all three jobs (100, 1,000 and 10,000)
completed successfully. Its PR head `2a1db834e44683934bfccf0fd309a562805ec7ec`
and merge `c687fe94e751999d2df54d78abe94db188b34fbd` share tree
`a39cc1487569808fe4b7f6ae366e339cded4aba1`; changes from that merge to the current
baseline are documentation only. The later drawer loading correction below
requires a new same-head mobile and three-scale run before final closeout. The
100k-spatial-only / no-production-WAN-p95 limits remain unchanged.

The actual public browser round trip passed at Revision 6:

1. A historical Revision 5 URL continued to return no match for `용자례` after
   the write; reloading the pinned URL did not silently substitute Revision 6.
2. Fresh `/graph` selected Revision 6. Island `찾기` → `용자례` returned exactly
   the existing completion Event, with the interpretation Canon as the match
   and both Canon memberships displayed.
3. `그래프에서 보기` loaded that Event's drawer. Its previous source-critical
   note, the new 해례 explanation, both public references and 1446년 범위 appeared
   in the interpretation context.
4. `사건 상세 읽기` showed the unchanged chronicle Narrative and two separately
   labeled interpretation Narratives. Both Canon memberships, year bounds and
   links to the containing process and earlier letter-creation Event remained.
5. `그래프로 돌아가기` restored the exact return URL, selected Event, Canon,
   Revision, viewport and `readerFind=용자례`; the loaded drawer kept the new note.
6. The direct [Revision 6 reading URL](https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101/events/019f5b00-0000-7000-8000-000000000112?revision=6)
   was opened independently and displayed “해례에는 무엇이 담겼나”.

### Loading defect found during acceptance

Before the detail response arrived, the copied Graph shell displayed its fallback
selection ID and empty legacy metadata rows. It resolved to the correct knowledge,
but treating pending fields as “없음” is misleading under PR-A's loading criterion.
The correction keeps the existing drawer, geometry and interaction, uses loading
copy when no real title is known, treats the initial idle detail state as pending,
and renders metadata only after successful loading. The existing mobile
failure/retry test now holds the first detail request and asserts a loading status,
no raw Event ID, no premature metadata, then the usual error/retry and loaded table.
The scale workflow also watches this copied drawer file so the actual reader path
is checked at all three sizes before merging. No ontology, data model, runtime
provider or M5 scope is added.

## Final result

PR #95 merged as `b90d06f4ab0e876102f05285d89aaa664765f2fc`. PR CI
`34810897021`, three-scale CI `34810897061`, main CI `34811118223` and
post-deploy smoke `34811263818` all succeeded. Mobile tests: 23 passed.
All three Railway applications reported SUCCESS at the same SHA.

After deployment, a restored public Graph URL visibly showed “사건 노트를
불러오는 중입니다.” without a raw ID or premature empty metadata. It then loaded
the existing completion Event, both interpretation Narratives, public sources and
one time table. Reading-page navigation and exact Graph return URL passed again.
Clotho still reported Revision 6 ready. The fresh-session acceptance and the
whole IP-004 gate are complete; M5 remains inactive. Final scale measurements,
deployment IDs and the retained limits are in the [gate packet](ip-004-gate-status.md).
