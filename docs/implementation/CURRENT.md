# 현재 구현 상태

**IP-004/005/006/007/008 complete · M5 inactive.**

[IP-008](IP-008-reader-first-narratives.md)은 [PR #121](https://github.com/neocjmix/moirai/pull/121), 기능 commit `e2f6f393de0005938d9465d4e5dae4fc4f98ea8b`로 배포·검증했다. 본문과 접힌 주석·출처를 분리하고, ID·범위·이전을 보존하는 Narrative 정정 및 신규 작성 기준을 반영했다. Moirai Live의 설치된 도구 정의도 새로 고침했다.

조선 전기 World `01995c2a-7b00-7000-8000-000000000101`은 current/target/served Revision 10 ready다. Narrative 48개 정정·보조 주석 3개 추가. 기존 사건·관계·시간 데이터와 이전 Revision 9는 보존한다. [종료 evidence](../evidence/ip-008-reader-first-narratives.md)에 CI·배포·smoke·100/1k/10k·실제 데이터 비교와 화면 확인을 연결했다.

직전 PR #120의 동일 연도 Y 분산, Composite contains 검증, Revision 9 보정 체제 포함 관계 정정도 유지한다. 일반 엔티티 수정이나 M5 전체는 활성화하지 않았다.

- Atropos: https://moirai-production-8ed1.up.railway.app
- Clotho: https://desirable-vitality-production-eb95.up.railway.app
- 다음 작업은 별도 사용자 지시로 정한다. 이 완료 기록은 추가 milestone 승인이 아니다.
