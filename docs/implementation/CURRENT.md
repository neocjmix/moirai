# 현재 구현 상태

**IP-011 A1 active — 사용자 실행·쓰기·수정·삭제·병합·배포 위임(2026-09-22). A2–A6는 dependency gate 순서대로 진행하며 M5는 별도 후속 범위다.**

현재 배포는 v4 Canon 모델이다. main `814a5779147c8f458693029326e57885984f62c4`와 Railway 세 서비스 latest SUCCESS가 일치한다. 역사 World Live export는 revision30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. PR #129가 main `814a577`에 병합되어 authoritative baseline이 됐다.

A1 branch에서 v4 transition policy 조회(HTTP/CLI client/MCP parity), 격리된 v5 stale/missing/replay prototype, DB 수치 계측과 1k/10k Publication cold/warm 측정을 구현했다. 실제 PostgreSQL·모바일 CI, 성능 budget 확정과 배포 검증은 진행 중이며 A1 exit는 아직 열려 있다. [측정 원본](../evidence/ip011/a1-local-scale.json)을 참조한다. 그다음 A2 v5+데이터 rehearsal → A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다. 대규모 역사 입력과 기존 M5를 먼저 활성화하지 않는다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
