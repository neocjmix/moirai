# 현재 구현 상태

**IP-011 A2 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포의 공개 계약과 운영 DB는 v4 Canon 모델이다. PR #167의 커밋 `fa03dd80f6609dd5224517522bd00b7c23df43f3`가 main에 병합됐고 Railway web/API/worker가 모두 SUCCESS다. 운영 v4 DB는 변경되지 않았다. 새 v5 transaction·Revision reader·Clotho/Lachesis 인증·결정적 ID 경계는 내부 전용이며 live ingress에 연결되지 않았다. 역사 운영 World의 마지막 확인된 Revision은 30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

현재 공개 UI·writer·MCP/CLI는 여전히 v4다. v5 writer/transport는 내부 또는 별도 미등록 경계이고, 완료된 v5 Publication pointer와 공개 v5 UX는 없다. 새 `/graph/v5/viewport` 경로는 complete root만 수용하도록 준비 중이지만 staged root로는 503이며, 완전한 scale/time/neighborhood projection·pointer·UI·external parity·owner-full history/import 증거가 없으므로 A2를 종료하지 않는다. 이후 A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
