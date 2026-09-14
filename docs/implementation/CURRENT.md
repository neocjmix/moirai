# 현재 구현 상태

**IP-004 complete · M5 inactive.** Product / Semantic E2E / Scale 세 축의
종료조건을 충족했다. M5는 자동으로 시작하지 않으며 별도 사용자 지시를 기다린다.
범위는 [IP-004](IP-004-production-readiness-gate.md)와
[IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위)를 따른다.

## 최종 checkpoint

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
- 다음 단계: 사용자의 별도 M5 진입 결정. 이 완료 기록은 M5 활성화가 아니다.

## 용어와 진입점

[용어 정의](IP-004-production-readiness-gate.md#독자-화면-용어):
**Graph Event drawer**는 그래프에서 사건을 눌러 여는 dialog/sheet,
**Event reading page**는 stable URL 상세 읽기 페이지이며,
**Event detail surface**는 둘의 총칭이다.

- [Public Atropos](https://moirai-production-8ed1.up.railway.app/) · [Graph](https://moirai-production-8ed1.up.railway.app/graph)
- [검증한 Revision 6 사건](https://moirai-production-8ed1.up.railway.app/worlds/01995c2a-7b00-7000-8000-000000000101/events/019f5b00-0000-7000-8000-000000000112?revision=6)
- [Clotho 인증 API](https://desirable-vitality-production-eb95.up.railway.app)
- [작성 fixture와 실제 입력 단계](fixtures/ip004-semantic/README.md)
- [이전 milestone·checkpoint](CHECKPOINTS-THROUGH-PR85.md)
