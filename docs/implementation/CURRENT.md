# 현재 구현 상태

**IP-004 active · M5 inactive.** [IP-004](IP-004-production-readiness-gate.md)는
M5 이전 Product / Semantic E2E / Scale gate다. 세 축의 실제 evidence와 별도
사용자 결정 없이는 M5를 활성화하지 않는다. [IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위)의 의미·M5 경계를 유지한다.

## 현재 checkpoint

| 항목 | 상태 |
| --- | --- |
| 현재 slice | PR-C2a — 측정된 temporal projection 반복 탐색 개선; 10k spatial·초기 payload·전체 query 읽기 수는 후속 잔여 |
| 마지막 배포 검증 | PR #88, `9351bd0580027ee0172e239090bd39d26dec7dc4`; Railway Atropos·Clotho·worker SUCCESS |
| 검증 | PR CI `34779293709`, main CI `34779467101`, smoke `34779578358` success; 실제 R5 요청의 Server-Timing 및 Island→Graph Event drawer 확인 |
| 실제 World | 조선 전기 — 건국에서 세조까지; `01995c2a-7b00-7000-8000-000000000101` |
| 실제 데이터 | current/target/served Revision 5 ready; Canon 2, Event 42 (atomic 33 / composite 9), Relation 133 |
| Graph regression 경계 | M4.7 renderer/layout/interaction 유지, 후속 label hysteresis PR #77 포함; 재설계 금지 |
| 사용자 승인 | IP-004 inspect→test→commit→PR→CI→merge→Railway→public verify→evidence 전 과정 자율 진행; 새로운 유료 provider·권한 확대·정본 삭제는 별도 경계 |

## 완료와 남은 일

- PR-0 baseline 고정: [production·Graph·query·fixture](../evidence/ip-004-pr0-baseline-2026-09-13.md).
- PR-A1 Island reader-first, PR-A2 Event 탐색 배포: [Island](../evidence/ip-004-pra1-island.md), [Event](../evidence/ip-004-pra2-event.md).
  실제 refinement에서 발견한 결함은 계속 수정한다. Product 최종 gate는 아직 열려 있다.
- PR-B1 실제 coarse 입력 → Revision 2: [identity 재사용과 공개 readback](../evidence/ip-004-prb1-coarse.md).
- PR-B2 첫 보강 → Revision 3: [창제 사건·시간 범위·시작/종료](../evidence/ip-004-prb2-time.md).
  명시적 경계가 있는데 시간 미정으로만 보이던 결함은 PR #85 배포 후 drawer/page 양쪽에서 검증했다.
- PR-B2 두 번째 보강 → Revision 4: [목적·편집상 enables·Narrative](../evidence/ip-004-prb2-motivation.md).
  실제 semantic readback과 PR #86의 검색 수정 배포·공개 검증을 완료했다.
- PR-B2 세 번째 보강 → Revision 5: [N:M·불확실성·충돌 복구](../evidence/ip-004-prb2-canon.md).
  같은 세 Event와 열 Relation을 두 번째 해석 Canon에 채택했다. 실제 stale commit은 거부됐고
  최신 context를 다시 읽어 재계획한 commit은 성공했다. Canon을 넘나드는 Clotho 검색과
  Narrative Canon/source 누락은 PR #87 배포 후 실제 연결에서 수정 검증됐다.
- PR-B 잔여: 독립 LLM 세션의 World ID 기반 재탐색→후속 refinement, 전체 reader acceptance.
- PR-C: [기준선](../evidence/ip-004-prc1-scale-baseline.md), [실제 timing·temporal 개선](../evidence/ip-004-prc2-temporal-projection.md).
  1k 전체 read workload를 측정했고 10k canonical Publication은 53.6초·약 1.68GiB peak RSS였다.
  10k spatial/read 완료, 초기 payload·query 읽기 수·resource 한계와 browser 검증은 잔여다.
  기존 100k bounded spatial 회귀 검증은 유지하며 Redis 등 새 infrastructure는 추가하지 않았다.

## 용어와 진입점

[IP-004의 용어 정의](IP-004-production-readiness-gate.md#독자-화면-용어)에 따라
**Graph Event drawer**는 그래프에서 사건을 눌러 여는 sheet,
**Event reading page**는 stable URL의 상세 읽기 페이지다.
**Event detail surface**는 둘의 총칭이며, 종전 Event view 범위는 양쪽을 포함한다.
drawer/sheet 명칭만으로 modal 동작 여부를 단정하지 않는다.

- [Public Atropos](https://moirai-production-8ed1.up.railway.app/) · [Graph](https://moirai-production-8ed1.up.railway.app/graph)
- [Clotho 인증 API](https://desirable-vitality-production-eb95.up.railway.app)
- [재현 fixture와 실제 입력 단계](fixtures/ip004-semantic/README.md)
- [이전 milestone·배포 checkpoint 보존](CHECKPOINTS-THROUGH-PR85.md)

이 파일은 짧은 현재 상태판이다. 상세 실행 이력은 각 evidence에 기록한다.
