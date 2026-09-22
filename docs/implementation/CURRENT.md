# 현재 구현 상태

**IP-011 A0 — authoritative planning baseline 수립. A1–A6 구현·migration 및 M5 비활성.**

현재 배포는 v4 Canon 모델이다. main `05ebf3b27794e60d734a885cc428a30104118896`와 Railway 세 서비스 latest SUCCESS가 일치한다. 역사 World Live export는 revision30이다. IP-004~010 완료 이력은 유지한다.

목표 의미·dependency·migration·exit의 기준은 [IP-011](IP-011-architecture-realignment.md)이다. CON-003→CORE-MODEL→TS-002/004/005/006을 개정했으며 이 문서 변경은 runtime cutover 완료가 아니다. branch PR이 main에 반영되기 전에는 제안된 authoritative baseline이다.

다음 실행 단위는 A1: 현재 v4용 transition policy 조회, 격리된 v5 policy guard prototype과 성능 계측. 그다음 A2 v5+데이터 rehearsal → A3 cutover → A4 bounded read → A5 discovery → A6 역사 dogfooding이다. 대규모 역사 입력과 기존 M5를 먼저 활성화하지 않는다.

- [실제 조사와 한계](../evidence/ip011/reconstruction.md)
- [migration 대상 IDs](../evidence/ip011/data-audit.json)
- [자기검증](../evidence/ip011/review.md)
- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
