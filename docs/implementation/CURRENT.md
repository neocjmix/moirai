# 현재 구현 상태

**IP-011 A2 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포는 v4 Canon 모델이다. main `f0331129f1a84d0bd3adf20ba9e63e0c262fb964`와 Railway 세 서비스 latest SUCCESS가 일치한다. 역사 World Live export는 revision30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1은 PR #130으로 구현·병합·배포했다. v4 transition policy 조회, HTTP/MCP parity와 CLI 전달, 격리된 v5 guard/replay 검증, PostgreSQL 및 모바일 100/1k/10k 측정과 [A4 budget](../evidence/ip011/a1-execution.md)을 완료했다. 배포 health SHA·policy route의 401·Live revision30을 확인했다. 현재 세션의 Live 도구 catalog는 새 method를 아직 노출하지 않아 실제 production 인증 policy 호출은 미실시이며 새 작성 세션에서는 catalog를 갱신해야 한다.

A2는 [owner-full DB inventory와 암호화 backup/restore 도구](../evidence/ip011/a2-execution.md)를 PR #131로 배포하고 실제 운영 snapshot의 암호화 저장·격리 복원 digest 일치를 확인했다. 이제 복원본에서 v5 전환을 진행한다. 운영 schema/content migration은 아직 실행하지 않았다. 그다음 v5+데이터 rehearsal → A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
