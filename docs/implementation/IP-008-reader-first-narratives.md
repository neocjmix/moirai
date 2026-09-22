# IP-008 — 독자 중심 Narrative

사용자가 기존 데이터·신규 작성 기준·UI 개선과 Git/Railway/Moirai 쓰기를 명시적으로 승인한 독립 작업이다. M5는 비활성으로 유지한다.

## 범위

- TS-002: primary/summary는 사건 서술, annotation은 보조 자료·날짜 해석. 출처와 작성 유래를 분리한다.
- TS-004/TS-003: ID·범위를 유지하는 Narrative 정정. 원문 Revision과 before/after, 동시성·재시도 보존.
- TS-006: 본문 우선, 접을 수 있는 주석과 출처. 기존 drawer의 시각 구조 유지.
- MCP instructions/discovery와 Clotho 작성 가이드·검증 경고로 재발 방지.
- 조선 전기 World Revision 9의 반복 면책문구 제거, 유용한 역사 설명의 primary 재분류, 필요한 특정 주석 분리. 기존 사실·관계·시간 좌표는 바꾸지 않는다.

## 검증 및 종료

계약·도메인·이력 보존·idempotency·주석 표시 회귀, 전체 unit/typecheck/lint, CI PostgreSQL/build/mobile/secret scan을 수행한다. PR 병합 후 Railway 세 서비스 SHA, 공개 health/status/smoke를 확인한다. fresh World Revision을 읽어 정정 계획을 validate/commit하고 Publication과 이전 Revision을 비교한다. 모바일에서 본문과 접힌 주석·출처를 확인한다. 경고 검사는 편집 검토를 대체하지 않는 한계를 기록한다.
