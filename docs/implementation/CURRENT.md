# 현재 구현 상태

**IP-011 A2 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포의 공개 계약과 운영 DB는 v4 Canon 모델이다. PR #179의 커밋 `16398d18d587d28051a5b77ef05f0072c25562b4`가 main에 병합됐고 CI와 Railway web/API/worker 배포가 모두 SUCCESS다. 운영 v4 DB는 변경되지 않았다. 새 v5 transaction·Revision reader·Clotho/Lachesis 인증·결정적 ID 경계는 내부 전용이며 live ingress에 연결되지 않았다. 역사 운영 World의 마지막 확인된 Revision은 30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full inventory·암호화 backup/restore·실제 clone rehearsal](../evidence/ip011/a2-execution.md)을 완료했고, 원본 운영 snapshot을 바꾸지 않은 채 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content migration을 검증했다. PR #132–145는 보존 manifest, World v5 불변식, transaction/인가/결정적 client_ref, v4 이력과 v5 Revision reader를 구축했다. PR #146–165는 World content/temporal page, immutable digest index, bounded Event/Collection/adjacency/Composite/다중 Collection 읽기와 격리 HTTP/MCP/CLI 경계를 누적 검증했다. PR #166은 World-owned viewport와 정확한 Collection 선택 intersection, PR #167은 v5 ZIP64 content 계약을 추가했다. 실제 clone은 Rev30 이력 동일, Rev31 history=active, ZIP64 round-trip을 통과했다. 상세 PR/SHA·검증 범위·한계는 실행 증거에 기록한다.

현재 공개 UI·writer·MCP/CLI는 여전히 v4다. v5 writer/transport는 내부 또는 별도 미등록 경계이고, 운영 v5 Publication pointer는 없다. `/graph/v5/viewport`·`/graph/v5/read`와 v5 탐색 페이지는 실제 complete pointer만 수용하므로 여전히 비활성이다. 격리 clone의 Rev31 complete 후보는 125개 배치·2개 미배치, pointer/storage write 0으로 통과했다. #173 staged 측정(192페이지·최대 read 14회)과 #175 이후 재측정(48페이지·최대 read 38회)의 차이는 #174의 viewport rawLimit 4→16 변경으로 설명된다. #177 배포의 clone에서 complete 후보를 두 번 재실행해 같은 Revision·문서 집합/완성 root digest·48/38을 확인했다. #173은 digest를 기록하지 않았으므로 당시 byte-identical output까지 소급 입증할 수는 없다. 모바일 CI는 한 자식과 좌표가 겹치는 Composite의 접근 문제를 수정했고 격리 브라우저 fixture에서 shared Event·Narrative·미배치·Composite 탐색을 통과했다. complete pointer handoff는 격리 단위 테스트를 통과했지만 실제 worker 호출은 금지한 상태다. v5 World 범위 제목 후보 검색은 비활성 HTTP/MCP/CLI에 연결했고 실제 clone Rev31에서 인덱스와 두 번의 검색을 확인했다. `일본사` 제목 질의 0건은 일본사 Event 부재가 아니라 제목 검색 한계다. 후보 Narrative·시간·인접 관계의 제한된 상세 조회와 owner-full history/import 경계의 잔여 검증이 있으므로 A2를 종료하지 않는다. 큰 World의 scale/latency 실측과 최적화는 A4 exit이며 A3 전에 필요한 구조·상한만 A2에서 확인한다. 이후 A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
