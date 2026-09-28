# 현재 구현 상태

**IP-011 A1–A3 완료; A4는 2026-09-28 사용자 승인으로 잔여 백로그를 이관하여 종료했다.** 원래 성능 exit 전체 통과를 뜻하지 않는다. A5는 현재 [authoritative planning](IP-011-A5-collection-discovery-plan.md)만 활성이고 구현은 비활성이다. 이번 문서 기준선은 main 반영 전이며 준비 세션에서 구현·merge·deployment를 하지 않는다. 다음 세션의 명시적 구현 시작 지시는 이 planning-only 제한을 대체하며 [A5 인계](IP-011-A5-handoff.md)에 따라 상태를 갱신한다. A6/M5·대량 역사 입력도 비활성이다.

[종료 결정·후속 백로그](IP-011-A4-closeout-backlog.md)가 잔여 A4-B01(지속 frame), B02(region 계산), B03(실기기·메모리 증거)의 상태와 완료 조건을 소유한다. 기존 수치 기준·실패 기록·테스트는 유지한다. A5는 [Graph 중심 발견·이중 밀도 계획](IP-011-A5-collection-discovery-plan.md)을 따른다. 표현 capacity를 먼저 검증하고 contextual activation을 도입하며 tile/cluster는 조건부 실험이다.

종료 시 runtime main은 PR #235 `035cc069b00c0cc722c17f8b976b36c8738335ad`다. [main CI](https://github.com/neocjmix/moirai/actions/runs/36357907586)와 [배포 후 smoke](https://github.com/neocjmix/moirai/actions/runs/36358106084)가 성공했다. 최종 PR 후보 [scale](https://github.com/neocjmix/moirai/actions/runs/36357642646)는 기존 모바일 12개·worker 2개 성공, sustained 실패다. 30회 왕복에서 DOM 229·동일 복귀 geometry와 cache 상한은 유지됐으나 연속 frame p95 50/56/62ms는 33.4ms 예산을 넘었다. 성능 검증 완료로 보고하지 않는다.

2026-09-25 운영 World는 Revision 30→31의 v5 schema/content로 이전됐고 새 암호화 owner-full 백업·격리 복원·clone migration 재현을 통과했다. 인증된 v5 정책 기반 운영 쓰기와 동일 Change Set 재생으로 Revision 32가 됐으며 공개 완전 Publication 포인터는 v5 served/current/target 32다. 127 Event·6 Collection·415 Relation·133 Narrative가 보존됐다. API·worker·web은 v5로 동작하고 구형 v4 변경 경로는 404, 미인증 v5 commit은 401이다. v5 공개·인증 배포 smoke 36093424585와 운영 iPhone WebKit 미배치 Event·Collection·Composite 탐색이 통과해 A3의 아홉 시나리오를 충족했다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정한 PR #129가 main `814a577`에 병합되어 초기 authoritative baseline이 됐다. 당시 문서 개정 이후 A1·A2·A3 실행을 순서대로 완료했다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 전환 당시 배포 health SHA·policy route의 401·Live Revision 30을 확인했다. 연결된 Live 도구 catalog는 새 method를 아직 노출하지 않아 도구 갱신이 필요하지만, A3의 인증된 운영 v5 호출은 API action과 CI smoke로 확인했다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

A2의 격리 clone은 별도 [A2 gate review](../evidence/ip011/a2-gate-review.md)에 기록한다. 운영 공개 UI는 `/graph/v5`와 검증된 포인터를 통해 v5를 읽으며 공간 요약은 125개 배치·2개 미배치를 반환한다. 인증된 v5 commit/replay는 임시로 제한한 운영 API action의 성공 로그로, 모바일 탐색은 post-deploy WebKit 실행으로 확인했다. A4의 측정·개선 이력은 [A4 실행](../evidence/ip011/a4-execution.md), 종료 후 미충족 항목은 [후속 백로그](IP-011-A4-closeout-backlog.md)를 따른다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
