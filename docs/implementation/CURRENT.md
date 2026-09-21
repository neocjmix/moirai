# 현재 구현 상태

**IP-004 complete · IP-005 complete · IP-006 complete · IP-007 complete · M5 inactive.**

[IP-007](IP-007-shared-event-reader-identity.md)은 PR #117, main
`0ae844e39af7279df32414488c9dbba9aed3475c`로 완료했다. 여러 Canon에 참여하는 동일
Event를 graph에서 하나의 node로 합성하고 Canon별 Narrative를 하나의 drawer 안에서
section과 문단으로 구분한다. Revision 7의 계유정난 node 1개와 두 Canon Narrative
section을 production에서 확인했다. canonical data와 Composite Event 생성 계약은
바꾸지 않았다.

[IP-006](IP-006-clotho-mcp-schema-repair.md)는 PR #115에서 MCP schema 복구와
fresh-client validate를 완료했다. M5는 이 작업들로 자동 활성화되지 않는다.

[IP-005](IP-005-graph-reader-consolidation.md)는 IP-004와 M5 사이의 독립 리팩터링 계획이다.
2026-09-19 [PR #98](https://github.com/neocjmix/moirai/pull/98)을 main
`6c30c7bbe8825957d4ad85b685137946d129df87`로 병합했고 Railway 세 application service가
같은 SHA로 SUCCESS가 됐다. `/`는 `/graph`로 연결되고 Event 읽기는 revision-pinned
Graph Event drawer의 peek/full로 통합됐다. 구형 UI route는 제거했지만 Publication JSON,
Graph API, health/status와 immutable artifact 호환은 유지했다. [종료 evidence](../evidence/ip-005-graph-reader-consolidation.md)에
CI·scale·배포·공개 history QA를 연결했다. M5는 별도 활성화가 필요하다.

## 과거 IP-004 검증 checkpoint

아래 runtime·CI·Revision·성능은 IP-004 종료 당시의 evidence이며 이번 문서 단계에서 재검증한 결과가 아니다.

| 항목 | 상태 |
| --- | --- |
| 완료 | PR-B3 새 세션 검증과 PR-Z 종료 검증 완료. 활성 구현 milestone 없음 |
| 검증한 runtime | PR #95, `b90d06f4ab0e876102f05285d89aaa664765f2fc`; Railway Atropos·Clotho·worker 모두 SUCCESS |
| CI·배포 검증 | PR CI `34810897021`, 100/1k/10k scale CI `34810897061`, main CI `34811118223`, smoke `34811263818` 모두 success |
| 실제 World | 조선 전기 — 건국에서 세조까지; `01995c2a-7b00-7000-8000-000000000101` |
| 실제 데이터 | current/target/served Revision 6 ready; Canon 2, Event 42 (atomic 33 / composite 9), Relation 133 |
| Graph 경계 | M4.7 renderer/layout/interaction·PR #77 label hysteresis 유지; drawer의 초기 로딩 표시만 수정 |

## 종료 판단과 한계

| 축 | 결과 |
| --- | --- |
| Product | YES. Island → Graph Event drawer → Event reading page → Graph 왕복, Canon 구분·시간·출처·선택 복원 확인. 모바일 23개 검사와 로딩/실패/재시도 회귀 통과 |
| Semantic E2E | YES. 새 세션이 실제 Clotho로 기존 identity를 재탐색한 뒤 해례 구성 주석 1개를 추가. Revision 5→6에서 기존 Event·Relation·membership·Narrative 보존과 공개 readback 확인 |
| Scale | YES, 기록한 workload/budget 범위. 100/1k/10k 실제 query·Next/WebKit 검사와 기존 100k bounded spatial 회귀 통과. 전체 100k canonical workload 또는 production WAN p95를 검증한 것은 아님 |

- [통합 완료 evidence](../evidence/ip-004-gate-status.md) — CI·배포·성능·public QA 연결.
- [독립 세션 evidence](../evidence/ip-004-prb3-fresh-session.md) — 탐색을 먼저 기록한 뒤 실제 validate/commit·Publication·공개 왕복 검증. fixture replay와 구별한다.
- 새 측정: 10k Graph 3.176초, drawer 1.162초, warm initial p95 43.84ms.
  Builder 95.59초, builder/read peak RSS 2,278,100/1,238,460 KiB로 기존 budget 통과.
- 공개 Revision 6 semantic 검사 6개 및 cache/readback 검사 10개 통과.
  이전 Revision 5 URL은 과거 상태를 보존한다. 새 provider·비용·권한 확대 없음.
- 후속 순서: IP-005 구현 실행 지시 → 별도 리팩터링 완료 → 별도 M5 진입 결정. 현재는 문서 단계만 허용한다.

## 용어와 진입점

목표 계약은 [TS-006](../technical-specifications/TS-006-atropos-publication.md)과 IP-005다.
**Graph Event drawer**의 peek/full로 통합하며 full URL은
`/graph/events/{worldId}/{eventId}?revision=N&canon={canonId}`이며 현재 구현·배포됐다.
아래 구형 Event URL 및 위 Product 왕복의 **Event reading page**는 과거 IP-004 검증 표면이다.
[IP-004 용어](IP-004-production-readiness-gate.md#독자-화면-용어)는 당시 기준으로 보존한다.

- [Public Atropos](https://moirai-production-8ed1.up.railway.app/) · [Graph](https://moirai-production-8ed1.up.railway.app/graph)
- [검증한 Revision 6 사건](https://moirai-production-8ed1.up.railway.app/graph/events/01995c2a-7b00-7000-8000-000000000101/019f5b00-0000-7000-8000-000000000112?revision=6)
- [Clotho 인증 API](https://desirable-vitality-production-eb95.up.railway.app)
- [작성 fixture와 실제 입력 단계](fixtures/ip004-semantic/README.md)
- [이전 milestone·checkpoint](CHECKPOINTS-THROUGH-PR85.md)
