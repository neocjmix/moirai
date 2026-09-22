# 현재 구현 상태

**IP-009 complete · IP-004/005/006/007/008 complete · M5 inactive.**

[IP-009](IP-009-imjin-war-e2e.md)은 조선사 World의 범위를 임진왜란까지 확장했다. World ID와 `early-joseon` slug, 기존 세 Canon/50 Event/164 Relation/51 Narrative를 보존했다. PR #122–125는 World metadata write path, 중첩 Composite span, Canon별 drawer, World plane과 공유 Event의 초점·navigation 문제를 수정했다.

current/target/served Revision **26 ready**. 새 데이터는 고유 atomic 46개·Composite 12개, Narrative 89개, Relation 195개다. 해상전 Canon은 atomic 11개를 재사용한다. [최종 보고서](../evidence/ip009/final-verification.md)에 사료·구조·보존·중복 검증과 실제 화면 증거를 기록했다.

기능 commit `ebea433cdc8a66e767c253b8fb15e9a988c6ece5`의 Railway 세 서비스와 공개/인증 smoke가 통과했다. 배포 후 desktop/iPhone 실데이터 E2E 4/4, 기존 mobile fixture 25 pass/1 skip, 타입·unit·DB 통합·빌드·보안 검사 및 100/1,000/10,000 reader 회귀가 통과했다. [판정 기록](../evidence/ip009/acceptance.json)을 참조한다. 이 기록 이후의 evidence 문서 commit은 기능 코드를 변경하지 않는다.

- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
- 다음 작업은 별도 사용자 지시로 정한다. 이 완료 기록은 추가 milestone 승인이 아니다.
