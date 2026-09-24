# 현재 구현 상태

**IP-011 A2 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포의 공개 계약과 운영 DB는 v4 Canon 모델이다. PR #157의 커밋 `a481c19d6cfe48d917a6d8117b192ce4e17391f8`가 main에 병합됐고 Railway 배포가 진행 중이다. 이전 PR #156의 web/API/worker 배포 SUCCESS를 확인했으며 운영 v4 DB는 변경되지 않았다. 새 v5 transaction·Revision reader·Clotho/Lachesis 인증·결정적 ID 경계는 내부 전용이며 live ingress에 연결되지 않았다. 역사 운영 World의 마지막 확인된 Revision은 30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full DB inventory와 암호화 backup/restore 도구](../evidence/ip011/a2-execution.md)를 PR #131로 배포하고 실제 운영 snapshot의 암호화 저장·격리 복원 digest 일치를 확인했다. PR #132–135는 v4 history, 160→133 Narrative manifest, v5 불변식·schema와 policy·격리 실행기를 병합했다. 사용자 재승인 후 실제 복원본 `ip011_rehearsal_81811c151956e9af`에서 Revision 30→31 schema/content 전환, 127 Event·6 Collection·415 Relation·133 Narrative 및 이력·원본 불변 검증을 통과했다. PR #139–145는 내부 전용 v5 Change Set/출처/인가/결정적 client_ref·strict wire schema/Clotho 경계와 별도 v5 Revision reader를 disposable PostgreSQL 및 권한·재시도 테스트로 검증했다. PR #146–150은 v5 paged content, World-union temporal 계산과 detail paging, 임의 Event detail에 bounded lookup 가능한 staged index/reader, strict v5 HTTP transport를 병합했다. v5 HTTP route는 live app에 mount하지 않는다. PR #151의 staged DB adapter는 Lachesis의 기존 database boundary에서 v5 draft를 영속 transaction에 연결하고 010 schema migration 전에는 쓰기를 거절한다. 이 adapter 역시 live app과 분리되어 있으며 disposable PostgreSQL 통합 테스트가 CI에서 통과했다. PR #152에서 동일 복원 DB에 실제 HTTP 요청을 연결한 end-to-end 검증이 CI에서 통과했다. PR #153의 staged CLI client는 v5 경로를 별도로 호출하며 현재 운영 서버에는 v5 경로가 노출되지 않는다. PR #154의 inactive MCP v5 route는 HTTP/DB와 동일한 Clotho/Lachesis 경계에 연결했고 격리 DB 재시도 검증이 CI에서 통과했다. PR #155는 기존 Auth0 issuer/audience/scope 검증기를 이 route에도 연결하고 서명된 읽기 전용 토큰 테스트를 통과했다. PR #156은 검증된 v5 rehearsal tree를 immutable object로 올리되 불완전한 index를 운영 pointer로 제공하지 않는다. PR #157의 staged Collection reader는 membership을 페이지로 읽고 동일 World Event ID를 공유한다. 다음 read slice는 Collection catalog를 World 총량과 독립적인 한 페이지로 읽는다. 워커 임시 명령은 원복했고 pending 변경은 없다. **운영 canonical DB는 아직 v4이며 A2의 external v5 HTTP/MCP/CLI 연결, 완전한 Publication/Atropos, export 계약 전환은 미완료**다. 그다음 A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
