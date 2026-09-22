# 현재 구현 상태

**IP-009 최종 E2E 검증 중 · IP-004/005/006/007/008 complete · M5 inactive.**

[IP-009](IP-009-imjin-war-e2e.md)은 사용자 지시에 따라 조선사 World의 범위를 임진왜란까지 확장했다. World ID와 `early-joseon` slug, 기존 세 Canon/50 Event/164 Relation/51 Narrative는 보존했다. PR #122는 World metadata write path, PR #123은 중첩 Composite span·Canon별 drawer·World plane viewport 보정을 배포했다.

현재 current/target/served Revision 26 ready. 새 역사 데이터는 고유 atomic 46개·Composite 12개, Narrative 89개, Relation 195개다. 해상전 Canon은 atomic 11개를 재사용한다. [구축 기록](../evidence/ip009/README.md)과 revision 26 audit/projection evidence를 참조한다. 공개 readiness smoke는 기능 commit `286af9c0af16dd5ea929ecfc2a95938541d50503`에서 통과했다.

실데이터 desktop/mobile E2E에서 발견한 새 URL의 이전 camera 복원과 빠른 drawer 전환·페이지 이동 경합을 후속 수정 중이다. 최종 E2E 성공 전에는 IP-009 완료로 보지 않는다. 추가 milestone이나 M5는 활성화하지 않았다.

- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
- 다음 작업은 별도 사용자 지시로 정한다. 이 완료 기록은 추가 milestone 승인이 아니다.
