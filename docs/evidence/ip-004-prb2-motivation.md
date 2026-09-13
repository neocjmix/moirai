# IP-004 PR-B2 — second refinement, Revision 4

Actual Clotho authoring and semantic public readback passed. The reader-search
defect found by the real fixture is fixed and verified in production through
PR #86. This is not completion of PR-B or IP-004. M5 remains inactive.

## Natural language and interpretation

The agent-authored, authorized acceptance intent adds why the letters were made
to the existing Hunminjeongeum process. It distinguishes the purpose reported by
Sejong's preface from an editorial connection between letter creation and the
later explanatory book. It is not a transcript of an additional user message.

Source: [National Institute of Korean History, Our History](https://contents.history.go.kr/front/hm/view.do?levelId=hm_091_0010).
The preface's account of difficulty expressing Korean through Chinese writing
and its aim of easy learning and daily use is paraphrased. It is not asserted to
exhaust all historical causes. No exact date or promulgation ceremony is inferred.

Actual connected context at Revision 3 used the process, creation and existing
book as seeds, selected Canon, both directions, depth 1, six relevant Relation
types, limits 12 Events/30 Relations/5,000 Narrative characters. It returned four
Events, nine Relations and three Narratives with `depth_boundary: true`. The
boundary was treated as partial context, not evidence of absent remote knowledge.

## Commit and semantic evidence

- World `01995c2a-7b00-7000-8000-000000000101`, existing Canon `019f5b00-0000-7000-8000-000000000002`.
- Fixture `implementation/fixtures/ip004-semantic/03-motivation.change-plan.json`.
- Change Set `019f60ab-0000-7000-8000-000000000003`, expected Revision 3.
- Actual connected validation: valid, no errors/warnings, digest
  `bc8f6cff638470997fe9ff70addd478b15d6ac7ff846cf603b335f2f6bd1ca32`.
- Actual connected commit produced Revision 4, non-idempotent first application,
  generated_at `2026-09-13T15:27:48.643Z`. Subsequent World read: current/target/served
  4, ready; reconfirmed before the search fix.
- Same 42 Event identities and one Canon; Relation count 132 → 133. New `...0209`
  enables creation `...0102` → existing book `019f5b00-0000-7000-8000-000000000112`.
  Its attributes qualify editorial interpretation, not direct or sole causation.
- Narrative `...0303`, 왜 문자를 만들었나, belongs to the existing process `...0101`
  in the existing Canon. The prior Narrative, temporal boundaries and identities remain.

Live read-only acceptance passed exact Event/Relation identities and fields,
membership, Narrative bodies and public source references at World, Canon,
temporal, graph query and all three affected Event documents. Single elapsed
samples (ms/bytes): World 11,768/849; Canon 11,832/22,835; temporal 12,157/136,673;
graph query 34,748/445,573; process 14,443/6,794; creation 14,879/6,280;
book 12,503/7,053. These include network/proxy time, are not p95, and do not pass
the scale gate. The full graph-query path is a measured investigation candidate.

During publication an early readback correctly failed rather than accepting a
partial query. The canonical current.json pointer briefly advertised Revision 4
before spatial publication and Clotho served status completed. After ready, the
unchanged acceptance passed. Publication stage ordering needs explicit PR-C review.

## Real reader defect and bounded fix

At application `1eff8c85619f0647a8069e2f7462bfe831b8fbaf`, actual Clotho search
for 일상 found exactly the existing process. Island search found none with
이야기 포함 enabled. Title search 훈민정음 found three Events; the process drawer
and stable Event reading page showed both Narratives, public references and the
correct named start/end summary at Revision 4.

Cause: Graph initial input deliberately omits Event documents, while Canon
artifacts contain only Canon-scoped Narratives. Local title/summary search could
not find Event Narrative bodies. The fix keeps initial Graph reads unchanged and
uses the existing immutable Publication search index for candidates on demand.
It verifies each candidate against only the selected Canons' Event Narratives,
returns the existing Event identity once, and respects the Narrative toggle.
It checks manifest digests and Revision identity, verifies at most 20 Event
documents per page, and keeps one result page in the client. Empty, pending,
unavailable and more-candidate states are distinct. No new cache or infrastructure.

The acceptance reproduced the missing result before implementation; endpoint
tests now cover exact identity, Canon isolation, Revision pinning, paging and
digest rejection. Mobile tests cover real fixture Narrative search, toggling,
drawer navigation and retry after a deliberately injected read failure. CI and
deployed verification follow below.

## Deployed fix — PR #86

[PR #86](https://github.com/neocjmix/moirai/pull/86) merged as
`0f55516861b49835a284cf76fdb5dafd36cf3074`. PR
[CI 34777488209](https://github.com/neocjmix/moirai/actions/runs/34777488209), main
[CI 34777644068](https://github.com/neocjmix/moirai/actions/runs/34777644068), and
[smoke 34777746572](https://github.com/neocjmix/moirai/actions/runs/34777746572)
all succeeded, including PostgreSQL migration/integration, build, audit and mobile
WebKit. Railway Atropos `8aab17f6-75f2-49c3-bfbb-09890857715e`, Clotho
`f0b0ea80-5aaa-4050-b874-755072c81787`, worker
`2b0ed880-d7d4-4dad-9482-e706e79a91d8` all SUCCESS at the merge SHA.
Public health/status returned 200 and that exact SHA.

The actual public browser searched 일상, found the existing process once in the
chronicle Canon, disabled Narrative inclusion (no match), re-enabled it (same
Event restored), and opened its Graph drawer with both Narratives, source links
and named start/end summary. The stable Event reading page retained Revision 4,
the same text and sources. Graph baseline geometry/interaction was unchanged.
The Revision 4 live semantic readback also passed after deployment: World
6,798ms; Canon 11,718ms; temporal 12,096ms; graph 18,636ms; process 9,859ms;
creation 9,790ms; book 9,298ms. Payload sizes were unchanged. These remain client
path samples, not a scale or p95 verdict.

Open: third refinement with N:M and uncertainty, conflict/recovery, independent
session rediscovery, final reader acceptance and measured scale/resource behavior.
