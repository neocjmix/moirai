# 현재 구현 상태

**IP-011 A2 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포는 v4 Canon 모델이다. PR #135의 runtime 커밋 `42fe92ddbde56ce1fba1adbfd633d022dc0c73a3`이 main에 병합됐으며 Railway web/API/worker에서 모두 SUCCESS를 확인했다. PR #136은 실행 gate에 대한 문서만 변경했다. 역사 World의 마지막 확인된 Revision은 30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full DB inventory와 암호화 backup/restore 도구](../evidence/ip011/a2-execution.md)를 PR #131로 배포하고 실제 운영 snapshot의 암호화 저장·격리 복원 digest 일치를 확인했다. PR #132는 v4 history reader를 보존했다. PR #133은 160→133 Narrative 보존 manifest를 병합했고, PR #134는 v5 target 불변식·원자 candidate·격리 schema gate를 병합했다. PR #135는 v5 정책 원본과 격리 DB schema+content 트랜잭션 리허설 실행기를 병합했고 PostgreSQL 통합 CI가 통과했다. 실제 복원본 실행은 아직 수행되지 않았다. Railway 환경 전체의 staged 변경을 커밋하는 임시 워커 시작 명령 배포가 안전 검토에서 거부되어 해당 명령은 원복했다. 운영 schema/content migration은 아직 실행하지 않았다. 그다음 A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
