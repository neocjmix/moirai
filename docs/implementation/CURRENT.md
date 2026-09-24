# 현재 구현 상태

**IP-011 A2 exit passed on the isolated clone; A3 controlled cutover is next and has not begun.** 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22)은 dependency gate 순서를 따른다. M5는 별도 후속 범위다.

현재 배포의 공개 계약과 운영 DB는 v4 Canon 모델이다. PR #186의 커밋 `b2dbc64e07f0085ce330caf2ec3c6d6f7e93702d`까지 main에 병합됐고 CI run 36073589105가 성공했다. 해당 SHA의 web/API/worker가 모두 SUCCESS였고 worker는 격리 clone Revision 31을 검증했다. 운영 v4 DB와 `current.json`은 변경되지 않았다. v5 writer/reader는 live ingress에 연결되지 않았고 역사 운영 World의 마지막 확인 Revision은 30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

현재 공개 UI·writer·MCP/CLI는 여전히 v4다. v5 `/graph/v5`는 complete pointer 없이는 비활성이며 worker의 pointer handoff도 호출하지 않았다. 격리 clone의 Rev31 complete 후보는 125개 배치·2개 미배치, pointer/storage write 0이었다. synthetic mobile WebKit은 shared Event·Narrative·미배치·Composite 탐색을 통과했다. Rev31에서 World 제목 후보 인덱스와 제한된 Narrative·Relation·Collection 상세 조회를 확인했다. 여섯 역사 Event, 26개 공유 Event, 143개 Collection/Composite 겹침 Relation의 실제 clone 시나리오를 통과했다. `일본사` 제목 0건은 부재 증거가 아니다. [A2 gate review](../evidence/ip011/a2-gate-review.md)가 owner-full 물리 백업/이력과 v5 content ZIP의 차이, 의미 중복 판단의 한계, A3/A4/A5/A6 잔여 exit를 기록한다. A3는 새 backup·write quiesce·live migration·served pointer 검증을 별도로 수행해야 한다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
