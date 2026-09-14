# 현재 구현 상태

**IP-004 active · M5 inactive.** [IP-004](IP-004-production-readiness-gate.md)는
M5 이전 Product / Semantic E2E / Scale gate다. 세 축의 실제 evidence와 별도
사용자 결정 없이는 M5를 활성화하지 않는다. [IP-003 §17](IP-003-canon-semantic-realignment.md#17-m5-재설계-범위)의 의미·M5 경계를 유지한다.

## 현재 checkpoint

| 항목 | 상태 |
| --- | --- |
| 현재 slice | PR-Z evidence 정리; PR-B3 새 LLM 세션 검증을 남겨 둔 안정 checkpoint |
| 마지막 runtime 배포 검증 | PR #93, `c687fe94e751999d2df54d78abe94db188b34fbd`; Railway Atropos·Clotho·worker SUCCESS |
| 검증 | PR CI `34783354536`, 100/1k/10k scale CI `34783354524`, main CI `34802375906`, smoke `34802541817` success; 공개 status·reader 왕복·실제 Revision 5 semantic readback 5개 테스트 통과 |
| 실제 World | 조선 전기 — 건국에서 세조까지; `01995c2a-7b00-7000-8000-000000000101` |
| 실제 데이터 | current/target/served Revision 5 ready; Canon 2, Event 42 (atomic 33 / composite 9), Relation 133 |
| Graph regression 경계 | M4.7 renderer/layout/interaction 유지, 후속 label hysteresis PR #77 포함; 재설계 금지 |
| 사용자 승인 | IP-004 inspect→test→commit→PR→CI→merge→Railway→public verify→evidence 전 과정 자율 진행; 새로운 유료 provider·권한 확대·정본 삭제는 별도 경계 |

## 완료와 남은 일

[통합 evidence와 한계](../evidence/ip-004-gate-status.md)에 CI·배포·fixture·공개 검증을 연결했다.

| 축 | 현재 판단 |
| --- | --- |
| Product | YES. Island 독자 탐색, Graph Event drawer와 Event reading page 및 왕복을 실제 Revision 5와 mobile CI에서 검증했다. Graph renderer/layout은 보존했다. |
| Semantic E2E | OPEN. 실제 coarse → 세 차례 refinement, identity/N:M/충돌 복구·공개 readback은 통과했다. 새 LLM 세션에서의 재탐색→다음 refinement만 남았다. |
| Scale | YES, 문서화된 workload/budget 범위. 100/1k/10k 실제 query·Next/WebKit 경로와 기존 100k bounded spatial 회귀가 통과했다. 전체 100k canonical workload나 production WAN p95를 검증한 것은 아니다. |

- 실제 작성 이력: [Revision 2 coarse](../evidence/ip-004-prb1-coarse.md) →
  [Revision 3 시간](../evidence/ip-004-prb2-time.md) →
  [Revision 4 목적·서사](../evidence/ip-004-prb2-motivation.md) →
  [Revision 5 N:M·해석·충돌 복구](../evidence/ip-004-prb2-canon.md).
- [PR-C3 최종 계측](../evidence/ip-004-prc3-query-cache.md): 10k Graph 3.09초,
  drawer 1.18초, warm initial p95 42.61ms. Builder 92.7초, builder/read peak RSS
  각각 2,115,212/1,250,452 KiB. Revision-safe cache 보관량·무효화·rebuild를 검증했다.
  Redis 등 새 infrastructure나 비용 확장은 없다.
- 다음 최소 단계: [새 LLM 세션 인계](IP-004-fresh-session-handoff.md).
  IP-004 PR-B 필수 시나리오 5 때문에 실제 새 세션이 필요하다. 현재 대화의 계속 실행,
  compaction 또는 fixture replay로 이 조건을 통과 처리하지 않는다. 실행 권한의 재승인을
  요구하는 것이 아니다. 전체 세 축 YES 후에도 M5는 사용자 판단 전까지 inactive다.

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
