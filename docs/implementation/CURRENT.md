# 현재 구현 상태

**IP-011 A3 live cutover executed; acceptance is active.** 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22)은 dependency gate 순서를 따른다. M5는 별도 후속 범위다. [A3 실행 기록](../evidence/ip011/a3-execution.md)은 gate별 실제 증거와 남은 작업을 구분한다.

2026-09-25 운영 World는 Revision 30→31의 v5 schema/content로 이전됐고 새 암호화 owner-full 백업·격리 복원·clone migration 재현을 통과했다. 공개 완전 Publication 포인터는 v5 served/current/target Revision 31이며 127 Event·6 Collection·415 Relation·133 Narrative를 보존했다. web/API/worker는 PR #189 병합 SHA `dfae64fb5f089ac8c384a12bba12f961fadf275d`에서 SUCCESS, API는 v5, worker는 v5로 동작한다. 구형 v4 변경 경로는 404, 미인증 v5 commit은 401이다. 인증된 운영 v5 작성·동일 요청 재시도와 아홉 served 시나리오의 남은 항목을 검증하기 전까지 A3 exit를 선언하지 않는다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

A2의 격리 clone은 별도 [A2 gate review](../evidence/ip011/a2-gate-review.md)에 기록한다. 운영 공개 UI는 `/graph/v5`와 검증된 포인터를 통해 v5를 읽으며 공간 요약은 125개 배치·2개 미배치를 반환한다. 현재 연결된 Moirai Live 도구 catalog는 v4 입력만 광고하므로 운영 인증 v5 commit/replay 증거는 아직 없다. 세부 시나리오별 통과와 미검증 사항은 A3 실행 기록을 따른다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
