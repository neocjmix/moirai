# 현재 구현 상태

**IP-010 complete · IP-004/005/006/007/008/009 complete · M5 inactive.**

[IP-010](IP-010-japan-chronology.md)은 일본사 Canon의 canonical Time Event 제약 누락과 presentation rank→Gregorian 대체 결함을 수정했다. 기능 PR #127, commit `bf96316152d99821fb103b29e1addfca019ea8f7`의 Railway 세 서비스가 SUCCESS다.

동아시아사 World는 current/target/served **30/30/30 ready**. 기존127 Event identity, 일본사 외108 Event/359 Relation의 사실 내용과 기존 임진왜란 temporal projection을 보존했다. 일본사24 Event 전부 배치되며 실제 Graph에서1573→1575→1582→1592→1598→1600→1603→1615 순서를 확인했다. [최종 검증 및 변경 범위](../evidence/ip010/final-verification.md)를 참조한다.

기능 CI: unit282, PostgreSQL28, mobile25 통과. production build·타입·보안 검사 통과. 추가 production iPhone/desktop acceptance와 화면 증거는 evidence PR의 CI artifacts에서 확인한다.

- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
- 과거 revision28 URL은 당시 snapshot이다. 최신 revision30을 열어 교정 결과를 확인한다.
- 다음 작업은 별도 사용자 지시로 정한다. 이 완료 기록은 추가 milestone 승인이 아니다.
