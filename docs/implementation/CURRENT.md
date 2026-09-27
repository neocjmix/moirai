# 현재 구현 상태

**IP-011 A3 완료; A4 진행 중 — 지속 탐색 exit 미완료.** PR #230–233의 snapshot/cache 분리·원형 재사용·역산 후보·퇴장 시한·부분 support 구분을 배포했다. #233 main 8ac1da4의 CI 36355519818/post-deploy 36355675829, 시험 실행부 수정 #234 main 5250eda의 CI 36355835485/post-deploy 36355982612가 성공했다. #232 scale 36333166185의 기존 mobile 12개·worker 2개 성공은 유지하되 장시간 탐색 해결로 확대 해석하지 않는다.

고정 성능 재검증에서 PR #230 scale 36331858204의 1k dense pan max 132ms, PR #231 scale 36332336741의 1k sparse/100k large pan max 109ms가 100ms 상한을 넘었다. 통과 실행만 채택하지 않으며 기준을 완화하지 않는다. 상세 근거는 [A4 실행 Slice 26–28](../evidence/ip011/a4-execution.md).

새 R3 시험은 두 차례 준비 오류로 아직 구간 측정을 완료하지 못했다. #234 scale 36355648638의 새 sustained fixture에서는 기존 pan max 104ms도 관측해 실패로 남긴다. 다음 checkpoint는 전체 범위 조회의 응답 상한을 존중하는 구간 준비와 투명 SVG의 기존 220ms 퇴장 후 제거다. 원본/이름 정책과 작은 Composite 점·색 배정은 유지한다. 로컬 관련 39개 시험 성공; 브라우저 검증 전이다. 추가 region 작업 제한과 R3 판정이 남는다. [A4 종료/A5 실험 재계획](IP-011-reader-performance-plan.md)을 따른다. 새 밀도 규칙·tile/level·Collection discovery(A5), A6/M5는 비활성이다.

2026-09-25 운영 World는 Revision 30→31의 v5 schema/content로 이전됐고 새 암호화 owner-full 백업·격리 복원·clone migration 재현을 통과했다. 인증된 v5 정책 기반 운영 쓰기와 동일 Change Set 재생으로 Revision 32가 됐으며 공개 완전 Publication 포인터는 v5 served/current/target 32다. 127 Event·6 Collection·415 Relation·133 Narrative가 보존됐다. API·worker·web은 v5로 동작하고 구형 v4 변경 경로는 404, 미인증 v5 commit은 401이다. v5 공개·인증 배포 smoke 36093424585와 운영 iPhone WebKit 미배치 Event·Collection·Composite 탐색이 통과해 A3의 아홉 시나리오를 충족했다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정한 PR #129가 main `814a577`에 병합되어 초기 authoritative baseline이 됐다. 당시 문서 개정 이후 A1·A2·A3 실행을 순서대로 완료했다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 전환 당시 배포 health SHA·policy route의 401·Live Revision 30을 확인했다. 연결된 Live 도구 catalog는 새 method를 아직 노출하지 않아 도구 갱신이 필요하지만, A3의 인증된 운영 v5 호출은 API action과 CI smoke로 확인했다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

A2의 격리 clone은 별도 [A2 gate review](../evidence/ip011/a2-gate-review.md)에 기록한다. 운영 공개 UI는 `/graph/v5`와 검증된 포인터를 통해 v5를 읽으며 공간 요약은 125개 배치·2개 미배치를 반환한다. 인증된 v5 commit/replay는 임시로 제한한 운영 API action의 성공 로그로, 모바일 탐색은 post-deploy WebKit 실행으로 확인했다. A4에서는 [IP-011](IP-011-architecture-realignment.md)의 cold/warm/dense/scale latency·frame budget과 N 증가에 따른 bounded cost를 측정·개선한다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
